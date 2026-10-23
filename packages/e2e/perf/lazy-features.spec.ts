import { writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BrowserContext,
  CDPSession,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const DEFAULT_RUNS = 3;
const READY_TIMEOUT_MS = 30_000;
const requestedRuns = Number.parseInt(
  process.env.LAZY_FEATURES_PERFORMANCE_RUNS ?? "",
  10
);
const RUNS = requestedRuns > 0 ? requestedRuns : DEFAULT_RUNS;
const SUPER_ADMIN_STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../.auth/super_admin.json"
);

const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

const MOBILE = {
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  viewport: { height: 844, width: 390 },
} as const;

type Phase = "first" | "repeat";
type ScenarioName =
  | "books-balance-summary"
  | "books-income-expenditure"
  | "income-record-contribution";

type BrowserMetrics = {
  active: {
    armedAt: number;
    clickAt: number | null;
    timeOrigin: number;
  } | null;
};

type Diagnostic = {
  message: string;
  name: string;
};

type Sample = {
  armToClickMs: number;
  clickToReadyMs: number;
  pageErrors: Diagnostic[];
  phase: Phase;
  run: number;
  scenario: ScenarioName;
};

type ContributionProfileMarks = {
  animationCount: number;
  animationsSettledAt: number;
  animationsTimedOut: boolean;
  clickAt: number;
  clickToAnimationsSettledMs: number;
  clickToControlsReadyMs: number;
  clickToSecondRafMs: number;
  controlsReadyAt: number;
  controlsReadyToFirstRafMs: number;
  firstRafAt: number;
  firstRafToSecondRafMs: number;
  prefersReducedMotion: boolean;
  secondRafAt: number;
  secondRafToAnimationsSettledMs: number;
  timeOrigin: number;
};

type ContributionProfileProbe = {
  cancel: () => void;
  ready: Promise<ContributionProfileMarks>;
};

type ContributionProfileSummary = ContributionProfileMarks & {
  cpuProfile: string;
  motion: "normal" | "reduced-motion";
  phase: Phase;
  trace: string;
};

const CONTRIBUTION_PROFILE_MARKS = {
  animationsSettled: "contribution-profile:animations-settled",
  click: "contribution-profile:click",
  controlsReady: "contribution-profile:controls-ready",
  firstRaf: "contribution-profile:first-raf",
  secondRaf: "contribution-profile:second-raf",
} as const;

const CONTRIBUTION_TRACE_CATEGORIES = [
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "loading",
  "v8",
  "v8.execute",
];

function diagnostic(error: unknown): Diagnostic {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error), name: "Error" };
}

async function installMetrics(context: BrowserContext) {
  await context.addInitScript(() => {
    const metrics: BrowserMetrics = { active: null };
    Object.defineProperty(window, "__lazyFeaturesBenchmark", {
      configurable: false,
      value: metrics,
      writable: false,
    });

    window.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (
          metrics.active?.clickAt === null &&
          target instanceof Element &&
          target.closest("button")
        ) {
          metrics.active.clickAt = event.timeStamp;
        }
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

async function waitForSettledContent(page: Page) {
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

async function armMeasurement(page: Page) {
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __lazyFeaturesBenchmark: BrowserMetrics }
    ).__lazyFeaturesBenchmark;
    metrics.active = {
      armedAt: performance.now(),
      clickAt: null,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function finishMeasurement(page: Page) {
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __lazyFeaturesBenchmark: BrowserMetrics }
    ).__lazyFeaturesBenchmark;
    const active = metrics.active;
    if (!active || active.clickAt === null) {
      throw new Error("The measured control click was not observed");
    }
    if (active.timeOrigin !== performance.timeOrigin) {
      throw new Error("The measured interaction replaced the document");
    }
    metrics.active = null;
    return {
      armToClickMs: active.clickAt - active.armedAt,
      clickToReadyMs: performance.now() - active.clickAt,
    };
  });
}

