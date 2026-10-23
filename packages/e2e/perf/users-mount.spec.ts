import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BrowserContext,
  CDPSession,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const READY_TIMEOUT_MS = 30_000;
const RUNS_PER_VIEWPORT = 3;
const SEEDED_ADMIN_EMAIL = "test-admin@pi-dash.test";
const OUTPUT_DIR = path.resolve(
  import.meta.dirname,
  `../../../tmp/web-vitals/followup/${process.env.PERFORMANCE_LABEL ?? "current"}`
);
const SUPER_ADMIN_STORAGE = path.resolve(
  import.meta.dirname,
  "../.auth/super_admin.json"
);

const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

const VIEWPORTS = [
  {
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    name: "desktop",
    viewport: { height: 900, width: 1440 },
  },
  {
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    name: "mobile",
    viewport: { height: 844, width: 390 },
  },
] as const;

type ViewportName = (typeof VIEWPORTS)[number]["name"];

type TimingResult = {
  armedToClickMs: number;
  clickToReadyMs: number;
  eventTiming: {
    entryCount: number;
    interactionCount: number;
    maxDurationMs: number | null;
    slowestEvent: {
      inputDelayMs: number;
      name: string;
      presentationDelayMs: number;
      processingDurationMs: number;
    } | null;
  };
  label: string;
  longTasks: {
    count: number;
    maxDurationMs: number;
    totalDurationMs: number;
  } | null;
  readyAt: number;
  timeOrigin: number;
};

type RunResult = {
  first: TimingResult;
  pageErrors: Array<{ message: string; name: string }>;
  profile: string;
  profiledRepeat: TimingResult;
  repeat: TimingResult;
  run: number;
  timeline: string;
  viewport: ViewportName;
};

