import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const DEFAULT_RUNS = 3;
const HOVER_LEAD_IN_MS = 500;
const READY_TIMEOUT_MS = 30_000;
const SEED_CLAIM_TITLE = "E2E Seed Reimbursement";
const requestedRuns = Number.parseInt(
  process.env.CLAIMS_NAVIGATION_PERFORMANCE_RUNS ?? "",
  10
);
const RUNS = requestedRuns > 0 ? requestedRuns : DEFAULT_RUNS;
const FINANCE_ADMIN_STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../.auth/finance_admin.json"
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

const DESKTOP = {
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  viewport: { height: 900, width: 1440 },
} as const;

type Phase = "first" | "repeat";
type Scenario = "desktop-hover" | "desktop-immediate" | "mobile-tap";
type Step = "change-charged-to" | "claim-detail";

const SCENARIOS: ReadonlyArray<{
  contextOptions: typeof DESKTOP | typeof MOBILE;
  name: Scenario;
}> = [
  { contextOptions: MOBILE, name: "mobile-tap" },
  { contextOptions: DESKTOP, name: "desktop-immediate" },
  { contextOptions: DESKTOP, name: "desktop-hover" },
];

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
    intentAt: number | null;
    observeIntent: boolean;
    timeOrigin: number;
  } | null;
  resources: JavaScriptResource[];
  resourceSupported: boolean;
};

type JavaScriptAssetTiming = Omit<
  JavaScriptResource,
  "responseEnd" | "startTime"
> & {
  responseEndFromClickMs: number;
  startFromClickMs: number;
};

type Measurement = {
  armToClickMs: number;
  clickToReadyMs: number;
  intentLeadInMs: number | null;
  javaScriptAssets: {
    initiatedAfterClick: JavaScriptAssetTiming[];
    initiatedBeforeClick: JavaScriptAssetTiming[];
  } | null;
  phase: Phase;
  scenario: Scenario;
  startedJavaScriptBytes: number | null;
  step: Step;
};

type RunMeasurement = Measurement & { run: number };

type Diagnostic = {
  message: string;
  name: string;
};

function diagnostic(error: unknown): Diagnostic {
  const redact = (value: string) =>
    value
      .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?[redacted-query]");
  if (error instanceof Error) {
    return { message: redact(error.message), name: redact(error.name) };
  }
  return { message: redact(String(error)), name: "Error" };
}

function percentile75(values: number[]): number | null {
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.75) - 1] ?? null;
}

function summarize(measurements: Measurement[]) {
  const groups = new Map<string, Measurement[]>();
  for (const measurement of measurements) {
    const key = `${measurement.scenario}:${measurement.phase}:${measurement.step}`;
    groups.set(key, [...(groups.get(key) ?? []), measurement]);
  }
  return [...groups.entries()].map(([key, samples]) => {
    const first = samples.at(0);
    if (!first) {
      throw new Error(`Summary group ${key} has no samples`);
    }
    const startedBytes = samples.flatMap((sample) =>
      sample.startedJavaScriptBytes === null
        ? []
        : [sample.startedJavaScriptBytes]
    );
    return {
      armToClickMs: samples.map((sample) => sample.armToClickMs),
      armToClickP75Ms: percentile75(
        samples.map((sample) => sample.armToClickMs)
      ),
      clickToReadyMs: samples.map((sample) => sample.clickToReadyMs),
      clickToReadyP75Ms: percentile75(
        samples.map((sample) => sample.clickToReadyMs)
      ),
      key,
      phase: first.phase,
      intentLeadInMs: samples.flatMap((sample) =>
        sample.intentLeadInMs === null ? [] : [sample.intentLeadInMs]
      ),
      intentLeadInP75Ms: percentile75(
        samples.flatMap((sample) =>
          sample.intentLeadInMs === null ? [] : [sample.intentLeadInMs]
        )
      ),
      samples: samples.length,
      scenario: first.scenario,
      startedJavaScriptBytes: startedBytes,
      startedJavaScriptBytesP75: percentile75(startedBytes),
      step: first.step,
    };
  });
}