async function measureInteraction({
  control,
  page,
  pageErrors,
  phase,
  ready,
  run,
  scenario,
}: {
  control: Locator;
  page: Page;
  pageErrors: Diagnostic[];
  phase: Phase;
  ready: () => Promise<void>;
  run: number;
  scenario: ScenarioName;
}): Promise<Sample> {
  await armMeasurement(page);
  await control.tap();
  await ready();
  const timing = await finishMeasurement(page);
  return { ...timing, pageErrors: [...pageErrors], phase, run, scenario };
}

async function openReadyContributionDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Record contribution" });
  await expect(
    dialog.getByRole("combobox", { exact: true, name: "Donor" })
  ).toHaveAttribute("aria-required", "true", { timeout: READY_TIMEOUT_MS });
  await expect(
    dialog.getByRole("textbox", { name: "Amount (₹)" })
  ).toHaveAttribute("aria-required", "true", { timeout: READY_TIMEOUT_MS });
  await expect(
    dialog.getByRole("button", { exact: true, name: "Save contribution" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
}

async function closeContributionDialog(page: Page, trigger: Locator) {
  const dialog = page.getByRole("dialog", { name: "Record contribution" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: READY_TIMEOUT_MS });
  await expect(trigger).toBeFocused({ timeout: READY_TIMEOUT_MS });
}

async function waitForIncomeExpenditure(page: Page) {
  await expect(page.getByTestId("income-expenditure")).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("tab", { exact: true, name: "By account head" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
}

async function waitForBalanceSummary(page: Page) {
  const summary = page.getByTestId("balance-summary");
  await expect(summary).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(summary.getByText("Assets", { exact: true })).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(summary.getByText("Funds", { exact: true })).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await waitForSettledContent(page);
}

async function prepareRoute(page: Page, scenario: ScenarioName) {
  const pathname = scenario.startsWith("books-") ? "/finance/books" : "/income";
  await page.goto(pathname, { waitUntil: "domcontentloaded" });
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  await expect(
    page.getByRole("heading", {
      exact: true,
      name: pathname === "/income" ? "Income" : "Books",
    })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
}

async function runScenario(
  page: Page,
  pageErrors: Diagnostic[],
  run: number,
  scenario: ScenarioName
): Promise<Sample[]> {
  await prepareRoute(page, scenario);
  const samples: Sample[] = [];

  if (scenario === "income-record-contribution") {
    const trigger = page.getByRole("button", {
      exact: true,
      name: "Record contribution",
    });
    for (const phase of ["first", "repeat"] as const) {
      samples.push(
        await measureInteraction({
          control: trigger,
          page,
          pageErrors,
          phase,
          ready: () => openReadyContributionDialog(page),
          run,
          scenario,
        })
      );
      await closeContributionDialog(page, trigger);
    }
    return samples;
  }

  const cashTab = page.getByRole("tab", { exact: true, name: "Cash book" });
  const targetTab = page.getByRole("tab", {
    exact: true,
    name:
      scenario === "books-income-expenditure"
        ? "Income & expenditure"
        : "Balance summary",
  });
  const ready =
    scenario === "books-income-expenditure"
      ? () => waitForIncomeExpenditure(page)
      : () => waitForBalanceSummary(page);

  for (const phase of ["first", "repeat"] as const) {
    samples.push(
      await measureInteraction({
        control: targetTab,
        page,
        pageErrors,
        phase,
        ready,
        run,
        scenario,
      })
    );
    await cashTab.tap();
    await expect(cashTab).toHaveAttribute("aria-selected", "true", {
      timeout: READY_TIMEOUT_MS,
    });
    await waitForSettledContent(page);
  }
  return samples;
}

async function armContributionProfileProbe(page: Page) {
  await page.evaluate((marks) => {
    const profileWindow = window as typeof window & {
      __contributionProfileProbe?: ContributionProfileProbe;
    };
    profileWindow.__contributionProfileProbe?.cancel();
    for (const mark of Object.values(marks)) {
      performance.clearMarks(mark);
    }

    let cancelled = false;
    let controlsReady = false;
    let observer: MutationObserver | undefined;
    let removeClickListener = () => {};

    const cancel = () => {
      cancelled = true;
      observer?.disconnect();
      removeClickListener();
    };
    const ready = new Promise<ContributionProfileMarks>((resolve) => {
      const clickListener = (event: MouseEvent) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        if (target?.textContent?.trim() === "Record contribution") {
          performance.mark(marks.click);
        }
      };
      window.addEventListener("click", clickListener, {
        capture: true,
        once: true,
      });
      removeClickListener = () =>
        window.removeEventListener("click", clickListener, { capture: true });

      const checkReady = () => {
        if (cancelled || controlsReady) {
          return;
        }
        const dialog = document.querySelector<HTMLElement>(
          '[role="dialog"][data-open]'
        );
        const titleId = dialog?.getAttribute("aria-labelledby");
        const title = titleId ? document.getElementById(titleId) : null;
        const donor = dialog?.querySelector<HTMLElement>(
          '#partyId[role="combobox"][aria-required="true"]'
        );
        const amount = dialog?.querySelector<HTMLElement>(
          '#amount[aria-required="true"]'
        );
        const save = [...(dialog?.querySelectorAll("button") ?? [])].find(
          (button) => button.textContent?.trim() === "Save contribution"
        );
        if (
          !dialog ||
          title?.textContent?.trim() !== "Record contribution" ||
          !donor ||
          !amount ||
          !save
        ) {
          return;
        }
        const readyDialog = dialog;

        controlsReady = true;
        observer?.disconnect();
        performance.mark(marks.controlsReady);
        requestAnimationFrame(() => {
          performance.mark(marks.firstRaf);
          requestAnimationFrame(async () => {
            performance.mark(marks.secondRaf);
            const animations = readyDialog
              .getAnimations({ subtree: true })
              .filter((animation) =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime)
              );
            let animationsTimedOut = false;
            let animationTimeout: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              Promise.allSettled(
                animations.map((animation) => animation.finished)
              ),
              new Promise<void>((resolveAnimationWait) => {
                animationTimeout = setTimeout(() => {
                  animationsTimedOut = true;
                  resolveAnimationWait();
                }, 1000);
              }),
            ]);
            clearTimeout(animationTimeout);
            performance.mark(marks.animationsSettled);
            const startTime = (name: string) =>
              performance.getEntriesByName(name, "mark").at(-1)?.startTime;
            const animationsSettledAt = startTime(marks.animationsSettled);
            const clickAt = startTime(marks.click);
            const controlsReadyAt = startTime(marks.controlsReady);
            const firstRafAt = startTime(marks.firstRaf);
            const secondRafAt = startTime(marks.secondRaf);
            if (
              animationsSettledAt === undefined ||
              clickAt === undefined ||
              controlsReadyAt === undefined ||
              firstRafAt === undefined ||
              secondRafAt === undefined
            ) {
              throw new Error("Contribution profile marks were not recorded");
            }
            removeClickListener();
            resolve({
              animationCount: animations.length,
              animationsSettledAt,
              animationsTimedOut,
              clickAt,
              clickToAnimationsSettledMs: animationsSettledAt - clickAt,
              clickToControlsReadyMs: controlsReadyAt - clickAt,
              clickToSecondRafMs: secondRafAt - clickAt,
              controlsReadyAt,
              controlsReadyToFirstRafMs: firstRafAt - controlsReadyAt,
              firstRafAt,
              firstRafToSecondRafMs: secondRafAt - firstRafAt,
              prefersReducedMotion: matchMedia(
                "(prefers-reduced-motion: reduce)"
              ).matches,
              secondRafAt,
              secondRafToAnimationsSettledMs: animationsSettledAt - secondRafAt,
              timeOrigin: performance.timeOrigin,
            });
          });
        });
      };

      observer = new MutationObserver(checkReady);
      observer.observe(document.body, { childList: true, subtree: true });
      checkReady();
    });

    profileWindow.__contributionProfileProbe = { cancel, ready };
  }, CONTRIBUTION_PROFILE_MARKS);
}

async function waitForContributionProfileProbe(page: Page) {
  return await page.evaluate(async () => {
    const probe = (
      window as typeof window & {
        __contributionProfileProbe?: ContributionProfileProbe;
      }
    ).__contributionProfileProbe;
    if (!probe) {
      throw new Error("Contribution profile probe was not armed");
    }
    return await probe.ready;
  });
}

async function startContributionTrace(session: CDPSession) {
  await session.send("Tracing.start", {
    traceConfig: {
      includedCategories: CONTRIBUTION_TRACE_CATEGORIES,
      recordMode: "recordContinuously",
    },
    transferMode: "ReturnAsStream",
  });
}

async function stopContributionTrace(session: CDPSession) {
  const completed = new Promise<string>((resolve, reject) => {
    session.once("Tracing.tracingComplete", async ({ stream }) => {
      if (!stream) {
        reject(new Error("Contribution trace completed without a stream"));
        return;
      }
      try {
        const chunks: string[] = [];
        let eof = false;
        while (!eof) {
          const chunk = await session.send("IO.read", { handle: stream });
          chunks.push(
            chunk.base64Encoded
              ? Buffer.from(chunk.data, "base64").toString("utf8")
              : chunk.data
          );
          eof = chunk.eof === true;
        }
        await session.send("IO.close", { handle: stream });
        resolve(chunks.join(""));
      } catch (error) {
        reject(error);
      }
    });
  });
  await session.send("Tracing.end");
  return await completed;
}

async function attachJson(
  testInfo: TestInfo,
  filename: string,
  contents: string
) {
  const outputPath = testInfo.outputPath(filename);
  await writeFile(outputPath, contents);
  await testInfo.attach(filename, {
    contentType: "application/json",
    path: outputPath,
  });
}

test("profile contribution dialog mount", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.LAZY_FEATURES_PROFILE !== "true",
    "Opt-in diagnostic; profiling is separate from reported latency samples"
  );
  test.setTimeout(240_000);
  expect(baseURL, "The profile requires the E2E base URL").toBeTruthy();

  const summary: ContributionProfileSummary[] = [];
  for (const motion of ["normal", "reduced-motion"] as const) {
    const context = await browser.newContext({
      baseURL,
      ...MOBILE,
      reducedMotion: motion === "reduced-motion" ? "reduce" : "no-preference",
      storageState: SUPER_ADMIN_STORAGE_STATE,
    });
    try {
      const page = await context.newPage();
      await configureThrottling(context, page);
      await prepareRoute(page, "income-record-contribution");
      const trigger = page.getByRole("button", {
        exact: true,
        name: "Record contribution",
      });
      await expect(trigger).toBeVisible({ timeout: READY_TIMEOUT_MS });
      const session = await context.newCDPSession(page);
      await session.send("Profiler.enable");
      await session.send("Profiler.setSamplingInterval", { interval: 1000 });

      try {
        for (const phase of ["first", "repeat"] as const) {
          const triggerBox = await trigger.boundingBox();
          expect(
            triggerBox,
            "The contribution trigger must be on screen"
          ).not.toBeNull();
          await armContributionProfileProbe(page);
          await startContributionTrace(session);
          await session.send("Profiler.start");

          let profile: unknown;
          let trace: string;
          try {
            const ready = waitForContributionProfileProbe(page);
            await page.touchscreen.tap(
              triggerBox!.x + triggerBox!.width / 2,
              triggerBox!.y + triggerBox!.height / 2
            );
            const marks = await ready;
            ({ profile } = await session.send("Profiler.stop"));
            trace = await stopContributionTrace(session);

            const filenamePrefix =
              motion === "normal"
                ? `contribution-${phase}`
                : `contribution-reduced-motion-${phase}`;
            const cpuProfile = `${filenamePrefix}.cpuprofile`;
            const traceFilename = `${filenamePrefix}.trace.json`;
            await attachJson(testInfo, cpuProfile, JSON.stringify(profile));
            await attachJson(testInfo, traceFilename, trace);
            summary.push({
              ...marks,
              cpuProfile,
              motion,
              phase,
              trace: traceFilename,
            });
          } catch (error) {
            await session.send("Profiler.stop").catch(() => undefined);
            await stopContributionTrace(session).catch(() => undefined);
            throw error;
          }

          await closeContributionDialog(page, trigger);
        }
      } finally {
        await session.detach();
      }
    } finally {
      await context.close();
    }
  }

  await attachJson(
    testInfo,
    "contribution-profile-summary.json",
    JSON.stringify(
      {
        methodology: {
          cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
          marks: CONTRIBUTION_PROFILE_MARKS,
          note: "Trace and CPU files are diagnostic only. Compare click, controls-ready, both animation frames and animations-settled; Playwright readiness polling runs after recording stops.",
          viewport: MOBILE.viewport,
        },
        samples: summary,
      },
      null,
      2
    )
  );
});