async function installUsersReadinessObserver(context: BrowserContext) {
  await context.addInitScript(() => {
    type TimedEntry = {
      duration: number;
      interactionId?: number;
      name: string;
      processingEnd?: number;
      processingStart?: number;
      startTime: number;
    };
    type ActiveMeasurement = {
      armedAt: number;
      clickAt: number | null;
      inputAt: number | null;
      label: string;
      resolve: (value: unknown) => void;
      settling: boolean;
    };

    const eventEntries: TimedEntry[] = [];
    const longTasks: TimedEntry[] = [];
    const supported = new Set(PerformanceObserver.supportedEntryTypes);
    let active: ActiveMeasurement | null = null;
    let readyPromise: Promise<unknown> | null = null;

    if (supported.has("event")) {
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          const entry = item as PerformanceEventTiming;
          eventEntries.push({
            duration: entry.duration,
            interactionId: entry.interactionId,
            name: entry.name,
            processingEnd: entry.processingEnd,
            processingStart: entry.processingStart,
            startTime: entry.startTime,
          });
        }
      }).observe({
        buffered: true,
        durationThreshold: 16,
        type: "event",
      } as PerformanceObserverInit);
    }

    if (supported.has("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            duration: entry.duration,
            name: entry.name,
            startTime: entry.startTime,
          });
        }
      }).observe({ buffered: true, type: "longtask" });
    }

    const usersReady = () => {
      if (location.pathname !== "/users") return false;
      const heading = [...document.querySelectorAll("h1, h2")].find(
        (element) => element.textContent?.trim() === "Users"
      );
      const search = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search users..."]'
      );
      const visibleRows = [...document.querySelectorAll("tbody > tr")].filter(
        (row) => (row as HTMLElement).offsetParent !== null
      );
      const populatedRow = visibleRows.some(
        (row) => (row.textContent?.trim().length ?? 0) > 0
      );
      return Boolean(heading && search && populatedRow);
    };

    const finishWhenReady = () => {
      if (!active || active.settling || !usersReady()) return;
      active.settling = true;
      const completing = active;
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Let buffered Event Timing entries for the presenting frame arrive.
            setTimeout(() => {
              if (active !== completing) return;
              const readyAt = performance.now();
              const inputAt = completing.inputAt;
              const clickAt = completing.clickAt;
              if (inputAt === null || clickAt === null) {
                completing.resolve({ error: "input-not-observed" });
                active = null;
                return;
              }
              const intervalEvents = eventEntries.filter(
                (entry) =>
                  entry.startTime >= inputAt && entry.startTime <= readyAt
              );
              const interactions = new Map<number, number>();
              for (const entry of intervalEvents) {
                if (entry.interactionId && entry.interactionId > 0) {
                  interactions.set(
                    entry.interactionId,
                    Math.max(
                      interactions.get(entry.interactionId) ?? 0,
                      entry.duration
                    )
                  );
                }
              }
              const slowest = intervalEvents
                .filter((entry) => (entry.interactionId ?? 0) > 0)
                .reduce<TimedEntry | null>(
                  (current, entry) =>
                    !current || entry.duration > current.duration
                      ? entry
                      : current,
                  null
                );
              const intervalLongTasks = longTasks.filter(
                (entry) =>
                  entry.startTime <= readyAt &&
                  entry.startTime + entry.duration >= clickAt
              );
              const interactionDurations = [...interactions.values()];
              completing.resolve({
                armedToClickMs: clickAt - completing.armedAt,
                clickToReadyMs: readyAt - clickAt,
                eventTiming: {
                  entryCount: intervalEvents.length,
                  interactionCount: interactions.size,
                  maxDurationMs:
                    interactionDurations.length > 0
                      ? Math.max(...interactionDurations)
                      : null,
                  slowestEvent:
                    slowest?.processingStart !== undefined &&
                    slowest.processingEnd !== undefined
                      ? {
                          inputDelayMs:
                            slowest.processingStart - slowest.startTime,
                          name: slowest.name,
                          presentationDelayMs: Math.max(
                            0,
                            slowest.startTime +
                              slowest.duration -
                              slowest.processingEnd
                          ),
                          processingDurationMs:
                            slowest.processingEnd - slowest.processingStart,
                        }
                      : null,
                },
                label: completing.label,
                longTasks: supported.has("longtask")
                  ? {
                      count: intervalLongTasks.length,
                      maxDurationMs:
                        intervalLongTasks.length > 0
                          ? Math.max(
                              ...intervalLongTasks.map(
                                (entry) => entry.duration
                              )
                            )
                          : 0,
                      totalDurationMs: intervalLongTasks.reduce(
                        (total, entry) => total + entry.duration,
                        0
                      ),
                    }
                  : null,
                readyAt,
                timeOrigin: performance.timeOrigin,
              });
              performance.mark(`explore-users:${completing.label}:ready`);
              active = null;
            }, 0);
          });
        });
      });
    };

    new MutationObserver(finishWhenReady).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    const captureInput = (event: Event) => {
      if (!active) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('a[href="/users"]')) {
        return;
      }
      if (event.type === "pointerdown" && active.inputAt === null) {
        active.inputAt = event.timeStamp;
        performance.mark(`explore-users:${active.label}:input`);
      }
      if (event.type === "click" && active.clickAt === null) {
        active.clickAt = event.timeStamp;
        performance.mark(`explore-users:${active.label}:click`);
      }
    };
    window.addEventListener("pointerdown", captureInput, { capture: true });
    window.addEventListener("click", captureInput, { capture: true });

    Object.defineProperty(window, "__exploreUsersMount", {
      configurable: false,
      value: {
        arm(label: string) {
          if (active) throw new Error("A Users measurement is already active");
          readyPromise = new Promise((resolve) => {
            active = {
              armedAt: performance.now(),
              clickAt: null,
              inputAt: null,
              label,
              resolve,
              settling: false,
            };
          });
          performance.mark(`explore-users:${label}:armed`);
        },
        async wait() {
          if (!readyPromise) throw new Error("Users measurement was not armed");
          const result = await readyPromise;
          readyPromise = null;
          return result;
        },
      },
      writable: false,
    });
  });
}

async function configureThrottling(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    connectionType: "cellular3g",
    downloadThroughput: THROTTLING.downloadBitsPerSecond / 8,
    latency: THROTTLING.latencyMs,
    offline: false,
    uploadThroughput: THROTTLING.uploadBitsPerSecond / 8,
  });
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: THROTTLING.cpuSlowdownMultiplier,
  });
}

