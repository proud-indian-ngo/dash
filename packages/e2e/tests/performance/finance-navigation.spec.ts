import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const RUNS = 3;
const READY_TIMEOUT_MS = 30_000;
const SUPER_ADMIN_STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../../.auth/super_admin.json"
);
const NAVIGATION_IDLE_WAIT_MS = (() => {
  const raw =
    process.env.FINANCE_NAVIGATION_IDLE_WAIT_MS ??
    process.env.NAVIGATION_IDLE_WAIT_MS;
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
      `Finance navigation idle wait must be a finite nonnegative integer, received ${JSON.stringify(raw)}`
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

const DESTINATIONS = ["Income", "Books"] as const;

type Destination = (typeof DESTINATIONS)[number];
type Phase = "first" | "repeat";
type ViewportName = (typeof VIEWPORTS)[number]["name"];

type BrowserMetrics = {
  active: {
    armedAt: number;
    clickAt: number | null;
    timeOrigin: number;
  } | null;
};

type JavaScriptAsset = {
  encodedBodyBytes: number;
  filename: string;
  startTime: number;
  transferBytes: number;
};

type JavaScriptSnapshot = {
  count: number;
  totalEncodedBodyBytes: number;
  totalTransferBytes: number;
};

type Diagnostic = {
  message: string;
  name: string;
};

type Measurement = {
  armToClickMs: number;
  clickToReadyMs: number;
  destination: Destination;
  phase: Phase;
  postClickJavaScriptAssets: JavaScriptSnapshot & {
    assets: JavaScriptAsset[];
  };
  sameDocumentTimeOrigin: boolean;
  timeOrigin: number;
};

type RunResult = {
  destination: Destination;
  initialTimeOrigin: number;
  measurements: Measurement[];
  pageErrors: Diagnostic[];
  preNavigationJavaScriptAssets: JavaScriptSnapshot;
  run: number;
  viewport: ViewportName;
};

function diagnostic(error: unknown): Diagnostic {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const redact = (value: string) =>
    value
      .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?[redacted-query]");
  return {
    message: redact(normalized.message),
    name: redact(normalized.name),
  };
}

async function installMetrics(context: BrowserContext) {
  await context.addInitScript(() => {
    const metrics: BrowserMetrics = { active: null };
    Object.defineProperty(window, "__financeNavigationBenchmark", {
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
          target.closest("a[href]")
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
  await waitForSettledContent(page);
}

async function waitForIncome(page: Page) {
  await page.waitForURL((url) => url.pathname === "/income", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Income" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(
    page.getByPlaceholder("Search donor or reference...")
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(
    page.getByText("E2E Seed Donor", { exact: true }).first()
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
}

async function waitForBooksCashBook(page: Page) {
  await page.waitForURL((url) => url.pathname === "/finance/books", {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { exact: true, name: "Books" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(
    page.getByRole("tab", { exact: true, name: "Cash book" })
  ).toHaveAttribute("aria-selected", "true", { timeout: READY_TIMEOUT_MS });
  await expect(
    page.getByTestId("books-account").filter({ hasText: "E2E Bank Account" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  const cashBook = page.getByTestId("cash-book");
  await expect(cashBook).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(
    cashBook.getByText("Opening balance", { exact: true })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(cashBook.getByText("Money in", { exact: true })).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    cashBook.getByPlaceholder("Search details or reference...")
  ).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await waitForSettledContent(page);
}

async function navigationLink(
  page: Page,
  viewport: ViewportName,
  destination: Destination | "Dashboard"
): Promise<Locator> {
  if (viewport === "desktop") {
    return page
      .locator('[data-sidebar="content"]')
      .getByRole("link", { exact: true, name: destination });
  }
  const mainNavigation = page.getByRole("navigation", { name: "Main" });
  if (destination === "Dashboard") {
    return mainNavigation.getByRole("link", { exact: true, name: "Home" });
  }
  await mainNavigation.getByRole("button", { name: "Menu" }).tap();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible({ timeout: READY_TIMEOUT_MS });
  return drawer.getByRole("link", { exact: true, name: destination });
}

async function armMeasurement(page: Page) {
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __financeNavigationBenchmark: BrowserMetrics;
      }
    ).__financeNavigationBenchmark;
    metrics.active = {
      armedAt: performance.now(),
      clickAt: null,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function finishMeasurement(
  page: Page,
  destination: Destination,
  phase: Phase
): Promise<Measurement> {
  return await page.evaluate(
    ({ measuredDestination, measuredPhase }) => {
      const metrics = (
        window as typeof window & {
          __financeNavigationBenchmark: BrowserMetrics;
        }
      ).__financeNavigationBenchmark;
      const active = metrics.active;
      if (!active || active.clickAt === null) {
        throw new Error("The measured navigation link click was not observed");
      }
      const readyAt = performance.now();
      const assets: JavaScriptAsset[] = performance
        .getEntriesByType("resource")
        .flatMap((item) => {
          const entry = item as PerformanceResourceTiming;
          try {
            const pathname = new URL(entry.name, location.href).pathname;
            if (!pathname.startsWith("/assets/") || !pathname.endsWith(".js")) {
              return [];
            }
            return [
              {
                encodedBodyBytes: entry.encodedBodySize,
                filename: pathname.split("/").at(-1) ?? pathname,
                startTime: entry.startTime,
                transferBytes: entry.transferSize,
              },
            ];
          } catch {
            return [];
          }
        })
        .filter(
          (asset) =>
            asset.startTime >= active.clickAt! && asset.startTime <= readyAt
        );
      metrics.active = null;
      return {
        armToClickMs: active.clickAt - active.armedAt,
        clickToReadyMs: readyAt - active.clickAt,
        destination: measuredDestination,
        phase: measuredPhase,
        postClickJavaScriptAssets: {
          assets,
          count: assets.length,
          totalEncodedBodyBytes: assets.reduce(
            (total, asset) => total + asset.encodedBodyBytes,
            0
          ),
          totalTransferBytes: assets.reduce(
            (total, asset) => total + asset.transferBytes,
            0
          ),
        },
        sameDocumentTimeOrigin: active.timeOrigin === performance.timeOrigin,
        timeOrigin: performance.timeOrigin,
      };
    },
    { measuredDestination: destination, measuredPhase: phase }
  );
}

async function measureNavigation(
  page: Page,
  viewport: ViewportName,
  destination: Destination,
  phase: Phase
) {
  const link = await navigationLink(page, viewport, destination);
  await armMeasurement(page);
  if (viewport === "mobile") {
    await link.tap();
  } else {
    await link.click();
  }
  if (destination === "Income") {
    await waitForIncome(page);
  } else {
    await waitForBooksCashBook(page);
  }
  return await finishMeasurement(page, destination, phase);
}

async function returnToDashboard(page: Page, viewport: ViewportName) {
  const link = await navigationLink(page, viewport, "Dashboard");
  if (viewport === "mobile") {
    await link.tap();
  } else {
    await link.click();
  }
  await waitForDashboard(page);
}

test("measure first and repeat finance navigation", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.FINANCE_NAVIGATION_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev" ||
      testInfo.project.name !== "super_admin",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(900_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const results: RunResult[] = [];
  const runErrors: Array<{
    destination: Destination;
    error: Diagnostic;
    pageErrors: Diagnostic[];
    run: number;
    viewport: ViewportName;
  }> = [];

  for (const destination of DESTINATIONS) {
    for (const viewport of VIEWPORTS) {
      for (let run = 1; run <= RUNS; run += 1) {
        const context = await browser.newContext({
          baseURL,
          deviceScaleFactor: viewport.deviceScaleFactor,
          hasTouch: viewport.hasTouch,
          isMobile: viewport.isMobile,
          storageState: SUPER_ADMIN_STORAGE_STATE,
          viewport: viewport.viewport,
        });
        context.setDefaultTimeout(READY_TIMEOUT_MS);
        context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
        const pageErrors: Diagnostic[] = [];
        try {
          await installMetrics(context);
          const page = await context.newPage();
          page.on("pageerror", (error) => pageErrors.push(diagnostic(error)));
          await configureThrottling(context, page);
          await page.goto("/", { waitUntil: "domcontentloaded" });
          await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
          await waitForDashboard(page);
          if (NAVIGATION_IDLE_WAIT_MS > 0) {
            await page.waitForTimeout(NAVIGATION_IDLE_WAIT_MS);
          }
          const preNavigationJavaScriptAssets = await page.evaluate(() => {
            const assets = performance
              .getEntriesByType("resource")
              .flatMap((item) => {
                const entry = item as PerformanceResourceTiming;
                try {
                  const pathname = new URL(entry.name, location.href).pathname;
                  if (
                    !pathname.startsWith("/assets/") ||
                    !pathname.endsWith(".js")
                  ) {
                    return [];
                  }
                  return [entry];
                } catch {
                  return [];
                }
              });
            return {
              count: assets.length,
              totalEncodedBodyBytes: assets.reduce(
                (total, asset) => total + asset.encodedBodySize,
                0
              ),
              totalTransferBytes: assets.reduce(
                (total, asset) => total + asset.transferSize,
                0
              ),
            };
          });
          const initialTimeOrigin = await page.evaluate(
            () => performance.timeOrigin
          );
          const first = await measureNavigation(
            page,
            viewport.name,
            destination,
            "first"
          );
          await returnToDashboard(page, viewport.name);
          const repeat = await measureNavigation(
            page,
            viewport.name,
            destination,
            "repeat"
          );
          const result: RunResult = {
            destination,
            initialTimeOrigin,
            measurements: [first, repeat],
            pageErrors,
            preNavigationJavaScriptAssets,
            run,
            viewport: viewport.name,
          };
          results.push(result);
          console.log(
            `[finance-navigation] ${destination}/${viewport.name}/run-${run} first=${Math.round(first.clickToReadyMs)}ms repeat=${Math.round(repeat.clickToReadyMs)}ms pre-js=${preNavigationJavaScriptAssets.totalEncodedBodyBytes}B first-post-click-js=${first.postClickJavaScriptAssets.totalEncodedBodyBytes}B repeat-post-click-js=${repeat.postClickJavaScriptAssets.totalEncodedBodyBytes}B`
          );
        } catch (error) {
          runErrors.push({
            destination,
            error: diagnostic(error),
            pageErrors,
            run,
            viewport: viewport.name,
          });
        } finally {
          await context.close();
        }
      }
    }
  }

  const report = {
    methodology: {
      cacheEnabled: true,
      clickStart:
        "Capture-phase click Event.timeStamp in the browser, excluding Playwright's pre-click actionability work.",
      financeReadiness:
        "Income requires the populated seeded donor row. Books requires the default Cash book tab, seeded E2E Bank Account, summary values and search control. Visible skeletons must be gone, fonts ready and two animation frames complete.",
      navigationIdleWaitMs: NAVIGATION_IDLE_WAIT_MS,
      network: THROTTLING,
      role: "super_admin",
      runsPerDestinationAndViewport: RUNS,
      viewports: VIEWPORTS,
    },
    results,
    runErrors,
  };
  const reportPath = testInfo.outputPath("finance-navigation.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("finance-navigation.json", {
    contentType: "application/json",
    path: reportPath,
  });

  expect(
    runErrors,
    "Finance navigation failures are recorded in finance-navigation.json"
  ).toHaveLength(0);
  expect(
    results.flatMap((result) => result.pageErrors),
    "Finance navigation produced uncaught page errors"
  ).toHaveLength(0);
  expect(
    results
      .flatMap((result) => result.measurements)
      .every((measurement) => measurement.sameDocumentTimeOrigin),
    "Every measurement must preserve the dashboard document"
  ).toBe(true);
});