test("measure first-use lazy feature interactions", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.LAZY_FEATURES_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(600_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const samples: Sample[] = [];
  const runErrors: Array<{
    error: Diagnostic;
    pageErrors: Diagnostic[];
    run: number;
    scenario: ScenarioName;
  }> = [];
  const browserErrors: Array<{
    errors: Diagnostic[];
    run: number;
    scenario: ScenarioName;
  }> = [];
  const scenarios: ScenarioName[] = [
    "income-record-contribution",
    "books-income-expenditure",
    "books-balance-summary",
  ];

  for (const scenario of scenarios) {
    for (let run = 1; run <= RUNS; run += 1) {
      const context = await browser.newContext({
        baseURL,
        ...MOBILE,
        storageState: SUPER_ADMIN_STORAGE_STATE,
      });
      context.setDefaultTimeout(READY_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
      const pageErrors: Diagnostic[] = [];
      try {
        await installMetrics(context);
        const page = await context.newPage();
        page.on("pageerror", (error) => pageErrors.push(diagnostic(error)));
        await configureThrottling(context, page);
        const measured = await runScenario(page, pageErrors, run, scenario);
        samples.push(...measured);
        console.log(
          `[lazy-features] ${scenario} run=${run} ${measured
            .map(
              (sample) =>
                `${sample.phase}=${Math.round(sample.clickToReadyMs)}ms`
            )
            .join(" ")}`
        );
      } catch (error) {
        runErrors.push({ error: diagnostic(error), pageErrors, run, scenario });
      } finally {
        if (pageErrors.length > 0) {
          browserErrors.push({ errors: pageErrors, run, scenario });
        }
        await context.close();
      }
    }
  }

  const report = {
    methodology: {
      cacheEnabled: true,
      clickStart:
        "Capture-phase click Event.timeStamp in the browser, excluding Playwright's pre-click actionability work.",
      network: THROTTLING,
      readiness:
        "Actual labelled form controls or route-specific tab content are visible, all visible skeletons are gone, fonts are ready, and two animation frames have passed.",
      runs: RUNS,
      viewport: MOBILE,
    },
    browserErrors,
    runErrors,
    samples,
  };
  const reportPath = testInfo.outputPath("lazy-features.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("lazy-features.json", {
    contentType: "application/json",
    path: reportPath,
  });

  expect(
    runErrors,
    "Lazy-feature benchmark failures are recorded in lazy-features.json"
  ).toHaveLength(0);
  expect(
    browserErrors,
    "Lazy-feature interactions produced uncaught page errors"
  ).toHaveLength(0);
});
