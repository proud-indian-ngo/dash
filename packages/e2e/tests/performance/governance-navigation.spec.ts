import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, CDPSession, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const RUNS = 3;
const READY_TIMEOUT_MS = 30_000;
const LABEL = (process.env.GOVERNANCE_PERFORMANCE_LABEL ?? "unlabelled")
  .replace(/[^a-zA-Z0-9_-]+/g, "-")
  .slice(0, 60);
const STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../../.auth/super_admin.json"
);
const MEETING_ID = "01930000-0000-7000-8000-00000000d401";

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

const ROUTES = [
  {
    form: { button: "Add trustee", dialog: "Add trustee", field: "Legal name" },
    heading: "Trustee register",
    name: "register",
    path: "/governance",
    populatedText: "Asha Rao",
  },
  {
    heading: "Governance documents",
    name: "documents",
    path: "/governance/documents",
    populatedText: "Volunteer code of conduct (approved)",
  },
  {
    heading: "Trust deed",
    name: "deed",
    path: "/governance/deed",
    populatedText: "Version 2: Deed of amendment (planned), 2026",
  },
  {
    form: { button: "New circular", dialog: "New circular", field: "Title" },
    heading: "Resolutions",
    name: "resolutions",
    path: "/governance/resolutions",
    populatedText: "Approve the budget for 2027-28",
  },
  {
    form: { button: "New meeting", dialog: "New meeting", field: "Title" },
    heading: "Board meetings",
    name: "meetings",
    path: "/governance/meetings?when=past",
    populatedText: "Board meeting, October 2026",
  },
  {
    heading: "Board meeting, October 2026",
    name: "meeting-detail",
    path: `/governance/meetings/${MEETING_ID}`,
    populatedText: "1. Approve the budget for 2027-28",
  },
  {
    heading: "Compliance calendar",
    name: "compliance",
    path: "/governance/compliance",
    readyTestIdPrefix: "compliance-item-",
  },
  {
    heading: "Declarations of interests",
    name: "declarations",
    path: "/governance/declarations",
    populatedText: "Vikram Menon",
  },
  {
    form: { button: "New policy", dialog: "New policy", field: "Title" },
    heading: "Policies",
    name: "policies",
    path: "/governance/policies",
    populatedText: "Child-safeguarding policy",
  },
  {
    heading: "Registrations",
    name: "registrations",
    path: "/governance/registrations",
    readyControl: "Search registrations...",
  },
] as const;

const requestedRoutes = (process.env.GOVERNANCE_PERFORMANCE_ROUTES ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const unknownRoutes = requestedRoutes.filter(
  (name) => !ROUTES.some((route) => route.name === name)
);
if (unknownRoutes.length > 0) {
  throw new Error(
    `Unknown governance performance routes: ${unknownRoutes.join(", ")}`
  );
}
const SELECTED_ROUTES =
  requestedRoutes.length === 0
    ? ROUTES
    : ROUTES.filter((route) => requestedRoutes.includes(route.name));

type Asset = {
  encodedBodyBytes: number;
  filename: string;
  startTime: number;
  transferBytes: number;
};
type BrowserMetrics = {
  assets: Asset[];
  clickAt: number | null;
  shifts: Array<{
    sources: Array<{
      className: string;
      rect: { height: number; width: number; x: number; y: number };
      tagName: string;
      testId: string | null;
    }>;
    startTime: number;
    value: number;
  }>;
};
type Diagnostic = { message: string; name: string };

function diagnostic(error: unknown): Diagnostic {
  const value = error instanceof Error ? error : new Error(String(error));
  const redact = (text: string) =>
    text
      .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
      .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?[redacted-query]");
  return { message: redact(value.message), name: redact(value.name) };
}

async function installMetrics(context: BrowserContext) {
  await context.addInitScript(() => {
    const metrics: BrowserMetrics = { assets: [], clickAt: null, shifts: [] };
    Object.defineProperty(window, "__governancePerformance", {
      value: metrics,
      writable: false,
    });
    window.addEventListener(
      "click",
      (event) => {
        if (metrics.clickAt === null) metrics.clickAt = event.timeStamp;
      },
      { capture: true }
    );
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        const pathname = new URL(resource.name, location.href).pathname;
        if (pathname.startsWith("/assets/") && pathname.endsWith(".js")) {
          metrics.assets.push({
            encodedBodyBytes: resource.encodedBodySize,
            filename: pathname.split("/").at(-1) ?? pathname,
            startTime: resource.startTime,
            transferBytes: resource.transferSize,
          });
        }
      }
    }).observe({ buffered: true, type: "resource" });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          sources?: Array<{
            currentRect?: DOMRectReadOnly;
            node: Node | null;
          }>;
          value: number;
        };
        if (!shift.hadRecentInput && metrics.shifts.length < 50) {
          metrics.shifts.push({
            sources: (shift.sources ?? []).slice(0, 5).flatMap((source) => {
              if (!(source.node instanceof Element)) return [];
              const rect =
                source.currentRect ?? source.node.getBoundingClientRect();
              return [
                {
                  className: (source.node.getAttribute("class") ?? "").slice(
                    0,
                    200
                  ),
                  rect: {
                    height: Math.round(rect.height),
                    width: Math.round(rect.width),
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                  },
                  tagName: source.node.tagName,
                  testId:
                    source.node.getAttribute("data-testid")?.slice(0, 100) ??
                    null,
                },
              ];
            }),
            startTime: shift.startTime,
            value: shift.value,
          });
        }
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
}

