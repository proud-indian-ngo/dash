import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";

const RUNS = 3;
const READY_TIMEOUT_MS = 30_000;
const SETTLE_MS = 2_000;
const FIXTURE_YEAR = 2175;
const FIXTURE_REGISTERED = 10;
const execFileAsync = promisify(execFile);
const awardsHelperPath = path.resolve(
  import.meta.dirname,
  "../helpers/kalakriti-awards.ts"
);
const layoutHelperPath = path.resolve(
  import.meta.dirname,
  "../helpers/kalakriti-layout.ts"
);
const superAdminStorageState = path.resolve(
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

const SCENARIOS = [
  { eligible: 0, name: "empty-eligible" },
  { eligible: 10, name: "populated-eligible" },
] as const;

type LayoutShift = {
  startTimeMs: number;
  value: number;
};

type BrowserMetrics = {
  shifts: LayoutShift[];
  supported: boolean;
};

type Sample = {
  cls: number;
  eligible: number;
  registered: number;
  rowCount: number;
  run: number;
  shiftCount: number;
  shifts: LayoutShift[];
};

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function maximumSessionValue(entries: LayoutShift[]) {
  let maximum = 0;
  let sessionStart = 0;
  let previous = 0;
  let sessionValue = 0;
  for (const entry of entries) {
    if (
      sessionValue === 0 ||
      entry.startTimeMs - previous > 1_000 ||
      entry.startTimeMs - sessionStart > 5_000
    ) {
      sessionStart = entry.startTimeMs;
      sessionValue = entry.value;
    } else {
      sessionValue += entry.value;
    }
    previous = entry.startTimeMs;
    maximum = Math.max(maximum, sessionValue);
  }
  return round(maximum);
}

async function configureThrottling(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
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
  return session;
}

async function installObserver(context: BrowserContext) {
  await context.addInitScript(() => {
    type Shift = PerformanceEntry & {
      hadRecentInput: boolean;
      value: number;
    };
    const metrics: BrowserMetrics = {
      shifts: [],
      supported:
        PerformanceObserver.supportedEntryTypes.includes("layout-shift"),
    };
    Object.defineProperty(window, "__kalakritiLayoutMetrics", {
      configurable: false,
      value: metrics,
      writable: false,
    });
    if (!metrics.supported) return;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Shift[]) {
        if (entry.hadRecentInput) continue;
        metrics.shifts.push({
          startTimeMs: Math.round(entry.startTime * 1_000) / 1_000,
          value: Math.round(entry.value * 1_000_000) / 1_000_000,
        });
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
}

function statValue(page: Page, label: string) {
  return page
    .getByRole("group", { name: "Food counts" })
    .locator('[data-slot="stat-chip"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('[data-slot="stat-value"]');
}

async function waitForFood(page: Page, expectedEligible: number) {
  await expect(
    page.getByRole("heading", { exact: true, name: "Food" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await page.locator("#main[data-zero-ready]").waitFor({
    state: "attached",
    timeout: READY_TIMEOUT_MS,
  });
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(statValue(page, "Registered people")).toHaveText(
    String(FIXTURE_REGISTERED)
  );
  await expect(statValue(page, "Eligible for meals")).toHaveText(
    String(expectedEligible)
  );

  const rows = page.getByTestId("row-title");
  await expect(rows).toHaveCount(expectedEligible);
  if (expectedEligible === 0) {
    await expect(
      page.getByText("No eligible people in your Food scope.", { exact: true })
    ).toBeVisible();
  } else {
    await expect(page.getByRole("table")).toBeVisible();
  }
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ])
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function collectSample(
  page: Page,
  expectedEligible: number,
  run: number
) {
  const state = await page.evaluate(() => ({
    metrics: structuredClone(
      (
        window as typeof window & {
          __kalakritiLayoutMetrics: BrowserMetrics;
        }
      ).__kalakritiLayoutMetrics
    ),
    pathname: location.pathname,
  }));
  expect(state.pathname).toBe(`/kalakriti/${FIXTURE_YEAR}/food`);
  expect(state.metrics.supported).toBe(true);
  const [registered, eligible, rowCount] = await Promise.all([
    statValue(page, "Registered people").textContent(),
    statValue(page, "Eligible for meals").textContent(),
    page.getByTestId("row-title").count(),
  ]);
  expect(Number(registered)).toBe(FIXTURE_REGISTERED);
  expect(Number(eligible)).toBe(expectedEligible);
  expect(rowCount).toBe(expectedEligible);
  return {
    cls: maximumSessionValue(state.metrics.shifts),
    eligible: Number(eligible),
    registered: Number(registered),
    rowCount,
    run,
    shiftCount: state.metrics.shifts.length,
    shifts: state.metrics.shifts,
  } satisfies Sample;
}

test("measure Kalakriti Food layout stability with empty and populated eligible rosters", async ({
  baseURL,
  browser,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    process.env.KALAKRITI_LAYOUT_PERFORMANCE !== "true",
    "Opt-in Kalakriti layout benchmark on the isolated super_admin stack only"
  );
  test.setTimeout(300_000);
  expect(
    baseURL,
    "The layout benchmark requires the E2E base URL"
  ).toBeTruthy();
  const label = process.env.PERFORMANCE_LABEL;
  expect(label, "Set PERFORMANCE_LABEL to a short report label").toMatch(
    /^[a-zA-Z0-9_-]{1,60}$/
  );

  const { stdout } = await execFileAsync(
    "bun",
    ["run", awardsHelperPath, "setup", superAdminEmail],
    { env: process.env, killSignal: "SIGKILL", timeout: 60_000 }
  );
  const fixture = JSON.parse(stdout.trim()) as { year: number };
  expect(fixture.year).toBe(FIXTURE_YEAR);

  const results: Array<{
    eligible: number;
    name: (typeof SCENARIOS)[number]["name"];
    samples: Sample[];
  }> = [];
  try {
    for (const scenario of SCENARIOS) {
      if (scenario.eligible > 0) {
        const populated = await execFileAsync(
          "bun",
          ["run", layoutHelperPath, "populate", superAdminEmail],
          { env: process.env, killSignal: "SIGKILL", timeout: 60_000 }
        );
        expect(JSON.parse(populated.stdout.trim())).toEqual({ eligible: 10 });
      }
      const samples: Sample[] = [];
      for (let run = 1; run <= RUNS; run += 1) {
        const context = await browser.newContext({
          baseURL,
          ...MOBILE,
          storageState: superAdminStorageState,
        });
        try {
          await installObserver(context);
          const page = await context.newPage();
          const session = await configureThrottling(context, page);
          const response = await page.goto(`/kalakriti/${FIXTURE_YEAR}/food`, {
            timeout: READY_TIMEOUT_MS,
            waitUntil: "domcontentloaded",
          });
          expect(response?.status()).toBeLessThan(400);
          await waitForFood(page, scenario.eligible);
          const sample = await collectSample(page, scenario.eligible, run);
          samples.push(sample);
          console.log(
            `[kalakriti-layout] ${scenario.name} run=${run} CLS=${sample.cls} shifts=${sample.shiftCount}`
          );
          await session.detach();
        } finally {
          await context.close();
        }
      }
      results.push({ ...scenario, samples });
    }
  } finally {
    await execFileAsync("bun", ["run", awardsHelperPath, "cleanup"], {
      env: process.env,
      killSignal: "SIGKILL",
      timeout: 60_000,
    });
  }

  const report = {
    label,
    methodology: {
      cacheDisabled: true,
      cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
      fixture:
        "The Awards E2E fixture supplies six Students and four active Volunteers. The populated state adds pickup or check-in operations for all ten people.",
      network: {
        downloadBitsPerSecond: THROTTLING.downloadBitsPerSecond,
        latencyMs: THROTTLING.latencyMs,
        uploadBitsPerSecond: THROTTLING.uploadBitsPerSecond,
      },
      readiness:
        "Each sample requires exactly 10 registered people, the expected eligible count, the same number of eligible table rows, no visible skeletons and the empty-state message when applicable.",
      runsPerScenario: RUNS,
      sampleKind: "cold synthetic route startup",
      sessionWindow:
        "Maximum CLS session uses gaps over 1 second or a window over 5 seconds and excludes shifts with recent input.",
      viewport: "mobile 390x844 at 3x device scale factor",
    },
    results,
  };
  const reportPath = testInfo.outputPath("kalakriti-layout.json");
  const reportCopyPath = path.resolve(
    import.meta.dirname,
    `../../../tmp/web-vitals/followup/${label}/kalakriti-layout.json`
  );
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(reportPath, json);
  await mkdir(path.dirname(reportCopyPath), { recursive: true });
  await writeFile(reportCopyPath, json);
  await testInfo.attach("kalakriti-layout.json", {
    contentType: "application/json",
    path: reportPath,
  });
});