async function installObservers(context: BrowserContext) {
  await context.addInitScript(() => {
    performance.setResourceTimingBufferSize(1000);
    const supported = new Set(PerformanceObserver.supportedEntryTypes);
    const metrics: BrowserMetrics = {
      active: null,
      resources: [],
      resourceSupported: supported.has("resource"),
    };

    Object.defineProperty(window, "__claimsNavigationBenchmark", {
      configurable: false,
      value: metrics,
      writable: false,
    });

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
            // Resource names that are not URLs cannot identify an app asset.
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

    window.addEventListener(
      "pointerover",
      (event) => {
        if (
          metrics.active?.observeIntent === true &&
          metrics.active.intentAt === null &&
          event.target instanceof Element
        ) {
          metrics.active.intentAt = event.timeStamp;
        }
      },
      { capture: true }
    );

    window.addEventListener(
      "click",
      (event) => {
        if (
          metrics.active?.clickAt === null &&
          event.target instanceof Element
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

async function waitForClaimsList(page: Page): Promise<Locator> {
  await page.waitForURL((url) => url.pathname === "/reimbursements", {
    timeout: READY_TIMEOUT_MS,
  });
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  await expect(
    page.getByRole("heading", { exact: true, name: "Reimbursements" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(page.getByPlaceholder("Search reimbursements...")).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  const row = page
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: SEED_CLAIM_TITLE });
  await expect(row).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
  return row;
}

async function waitForClaimDetail(page: Page): Promise<Locator> {
  await page.waitForURL(/\/reimbursements\/[0-9a-f-]{36}$/, {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: SEED_CLAIM_TITLE,
    })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  const chargedTo = page.getByRole("region", { name: "Charged to" });
  await expect(chargedTo).toContainText("Event", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    chargedTo.getByRole("button", { exact: true, name: "Change" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
  return chargedTo;
}

async function waitForChangeDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", {
    exact: true,
    name: "Change what this is charged to",
  });
  await expect(dialog).toBeVisible({ timeout: READY_TIMEOUT_MS });
  const event = dialog.getByRole("combobox", { exact: true, name: "Event" });
  await expect(event).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(event).not.toHaveValue("", { timeout: READY_TIMEOUT_MS });
  await expect(
    dialog.getByRole("button", { exact: true, name: "Save charge" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
  return dialog;
}

async function armMeasurement(page: Page, observeIntent: boolean) {
  await page.evaluate((shouldObserveIntent) => {
    const metrics = (
      window as typeof window & {
        __claimsNavigationBenchmark: BrowserMetrics;
      }
    ).__claimsNavigationBenchmark;
    metrics.active = {
      armedAt: performance.now(),
      clickAt: null,
      intentAt: null,
      observeIntent: shouldObserveIntent,
      timeOrigin: performance.timeOrigin,
    };
  }, observeIntent);
}

async function finishMeasurement(page: Page) {
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __claimsNavigationBenchmark: BrowserMetrics;
      }
    ).__claimsNavigationBenchmark;
    const active = metrics.active;
    if (!active || active.clickAt === null) {
      throw new Error("The measured click was not observed");
    }
    if (active.timeOrigin !== performance.timeOrigin) {
      throw new Error("The measured interaction replaced the document");
    }

    const readyAt = performance.now();
    const resources = metrics.resources.filter(
      (resource) =>
        resource.startTime >= active.armedAt && resource.startTime <= readyAt
    );
    const assetTiming = (resource: JavaScriptResource) => ({
      encodedBodyBytes: resource.encodedBodyBytes,
      filename: resource.filename,
      initiatorType: resource.initiatorType,
      responseEndFromClickMs: resource.responseEnd - active.clickAt!,
      startFromClickMs: resource.startTime - active.clickAt!,
      transferBytes: resource.transferBytes,
    });
    const initiatedAfterClick = resources
      .filter((resource) => resource.startTime >= active.clickAt!)
      .map(assetTiming);
    const initiatedBeforeClick = resources
      .filter((resource) => resource.startTime < active.clickAt!)
      .map(assetTiming);

    metrics.active = null;
    return {
      armToClickMs: active.clickAt - active.armedAt,
      clickToReadyMs: readyAt - active.clickAt,
      intentLeadInMs:
        active.intentAt === null ? null : active.clickAt - active.intentAt,
      javaScriptAssets: metrics.resourceSupported
        ? { initiatedAfterClick, initiatedBeforeClick }
        : null,
      startedJavaScriptBytes: metrics.resourceSupported
        ? initiatedAfterClick.reduce(
            (total, asset) => total + asset.encodedBodyBytes,
            0
          )
        : null,
    };
  });
}

async function measureInteraction({
  activate,
  page,
  phase,
  ready,
  scenario,
  step,
}: {
  activate: () => Promise<void>;
  page: Page;
  phase: Phase;
  ready: () => Promise<void>;
  scenario: Scenario;
  step: Step;
}): Promise<Measurement> {
  await armMeasurement(page, scenario !== "mobile-tap");
  await activate();
  await ready();
  return { ...(await finishMeasurement(page)), phase, scenario, step };
}

async function activate(
  page: Page,
  locator: Locator,
  scenario: Scenario
): Promise<void> {
  if (scenario === "mobile-tap") {
    await locator.tap();
    return;
  }
  if (scenario === "desktop-hover") {
    await locator.hover();
    await page.waitForTimeout(HOVER_LEAD_IN_MS);
  }
  await locator.click();
}

async function claimsNavigationLink(
  page: Page,
  scenario: Scenario
): Promise<Locator> {
  if (scenario === "mobile-tap") {
    return page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { exact: true, name: "Claims" });
  }
  return page
    .locator('[data-sidebar="content"]')
    .getByRole("link", { exact: true, name: "Reimbursements" });
}

async function runSequence(
  page: Page,
  scenario: Scenario
): Promise<Measurement[]> {
  const measurements: Measurement[] = [];
  let row = await waitForClaimsList(page);

  for (const phase of ["first", "repeat"] as const) {
    let chargedTo: Locator | null = null;
    measurements.push(
      await measureInteraction({
        activate: () => activate(page, row, scenario),
        page,
        phase,
        ready: async () => {
          chargedTo = await waitForClaimDetail(page);
        },
        scenario,
        step: "claim-detail",
      })
    );
    if (!chargedTo) {
      throw new Error("The Charged to card did not become ready");
    }

    let dialog: Locator | null = null;
    measurements.push(
      await measureInteraction({
        activate: () =>
          activate(
            page,
            chargedTo!.getByRole("button", { name: "Change" }),
            scenario
          ),
        page,
        phase,
        ready: async () => {
          dialog = await waitForChangeDialog(page);
        },
        scenario,
        step: "change-charged-to",
      })
    );
    if (!dialog) {
      throw new Error("The Change charged-to dialog did not become ready");
    }
    await activate(
      page,
      dialog.getByRole("button", { exact: true, name: "Cancel" }),
      scenario === "mobile-tap" ? scenario : "desktop-immediate"
    );
    await expect(dialog).toBeHidden({ timeout: READY_TIMEOUT_MS });

    const claimsLink = await claimsNavigationLink(page, scenario);
    await activate(
      page,
      claimsLink,
      scenario === "mobile-tap" ? scenario : "desktop-immediate"
    );
    row = await waitForClaimsList(page);
  }

  return measurements;
}

test("measure Claims detail and charged-to interactions", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.CLAIMS_NAVIGATION_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark, invoked once from the super_admin project"
  );
  test.setTimeout(600_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const measurements: RunMeasurement[] = [];
  const browserErrors: Array<{
    errors: Diagnostic[];
    run: number;
    scenario: Scenario;
  }> = [];
  const runErrors: Array<{
    error: Diagnostic;
    pageErrors: Diagnostic[];
    run: number;
    scenario: Scenario;
  }> = [];

  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= RUNS; run += 1) {
      const context = await browser.newContext({
        baseURL,
        ...scenario.contextOptions,
        storageState: FINANCE_ADMIN_STORAGE_STATE,
      });
      context.setDefaultTimeout(READY_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
      const pageErrors: Diagnostic[] = [];
      try {
        await installObservers(context);
        const page = await context.newPage();
        page.on("pageerror", (error) => pageErrors.push(diagnostic(error)));
        await configureThrottling(context, page);
        await page.goto("/reimbursements", { waitUntil: "domcontentloaded" });
        const samples = await runSequence(page, scenario.name);
        measurements.push(...samples.map((sample) => ({ ...sample, run })));
        console.log(
          `[claims-navigation] scenario=${scenario.name} run=${run} ${samples
            .map(
              (sample) =>
                `${sample.phase}:${sample.step}=${Math.round(sample.clickToReadyMs)}ms/${sample.startedJavaScriptBytes ?? "unsupported"}B`
            )
            .join(" ")}`
        );
      } catch (error) {
        runErrors.push({
          error: diagnostic(error),
          pageErrors,
          run,
          scenario: scenario.name,
        });
      } finally {
        if (pageErrors.length > 0) {
          browserErrors.push({
            errors: pageErrors,
            run,
            scenario: scenario.name,
          });
        }
        await context.close();
      }
    }
  }

  const report = {
    methodology: {
      actor: "finance_admin",
      cacheEnabled: true,
      clickStart:
        "Capture-phase click Event.timeStamp in the browser, excluding Playwright actionability work.",
      intentLeadIn:
        "For both desktop scenarios, capture-phase pointerover Event.timeStamp to click Event.timeStamp. Desktop-immediate has no deliberate wait, so this exposes any lead-in introduced by click actionability.",
      knownLimits: [
        "The stable seed claim is owned by the super admin, so finance_admin measures the non-owner Change permission path.",
        "Readiness includes Playwright assertion, polling and browser round-trip overhead.",
        "With three samples, nearest-rank p75 is the maximum and is not a field percentile.",
        "Resource Timing encoded body sizes can be zero for cached assets.",
      ],
      hoverLeadInMs: HOVER_LEAD_IN_MS,
      network: THROTTLING,
      readiness:
        "Detail requires the seeded title, hydrated Charged to card and visible Change action. The editor requires its populated Event combobox and Save charge action. Both require no visible skeletons, ready fonts and two animation frames.",
      runs: RUNS,
      scenarios: SCENARIOS.map((scenario) => ({
        name: scenario.name,
        viewport: scenario.contextOptions,
      })),
      seedClaim: SEED_CLAIM_TITLE,
      startedJavaScriptBytes:
        "Sum of Resource Timing encodedBodySize for /assets/*.js whose startTime is at or after the captured click and before readiness.",
    },
    browserErrors,
    measurements,
    runErrors,
    summary: summarize(measurements),
  };
  const reportPath = testInfo.outputPath("claims-navigation.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("claims-navigation.json", {
    contentType: "application/json",
    path: reportPath,
  });

  expect(
    runErrors,
    "Claims benchmark failures are recorded in claims-navigation.json"
  ).toHaveLength(0);
  expect(
    browserErrors,
    "Claims benchmark interactions produced uncaught page errors"
  ).toHaveLength(0);
});

test("claim row remains keyboard activatable", async ({ baseURL, browser }) => {
  test.skip(
    process.env.CLAIMS_NAVIGATION_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark, invoked once from the super_admin project"
  );
  test.setTimeout(120_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const context = await browser.newContext({
    baseURL,
    ...DESKTOP,
    storageState: FINANCE_ADMIN_STORAGE_STATE,
  });
  context.setDefaultTimeout(READY_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
  try {
    const page = await context.newPage();
    await page.goto("/reimbursements", { waitUntil: "domcontentloaded" });
    const row = await waitForClaimsList(page);

    await row.focus();
    await expect(row).toBeFocused();
    await expect(page).toHaveURL(/\/reimbursements\/?$/);

    await page.keyboard.press("Enter");
    await waitForClaimDetail(page);
  } finally {
    await context.close();
  }
});