async function configureThrottling(
  context: BrowserContext,
  page: Page
): Promise<CDPSession> {
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

async function waitUntilReady(page: Page, route: (typeof ROUTES)[number]) {
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: route.heading })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  if ("populatedText" in route) {
    await expect(
      page.getByText(route.populatedText, { exact: true }).first()
    ).toBeVisible();
  } else if ("readyTestIdPrefix" in route) {
    await page
      .locator(`[data-testid^="${route.readyTestIdPrefix}"]`)
      .first()
      .waitFor({ state: "attached" });
  } else {
    await expect(page.getByPlaceholder(route.readyControl)).toBeVisible();
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

function calculateCls(entries: BrowserMetrics["shifts"]) {
  let maximum = 0;
  let start = 0;
  let previous = 0;
  let value = 0;
  for (const entry of entries) {
    if (
      value === 0 ||
      entry.startTime - previous > 1_000 ||
      entry.startTime - start > 5_000
    ) {
      start = entry.startTime;
      value = entry.value;
    } else value += entry.value;
    previous = entry.startTime;
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

function javaScriptSnapshot(assets: Asset[]) {
  return {
    assets,
    count: assets.length,
    encodedBodyBytes: assets.reduce(
      (sum, asset) => sum + asset.encodedBodyBytes,
      0
    ),
    transferBytes: assets.reduce((sum, asset) => sum + asset.transferBytes, 0),
  };
}

test("measure cold governance routes and first form openings", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.GOVERNANCE_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev" ||
      testInfo.project.name !== "super_admin",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(900_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const samples: unknown[] = [];
  const runErrors: unknown[] = [];
  for (const route of SELECTED_ROUTES) {
    for (const viewport of VIEWPORTS) {
      for (let run = 1; run <= RUNS; run += 1) {
        const context = await browser.newContext({
          baseURL,
          deviceScaleFactor: viewport.deviceScaleFactor,
          hasTouch: viewport.hasTouch,
          isMobile: viewport.isMobile,
          storageState: STORAGE_STATE,
          viewport: viewport.viewport,
        });
        context.setDefaultTimeout(READY_TIMEOUT_MS);
        const pageErrors: Diagnostic[] = [];
        try {
          await installMetrics(context);
          const page = await context.newPage();
          page.on("pageerror", (error) => pageErrors.push(diagnostic(error)));
          const session = await configureThrottling(context, page);
          const startedAt = Date.now();
          await page.goto(route.path, { waitUntil: "domcontentloaded" });
          await waitUntilReady(page, route);
          const readyAt = Date.now();
          const routeRaw = await page.evaluate(() =>
            structuredClone(
              (
                window as typeof window & {
                  __governancePerformance: BrowserMetrics;
                }
              ).__governancePerformance
            )
          );
          let formOpenMs: number | null = null;
          let formJavaScript: ReturnType<typeof javaScriptSnapshot> | null =
            null;
          if ("form" in route) {
            await page.evaluate(() => {
              (
                window as typeof window & {
                  __governancePerformance: BrowserMetrics;
                }
              ).__governancePerformance.clickAt = null;
            });
            await page
              .getByRole("button", { exact: true, name: route.form.button })
              .click();
            const dialog = page.getByRole("dialog", {
              name: route.form.dialog,
            });
            await expect(dialog.getByLabel(route.form.field)).toBeVisible();
            const formResult = await page.evaluate(() => {
              const metrics = (
                window as typeof window & {
                  __governancePerformance: BrowserMetrics;
                }
              ).__governancePerformance;
              return {
                assets:
                  metrics.clickAt === null
                    ? []
                    : metrics.assets.filter(
                        (asset) => asset.startTime >= metrics.clickAt!
                      ),
                openMs:
                  metrics.clickAt === null
                    ? null
                    : performance.now() - metrics.clickAt,
              };
            });
            formOpenMs = formResult.openMs;
            formJavaScript = javaScriptSnapshot(formResult.assets);
            await page.keyboard.press("Escape");
          }
          const routeJavaScript = javaScriptSnapshot(routeRaw.assets);
          samples.push({
            cls: calculateCls(routeRaw.shifts),
            formJavaScript,
            formOpenMs,
            pageErrors,
            readinessMs: readyAt - startedAt,
            route: route.name,
            routeJavaScript,
            run,
            shifts: routeRaw.shifts,
            viewport: viewport.name,
          });
          console.log(
            `[governance-navigation] ${route.name}/${viewport.name}/run-${run} ready=${readyAt - startedAt}ms route-js=${routeJavaScript.encodedBodyBytes}B cls=${calculateCls(routeRaw.shifts).toFixed(3)} form=${formOpenMs === null ? "n/a" : `${Math.round(formOpenMs)}ms`} editor-js=${formJavaScript?.encodedBodyBytes ?? 0}B`
          );
          void session;
        } catch (error) {
          runErrors.push({
            error: diagnostic(error),
            pageErrors,
            route: route.name,
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
    label: LABEL,
    methodology: {
      cache: "disabled for each fresh route context",
      formActions:
        "open and cancel only; no mutations. Form JavaScript includes assets whose resource start time is at or after the captured click timestamp.",
      layoutShiftSources:
        "At most 50 shifts and five sources per shift; each source contains only tag, bounded class/test ID and rounded current rectangle.",
      network: THROTTLING,
      readiness:
        "level-one heading, Zero ready, no visible skeleton, seeded content (registrations has no standard seeded row), fonts and two animation frames",
      routeSnapshot:
        "CLS and route JavaScript are frozen at readiness, before any form is opened.",
      role: "super_admin",
      routeFilter: requestedRoutes,
      routes: SELECTED_ROUTES.map(({ name, path }) => ({ name, path })),
      runsPerRouteAndViewport: RUNS,
      viewports: VIEWPORTS,
    },
    runErrors,
    samples,
  };
  const reportPath = testInfo.outputPath(`governance-navigation-${LABEL}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const comparisonDirectory = path.resolve(
    import.meta.dirname,
    "../../../../tmp/web-vitals/governance"
  );
  await mkdir(comparisonDirectory, { recursive: true });
  await writeFile(
    path.join(comparisonDirectory, `governance-navigation-${LABEL}.json`),
    JSON.stringify(report, null, 2)
  );
  await testInfo.attach(`governance-navigation-${LABEL}.json`, {
    contentType: "application/json",
    path: reportPath,
  });
  expect(
    runErrors,
    "Failures are recorded in the governance report"
  ).toHaveLength(0);
  expect(
    samples.flatMap(
      (sample) => (sample as { pageErrors: Diagnostic[] }).pageErrors
    )
  ).toHaveLength(0);
});
