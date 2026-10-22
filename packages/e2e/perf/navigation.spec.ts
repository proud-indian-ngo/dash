import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const RUNS_PER_ROLE_AND_VIEWPORT = 3;
const READY_TIMEOUT_MS = 30_000;
const EVENT_NAME = "E2E Upcoming Public Bangalore";
const NAVIGATION_IDLE_WAIT_MS = (() => {
  const raw = process.env.NAVIGATION_IDLE_WAIT_MS;
  if (raw === undefined) {
    return 0;
  }
  const value = Number(raw);
  if (
    raw.trim() === "" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `NAVIGATION_IDLE_WAIT_MS must be a finite nonnegative integer, received ${JSON.stringify(raw)}`
    );
  }
  return value;
})();

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

const ROLES = [
  {
    includeUsers: true,
    name: "super_admin",
    storageState: path.resolve(
      import.meta.dirname,
      "../.auth/super_admin.json"
    ),
  },
  {
    includeUsers: false,
    name: "volunteer",
    storageState: path.resolve(import.meta.dirname, "../.auth/volunteer.json"),
  },
] as const;

type Phase = "first" | "repeat";
type RoleName = (typeof ROLES)[number]["name"];
type ViewportName = (typeof VIEWPORTS)[number]["name"];

type TimedEntry = {
  duration: number;
  interactionId?: number;
  name: string;
  processingEnd?: number;
  processingStart?: number;
  startTime: number;
};

type JavaScriptResource = {
  encodedBodyBytes: number;
  filename: string;
  initiatorType: string;
  responseEnd: number;
  startTime: number;
  transferBytes: number;
};

type BrowserMetrics = {
  active: {
    armedAt: number;
    clickAt: number | null;
    inputAt: number | null;
    timeOrigin: number;
  } | null;
  eventEntries: TimedEntry[];
  eventSupported: boolean;
  longTasks: TimedEntry[];
  longtaskSupported: boolean;
  resources: JavaScriptResource[];
  resourceSupported: boolean;
};

type IntervalMetrics = {
  armToClickMs: number;
  clickToReadyMs: number;
  clickToTransitionSettledMs: number;
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
  javaScriptAssets: {
    initiatedAfterClick: JavaScriptAssetTiming[];
    initiatedBeforeClick: JavaScriptAssetTiming[];
  } | null;
  longTasks: {
    count: number;
    maxDurationMs: number;
    totalDurationMs: number;
  } | null;
  transitionActiveAtReady: boolean;
};

type JavaScriptAssetTiming = {
  encodedBodyBytes: number;
  filename: string;
  initiatorType: string;
  responseEndFromClickMs: number;
  startFromClickMs: number;
  transferBytes: number;
};

type Measurement = IntervalMetrics & {
  phase: Phase;
  step: string;
};

type JavaScriptAssetSnapshot = {
  count: number;
  totalEncodedBodyBytes: number;
  totalTransferBytes: number;
};

type RunResult = {
  filterMeasurements: Measurement[];
  measurements: Measurement[];
  pageErrorCount: number;
  pageErrors: Array<ReturnType<typeof pageErrorDiagnostic> & { route: string }>;
  preNavigationJavaScriptAssets: JavaScriptAssetSnapshot | null;
  role: RoleName;
  run: number;
  sameDocumentTimeOrigin: true;
  viewport: ViewportName;
};