async function waitForDashboard(page: Page) {
  await page.waitForURL((url) => url.pathname === "/", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Dashboard" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

async function navigationLink(
  page: Page,
  viewport: ViewportName,
  destination: "Dashboard" | "Users"
): Promise<Locator> {
  if (viewport === "desktop") {
    return page
      .locator('[data-sidebar="content"]')
      .getByRole("link", { exact: true, name: destination });
  }
  const navigation = page.getByRole("navigation", { name: "Main" });
  if (destination === "Users") {
    await navigation.getByRole("button", { name: "Menu" }).tap();
    const drawer = page.getByRole("dialog", { name: "Sidebar" });
    await expect(drawer).toBeVisible({ timeout: READY_TIMEOUT_MS });
    return drawer.getByRole("link", { exact: true, name: "Users" });
  }
  return navigation.getByRole("link", { exact: true, name: "Home" });
}

function activate(locator: Locator, viewport: ViewportName) {
  return viewport === "mobile" ? locator.tap() : locator.click();
}

async function measureUsersNavigation(
  page: Page,
  viewport: ViewportName,
  label: string
): Promise<TimingResult> {
  const usersLink = await navigationLink(page, viewport, "Users");
  await page.evaluate((measurementLabel) => {
    (
      window as typeof window & {
        __exploreUsersMount: { arm: (label: string) => void };
      }
    ).__exploreUsersMount.arm(measurementLabel);
  }, label);
  const ready = page.evaluate(async () => {
    return await (
      window as typeof window & {
        __exploreUsersMount: { wait: () => Promise<unknown> };
      }
    ).__exploreUsersMount.wait();
  });
  await activate(usersLink, viewport);
  const result = (await ready) as TimingResult | { error: string };
  if ("error" in result) throw new Error(result.error);
  if (
    result.timeOrigin !== (await page.evaluate(() => performance.timeOrigin))
  ) {
    throw new Error("Users navigation replaced the document");
  }
  return result;
}

async function returnToDashboard(page: Page, viewport: ViewportName) {
  await activate(await navigationLink(page, viewport, "Dashboard"), viewport);
  await waitForDashboard(page);
}

async function readTraceStream(session: CDPSession, stream: string) {
  let trace = "";
  while (true) {
    const chunk = await session.send("IO.read", { handle: stream });
    trace += chunk.base64Encoded
      ? Buffer.from(chunk.data, "base64").toString("utf8")
      : chunk.data;
    if (chunk.eof) break;
  }
  await session.send("IO.close", { handle: stream });
  return trace;
}

async function captureProfiledRepeat({
  page,
  run,
  testInfo,
  viewport,
}: {
  page: Page;
  run: number;
  testInfo: TestInfo;
  viewport: ViewportName;
}) {
  const usersLink = await navigationLink(page, viewport, "Users");
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Tracing.start", {
    traceConfig: {
      includedCategories: [
        "blink.user_timing",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.frame",
        "disabled-by-default-devtools.timeline.stack",
        "v8",
        "v8.execute",
      ],
      recordMode: "recordContinuously",
    },
    transferMode: "ReturnAsStream",
  });
  await session.send("Profiler.start");

  const label = `profile-${viewport}-${run}`;
  await page.evaluate((measurementLabel) => {
    (
      window as typeof window & {
        __exploreUsersMount: { arm: (label: string) => void };
      }
    ).__exploreUsersMount.arm(measurementLabel);
  }, label);
  const ready = page.evaluate(async () => {
    return await (
      window as typeof window & {
        __exploreUsersMount: { wait: () => Promise<unknown> };
      }
    ).__exploreUsersMount.wait();
  });
  await activate(usersLink, viewport);
  const timing = (await ready) as TimingResult | { error: string };
  if ("error" in timing) throw new Error(timing.error);

  const { profile } = await session.send("Profiler.stop");
  const tracingComplete = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Tracing did not provide an output stream")),
      READY_TIMEOUT_MS
    );
    session.once("Tracing.tracingComplete", ({ stream }) => {
      clearTimeout(timeout);
      if (!stream) {
        reject(new Error("Tracing completed without an output stream"));
        return;
      }
      resolve(stream);
    });
  });
  await session.send("Tracing.end");
  const timeline = await readTraceStream(session, await tracingComplete);
  await session.send("Profiler.disable");
  await session.detach();

  const profileName = `users-mount-${viewport}-${run}.cpuprofile`;
  const timelineName = `users-mount-${viewport}-${run}.trace.json`;
  const profilePath = testInfo.outputPath(profileName);
  const timelinePath = testInfo.outputPath(timelineName);
  const profileJson = JSON.stringify(profile);
  await Promise.all([
    writeFile(profilePath, profileJson),
    writeFile(timelinePath, timeline),
    writeFile(path.join(OUTPUT_DIR, profileName), profileJson),
    writeFile(path.join(OUTPUT_DIR, timelineName), timeline),
  ]);
  await testInfo.attach(profileName, {
    contentType: "application/json",
    path: profilePath,
  });
  await testInfo.attach(timelineName, {
    contentType: "application/json",
    path: timelinePath,
  });
  return { profileName, timelineName, timing };
}