async function installObservers(context: BrowserContext) {
  await context.addInitScript(() => {
    const supported = new Set(PerformanceObserver.supportedEntryTypes);
    const metrics: BrowserMetrics = {
      active: null,
      eventEntries: [],
      eventSupported: supported.has("event"),
      longTasks: [],
      longtaskSupported: supported.has("longtask"),
      resources: [],
      resourceSupported: supported.has("resource"),
    };

    Object.defineProperty(window, "__navigationBenchmark", {
      configurable: false,
      value: metrics,
      writable: false,
    });

    if (metrics.eventSupported) {
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          const entry = item as PerformanceEventTiming;
          metrics.eventEntries.push({
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

    if (metrics.longtaskSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTasks.push({
            duration: entry.duration,
            name: entry.name,
            startTime: entry.startTime,
          });
        }
      }).observe({ buffered: true, type: "longtask" });
    }

    if (metrics.resourceSupported) {
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          const entry = item as PerformanceResourceTiming;
          let filename: string | null = null;
          try {
            const pathname = new URL(entry.name, location.href).pathname;
            if (pathname.startsWith("/assets/") && pathname.endsWith(".js")) {
              filename = pathname.split("/").at(-1) ?? null;
            }
          } catch {
            // Unparseable resource names cannot identify an app asset.
          }
          if (filename) {
            metrics.resources.push({
              encodedBodyBytes: entry.encodedBodySize,
              filename,
              initiatorType: entry.initiatorType,
              responseEnd: entry.responseEnd,
              startTime: entry.startTime,
              transferBytes: entry.transferSize,
            });
          }
        }
      }).observe({ buffered: true, type: "resource" });
    }

    const captureInput = (event: Event) => {
      const target = event.target;
      if (
        metrics.active &&
        target instanceof Element &&
        target.closest("a[href], button")
      ) {
        if (event.type === "pointerdown" && metrics.active.inputAt === null) {
          metrics.active.inputAt = event.timeStamp;
        }
        if (event.type === "click" && metrics.active.clickAt === null) {
          metrics.active.clickAt = event.timeStamp;
        }
      }
    };
    window.addEventListener("pointerdown", captureInput, { capture: true });
    window.addEventListener(
      "click",
      (event) => {
        captureInput(event);
      },
      { capture: true }
    );
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