function redactError(error: Error) {
  return {
    message: error.message
      .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?[redacted-query]"),
    name: error.name,
  };
}

test("profile current cached Users mount", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.USERS_MOUNT_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in current-build Users mount diagnostic"
  );
  test.setTimeout(900_000);
  expect(baseURL, "The diagnostic requires the E2E base URL").toBeTruthy();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results: RunResult[] = [];
  for (const viewport of VIEWPORTS) {
    for (let run = 1; run <= RUNS_PER_VIEWPORT; run += 1) {
      const context = await browser.newContext({
        baseURL,
        deviceScaleFactor: viewport.deviceScaleFactor,
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        storageState: SUPER_ADMIN_STORAGE,
        viewport: viewport.viewport,
      });
      context.setDefaultTimeout(READY_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
      const pageErrors: RunResult["pageErrors"] = [];
      try {
        await installUsersReadinessObserver(context);
        const page = await context.newPage();
        page.on("pageerror", (error) => pageErrors.push(redactError(error)));
        await configureThrottling(context, page);

        await page.goto("/", { waitUntil: "domcontentloaded" });
        expect(
          await page.evaluate(
            () =>
              typeof (
                window as typeof window & {
                  __exploreUsersMount?: { arm?: unknown };
                }
              ).__exploreUsersMount?.arm
          )
        ).toBe("function");
        await waitForDashboard(page);
        await page.waitForTimeout(10_000);

        const first = await measureUsersNavigation(
          page,
          viewport.name,
          `first-${viewport.name}-${run}`
        );
        await returnToDashboard(page, viewport.name);
        const repeat = await measureUsersNavigation(
          page,
          viewport.name,
          `repeat-${viewport.name}-${run}`
        );
        await returnToDashboard(page, viewport.name);

        const profiled = await captureProfiledRepeat({
          page,
          run,
          testInfo,
          viewport: viewport.name,
        });

        await expect(
          page.getByRole("heading", { exact: true, name: "Users" })
        ).toBeVisible();
        const search = page.getByPlaceholder("Search users...");
        await search.fill(SEEDED_ADMIN_EMAIL);
        await expect(page.getByText(SEEDED_ADMIN_EMAIL)).toBeVisible();
        const row = page
          .getByRole("row")
          .filter({ hasText: SEEDED_ADMIN_EMAIL });
        await expect(row.getByText("Admin", { exact: true })).toBeVisible();
        expect(pageErrors).toEqual([]);

        results.push({
          first,
          pageErrors,
          profile: profiled.profileName,
          profiledRepeat: profiled.timing,
          repeat,
          run,
          timeline: profiled.timelineName,
          viewport: viewport.name,
        });
      } finally {
        await context.close();
      }
    }
  }

  const report = {
    methodology: {
      cache:
        "enabled; first Users visit populates the authenticated-session cache",
      cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
      idleBeforeFirstVisitMs: 10_000,
      network: THROTTLING,
      note: "First and repeat timings are unprofiled. CPU profiles and timelines cover a separate cached repeat click.",
      readiness:
        "In-page MutationObserver: /users, heading, search and at least one populated visible tbody row, then fonts and two animation frames. The seeded admin row and role are asserted after profiling.",
      runsPerViewport: RUNS_PER_VIEWPORT,
    },
    results,
  };
  const reportPath = path.join(OUTPUT_DIR, "users-mount.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("users-mount.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});