async function waitForUsableContent(page: Page) {
  await page.locator("#main[data-zero-ready]").waitFor({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function waitForDashboard(page: Page) {
  await page.waitForURL((url) => url.pathname === "/", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Dashboard" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForUsableContent(page);
}

async function waitForEvents(page: Page) {
  await page.waitForURL((url) => url.pathname === "/events", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Events" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(page.getByPlaceholder("Search events...")).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("link", { exact: true, name: EVENT_NAME }).first()
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForUsableContent(page);
}

async function waitForEventDetail(page: Page) {
  await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: EVENT_NAME })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForUsableContent(page);
}

async function waitForReimbursements(page: Page) {
  await page.waitForURL((url) => url.pathname === "/reimbursements", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Reimbursements" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(page.getByPlaceholder("Search reimbursements...")).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await waitForUsableContent(page);
}

async function waitForUsers(page: Page) {
  await page.waitForURL((url) => url.pathname === "/users", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Users" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(page.getByPlaceholder("Search users...")).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await waitForUsableContent(page);
}

async function armMeasurement(page: Page) {
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __navigationBenchmark: BrowserMetrics }
    ).__navigationBenchmark;
    metrics.active = {
      armedAt: performance.now(),
      clickAt: null,
      inputAt: null,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function snapshotJavaScriptAssets(
  page: Page
): Promise<JavaScriptAssetSnapshot | null> {
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __navigationBenchmark: BrowserMetrics }
    ).__navigationBenchmark;
    if (!metrics.resourceSupported) {
      return null;
    }
    return {
      count: metrics.resources.length,
      totalEncodedBodyBytes: metrics.resources.reduce(
        (total, resource) => total + resource.encodedBodyBytes,
        0
      ),
      totalTransferBytes: metrics.resources.reduce(
        (total, resource) => total + resource.transferBytes,
        0
      ),
    };
  });
}

async function finishMeasurement(page: Page): Promise<IntervalMetrics> {
  return await page.evaluate(async () => {
    const metrics = (
      window as typeof window & { __navigationBenchmark: BrowserMetrics }
    ).__navigationBenchmark;
    const active = metrics.active;
    if (!active || active.clickAt === null || active.inputAt === null) {
      throw new Error("The measured control click was not observed");
    }
    if (active.timeOrigin !== performance.timeOrigin) {
      throw new Error("Measured navigation replaced the document");
    }

    const readyAt = performance.now();
    if (!CSS.supports("selector(:active-view-transition)")) {
      throw new Error("The benchmark requires view-transition state support");
    }
    const transitionActive = () =>
      document.documentElement.matches(":active-view-transition");
    const transitionActiveAtReady = transitionActive();
    while (transitionActive()) {
      if (performance.now() - readyAt > 30_000) {
        throw new Error("The navigation view transition did not finish");
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
    const transitionSettledAt = performance.now();
    const intervalEvents = metrics.eventEntries.filter(
      (entry) =>
        entry.startTime >= active.inputAt! && entry.startTime <= readyAt
    );
    const interactionDurations = new Map<number, number>();
    for (const entry of intervalEvents) {
      if (entry.interactionId && entry.interactionId > 0) {
        interactionDurations.set(
          entry.interactionId,
          Math.max(
            interactionDurations.get(entry.interactionId) ?? 0,
            entry.duration
          )
        );
      }
    }
    const durations = [...interactionDurations.values()];
    const slowestEvent = intervalEvents
      .filter((entry) => (entry.interactionId ?? 0) > 0)
      .reduce<TimedEntry | null>(
        (slowest, entry) =>
          !slowest || entry.duration > slowest.duration ? entry : slowest,
        null
      );
    const longTasks = metrics.longTasks.filter(
      (entry) =>
        entry.startTime <= readyAt &&
        entry.startTime + entry.duration >= active.clickAt!
    );
    const assetTiming = (resource: JavaScriptResource) => ({
      encodedBodyBytes: resource.encodedBodyBytes,
      filename: resource.filename,
      initiatorType: resource.initiatorType,
      responseEndFromClickMs: resource.responseEnd - active.clickAt!,
      startFromClickMs: resource.startTime - active.clickAt!,
      transferBytes: resource.transferBytes,
    });
    const resources = metrics.resources.filter(
      (resource) =>
        resource.startTime >= active.armedAt && resource.startTime <= readyAt
    );

    metrics.active = null;
    return {
      armToClickMs: active.clickAt - active.armedAt,
      clickToReadyMs: readyAt - active.clickAt,
      clickToTransitionSettledMs: transitionSettledAt - active.clickAt,
      eventTiming: {
        entryCount: intervalEvents.length,
        interactionCount: interactionDurations.size,
        maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
        slowestEvent:
          slowestEvent?.processingStart !== undefined &&
          slowestEvent.processingEnd !== undefined
            ? {
                inputDelayMs:
                  slowestEvent.processingStart - slowestEvent.startTime,
                name: slowestEvent.name,
                presentationDelayMs: Math.max(
                  0,
                  slowestEvent.startTime +
                    slowestEvent.duration -
                    slowestEvent.processingEnd
                ),
                processingDurationMs:
                  slowestEvent.processingEnd - slowestEvent.processingStart,
              }
            : null,
      },
      javaScriptAssets: metrics.resourceSupported
        ? {
            initiatedAfterClick: resources
              .filter((resource) => resource.startTime >= active.clickAt!)
              .map(assetTiming),
            initiatedBeforeClick: resources
              .filter((resource) => resource.startTime < active.clickAt!)
              .map(assetTiming),
          }
        : null,
      longTasks: metrics.longtaskSupported
        ? {
            count: longTasks.length,
            maxDurationMs:
              longTasks.length > 0
                ? Math.max(...longTasks.map((entry) => entry.duration))
                : 0,
            totalDurationMs: longTasks.reduce(
              (total, entry) => total + entry.duration,
              0
            ),
          }
        : null,
      transitionActiveAtReady,
    };
  });
}

async function measureNavigation({
  click,
  page,
  phase,
  ready,
  step,
}: {
  click: () => Promise<void>;
  page: Page;
  phase: Phase;
  ready: () => Promise<void>;
  step: string;
}): Promise<Measurement> {
  console.log(`[navigation] ${phase}:${step}`);
  await armMeasurement(page);
  await click();
  await ready();
  return { ...(await finishMeasurement(page)), phase, step };
}

async function navigationLink(
  page: Page,
  viewport: ViewportName,
  destination: "Dashboard" | "Events" | "Reimbursements" | "Users"
): Promise<Locator> {
  if (viewport === "desktop") {
    return page
      .locator('[data-sidebar="content"]')
      .getByRole("link", { exact: true, name: destination });
  }
  const mainNavigation = page.getByRole("navigation", { name: "Main" });
  if (destination === "Users") {
    await mainNavigation.getByRole("button", { name: "Menu" }).tap();
    const drawer = page.getByRole("dialog", { name: "Sidebar" });
    await expect(drawer).toBeVisible({ timeout: READY_TIMEOUT_MS });
    return drawer.getByRole("link", { exact: true, name: "Users" });
  }
  const mobileName =
    destination === "Dashboard"
      ? "Home"
      : destination === "Reimbursements"
        ? "Claims"
        : destination;
  return mainNavigation.getByRole("link", {
    exact: true,
    name: mobileName,
  });
}

async function measureFilterOpening(page: Page, viewport: ViewportName) {
  const activate = (control: Locator) =>
    viewport === "mobile" ? control.tap() : control.click();
  await activate(await navigationLink(page, viewport, "Reimbursements"));
  await waitForReimbursements(page);
  if (viewport === "mobile") {
    await activate(page.getByRole("button", { exact: true, name: "Filters" }));
  }
  const trigger = page.getByRole("button", {
    exact: true,
    name: viewport === "mobile" ? "Type Any" : "Filter by Type",
  });
  const measurements: Measurement[] = [];
  for (const phase of ["first", "repeat"] as const) {
    measurements.push(
      await measureNavigation({
        click: () => activate(trigger),
        page,
        phase,
        ready: async () => {
          await expect(
            page.getByRole("checkbox", { exact: true, name: "Reimbursement" })
          ).toBeVisible();
          await waitForUsableContent(page);
        },
        step: "open-type-filter",
      })
    );
    if (viewport === "mobile") {
      await activate(trigger);
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(
      page.getByRole("checkbox", { exact: true, name: "Reimbursement" })
    ).toBeHidden();
  }
  return measurements;
}

async function runRouteSequence(
  page: Page,
  viewport: ViewportName,
  role: (typeof ROLES)[number],
  phase: Phase
) {
  const measurements: Measurement[] = [];
  const activate = (link: Locator) =>
    viewport === "mobile" ? link.tap() : link.click();
  const eventsLink = await navigationLink(page, viewport, "Events");
  measurements.push(
    await measureNavigation({
      click: () => activate(eventsLink),
      page,
      phase,
      ready: () => waitForEvents(page),
      step: "dashboard-to-events",
    })
  );

  const eventLink = page
    .getByRole("link", { exact: true, name: EVENT_NAME })
    .first();
  measurements.push(
    await measureNavigation({
      click: () => activate(eventLink),
      page,
      phase,
      ready: () => waitForEventDetail(page),
      step: "events-to-event-detail",
    })
  );

  const eventsReturnLink =
    viewport === "mobile"
      ? await navigationLink(page, viewport, "Events")
      : page
          .getByRole("main")
          .getByRole("link", { exact: true, name: "Events" })
          .first();
  measurements.push(
    await measureNavigation({
      click: () => activate(eventsReturnLink),
      page,
      phase,
      ready: () => waitForEvents(page),
      step: "event-detail-to-events",
    })
  );

  const reimbursementsLink = await navigationLink(
    page,
    viewport,
    "Reimbursements"
  );
  measurements.push(
    await measureNavigation({
      click: () => activate(reimbursementsLink),
      page,
      phase,
      ready: () => waitForReimbursements(page),
      step: "events-to-reimbursements",
    })
  );

  if (role.includeUsers) {
    const usersLink = await navigationLink(page, viewport, "Users");
    measurements.push(
      await measureNavigation({
        click: () => activate(usersLink),
        page,
        phase,
        ready: () => waitForUsers(page),
        step: "reimbursements-to-users",
      })
    );
  }

  const dashboardLink = await navigationLink(page, viewport, "Dashboard");
  measurements.push(
    await measureNavigation({
      click: () => activate(dashboardLink),
      page,
      phase,
      ready: () => waitForDashboard(page),
      step: role.includeUsers
        ? "users-to-dashboard"
        : "reimbursements-to-dashboard",
    })
  );
  return measurements;
}

function percentile75(values: number[]) {
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.75) - 1] ?? null;
}

function pageErrorDiagnostic(error: Error) {
  const redact = (value: string) =>
    value
      .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?[redacted-query]");
  return {
    message: redact(error.message),
    name: redact(error.name),
  };
}

function summarize(results: RunResult[]) {
  const groups = new Map<string, Measurement[]>();
  for (const result of results) {
    for (const measurement of [
      ...result.measurements,
      ...result.filterMeasurements,
    ]) {
      const key = [
        result.role,
        result.viewport,
        measurement.phase,
        measurement.step,
      ].join(":");
      groups.set(key, [...(groups.get(key) ?? []), measurement]);
    }
  }
  return [...groups.entries()].map(([key, samples]) => ({
    clickToReadyMaxOf3P75Ms: percentile75(
      samples.map((sample) => sample.clickToReadyMs)
    ),
    clickToTransitionSettledMaxOf3P75Ms: percentile75(
      samples.map((sample) => sample.clickToTransitionSettledMs)
    ),
    eventTimingMaxOf3P75Ms: percentile75(
      samples.flatMap((sample) =>
        sample.eventTiming.maxDurationMs === null
          ? []
          : [sample.eventTiming.maxDurationMs]
      )
    ),
    key,
    longTaskMaxOf3P75Ms: percentile75(
      samples.flatMap((sample) =>
        sample.longTasks === null ? [] : [sample.longTasks.maxDurationMs]
      )
    ),
    sampleCount: samples.length,
  }));
}

test("measure in-app navigation", async ({ baseURL, browser }, testInfo) => {
  test.skip(
    process.env.NAVIGATION_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(900_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const results: RunResult[] = [];
  for (const role of ROLES) {
    for (const viewport of VIEWPORTS) {
      for (let run = 1; run <= RUNS_PER_ROLE_AND_VIEWPORT; run += 1) {
        const context = await browser.newContext({
          baseURL,
          deviceScaleFactor: viewport.deviceScaleFactor,
          hasTouch: viewport.hasTouch,
          isMobile: viewport.isMobile,
          storageState: role.storageState,
          viewport: viewport.viewport,
        });
        context.setDefaultTimeout(READY_TIMEOUT_MS);
        context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
        try {
          await installObservers(context);
          const page = await context.newPage();
          const pageErrors: RunResult["pageErrors"] = [];
          page.on("pageerror", (error) => {
            const diagnostic = pageErrorDiagnostic(error);
            const route = new URL(page.url()).pathname.replace(
              /\/events\/[^/]+/,
              "/events/:id"
            );
            pageErrors.push({ ...diagnostic, route });
            console.error(
              `[navigation] pageerror ${role.name}/${viewport.name}/run-${run} ${route}: ${diagnostic.name}: ${diagnostic.message}`
            );
          });
          await configureThrottling(context, page);

          await page.goto("/", { waitUntil: "domcontentloaded" });
          await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
          await waitForDashboard(page);
          // Optional quiet time measures how much route code idle warming can
          // prepare before the first interaction. Do not perform input here.
          if (NAVIGATION_IDLE_WAIT_MS > 0) {
            await page.waitForTimeout(NAVIGATION_IDLE_WAIT_MS);
          }
          const preNavigationJavaScriptAssets =
            await snapshotJavaScriptAssets(page);
          const initialTimeOrigin = await page.evaluate(
            () => performance.timeOrigin
          );
          const measurements = [
            ...(await runRouteSequence(page, viewport.name, role, "first")),
            ...(await runRouteSequence(page, viewport.name, role, "repeat")),
          ];
          if (
            process.env.NAVIGATION_PROFILE === "true" &&
            role.name === "super_admin"
          ) {
            const profiler = await context.newCDPSession(page);
            await profiler.send("Profiler.enable");
            await profiler.send("Profiler.start");
            const usersLink = await navigationLink(
              page,
              viewport.name,
              "Users"
            );
            if (viewport.name === "mobile") {
              await usersLink.tap();
            } else {
              await usersLink.click();
            }
            await waitForUsers(page);
            const { profile } = await profiler.send("Profiler.stop");
            await profiler.detach();
            const profileName = `users-${viewport.name}-${run}.cpuprofile`;
            const profilePath = testInfo.outputPath(profileName);
            await writeFile(profilePath, JSON.stringify(profile));
            await testInfo.attach(profileName, {
              contentType: "application/json",
              path: profilePath,
            });
          }
          const filterMeasurements = await measureFilterOpening(
            page,
            viewport.name
          );
          const finalTimeOrigin = await page.evaluate(
            () => performance.timeOrigin
          );
          const result: RunResult = {
            filterMeasurements,
            measurements,
            pageErrorCount: pageErrors.length,
            pageErrors,
            preNavigationJavaScriptAssets,
            role: role.name,
            run,
            sameDocumentTimeOrigin: true,
            viewport: viewport.name,
          };
          results.push(result);
          console.log(
            `[navigation] completed ${role.name}/${viewport.name}/run-${run}`
          );
          await testInfo.attach(
            `navigation-${role.name}-${viewport.name}-run-${run}.json`,
            {
              body: JSON.stringify(result, null, 2),
              contentType: "application/json",
            }
          );
          if (pageErrors.length > 0) {
            await testInfo.attach(
              `navigation-errors-${role.name}-${viewport.name}-run-${run}.json`,
              {
                body: JSON.stringify(
                  {
                    errors: pageErrors,
                    role: role.name,
                    run,
                    viewport: viewport.name,
                  },
                  null,
                  2
                ),
                contentType: "application/json",
              }
            );
          }
          expect(
            finalTimeOrigin,
            `${role.name}/${viewport.name}/run-${run} replaced the document`
          ).toBe(initialTimeOrigin);
        } finally {
          await context.close();
        }
      }
    }
  }

  const summary = summarize(results);
  const report = {
    methodology: {
      cacheEnabled: true,
      cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
      input:
        "Desktop uses mouse clicks; mobile uses touchscreen taps without a hover lead-in.",
      interactionMetric:
        "Maximum Event Timing duration per click-to-ready interval; null when the browser reports no qualifying interaction. This lab proxy is not field INP.",
      idleWaitMs: NAVIGATION_IDLE_WAIT_MS,
      idleWarming:
        "After dashboard and Zero readiness, the benchmark optionally waits without input before the first route sequence. This isolates code or data prepared by background idle work; the per-run preNavigationJavaScriptAssets snapshot records /assets/*.js observed by that point.",
      navigation:
        "Every measured transition uses a visible UI link. The initial dashboard goto is untimed; first and repeat route sequences share a context, so the repeat pass benefits from HTTP, module and Zero caches. Intent preloading immediately before click is preserved and reported separately from assets initiated after click.",
      network: {
        downloadBitsPerSecond: THROTTLING.downloadBitsPerSecond,
        latencyMs: THROTTLING.latencyMs,
        uploadBitsPerSecond: THROTTLING.uploadBitsPerSecond,
      },
      p75: "Nearest-rank p75 across three runs. With exactly three samples this is the maximum, not a real-user percentile.",
      readiness:
        "Destination URL and usable route-specific controls/content must be visible, no visible data-slot skeletons may remain, fonts must be ready, and two animation frames must pass. Each readiness assertion has a 30000 ms polling upper bound. Reported duration includes Playwright assertion, polling and browser round-trip overhead, so it is not an exact first-paint timestamp.",
      runsPerRoleAndViewport: RUNS_PER_ROLE_AND_VIEWPORT,
      sameDocumentInvariant:
        "performance.timeOrigin must remain unchanged for every measured navigation.",
      viewTransitions:
        "Click-to-ready excludes any remaining view transition; click-to-transition-settled additionally waits until :active-view-transition no longer matches, without a fixed delay.",
    },
    results,
    summary,
  };
  const reportPath = testInfo.outputPath("navigation.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("navigation-summary.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("navigation.json", {
    contentType: "application/json",
    path: reportPath,
  });

  for (const item of summary) {
    console.log(
      `[navigation] ${item.key} ready p75(max-of-3)=${item.clickToReadyMaxOf3P75Ms?.toFixed(0)}ms ` +
        `transition=${item.clickToTransitionSettledMaxOf3P75Ms?.toFixed(0)}ms ` +
        `event=${item.eventTimingMaxOf3P75Ms?.toFixed(0) ?? "missing"}ms`
    );
  }
  expect(
    results.reduce((total, result) => total + result.pageErrorCount, 0),
    "Navigation produced uncaught page errors; see the saved report"
  ).toBe(0);
});
