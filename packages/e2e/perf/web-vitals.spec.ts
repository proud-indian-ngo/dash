import { writeFile } from "node:fs/promises";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const RUNS_PER_ROUTE = 3;
const SETTLE_MS = 2_000;
const INTERACTION_SETTLE_MS = 1_000;
const VISIT_TYPE =
  process.env.WEB_VITALS_RETURNING === "true" ? "returning" : "cold";

const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

const THRESHOLDS = {
  cls: 0.1,
  interactionLatencyProxyMs: 200,
  lcpMs: 2_500,
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
  { authenticated: false, name: "login", path: "/login" },
  { authenticated: true, name: "dashboard", path: "/" },
  { authenticated: true, name: "events", path: "/events" },
  { authenticated: true, name: "reimbursements", path: "/reimbursements" },
] as const;

type MetricSupport = {
  event: boolean;
  firstInput: boolean;
  largestContentfulPaint: boolean;
  layoutShift: boolean;
  longtask: boolean;
  resource: boolean;
};

type ElementDiagnostic = {
  className: string;
  tagName: string;
};

type AssetDiagnostic = {
  encodedBodyBytes: number;
  filename: string;
  responseEndMs: number;
  startTimeMs: number;
  transferBytes: number;
};

type NavigationDiagnostic = {
  domContentLoadedMs: number | null;
  loadMs: number | null;
  ttfbMs: number | null;
};

type RawMetrics = {
  assets: AssetDiagnostic[];
  clsEntries: Array<{ startTime: number; value: number }>;
  firstInputDurationMs: number | null;
  interactionDurations: Record<string, number>;
  largestLayoutShift: {
    sources: ElementDiagnostic[];
    value: number;
  } | null;
  lcpElement: ElementDiagnostic | null;
  lcpResourceAssetFilename: string | null;
  lcpMs: number | null;
  longTasks: { count: number; maxDurationMs: number; totalDurationMs: number };
  milestones: {
    skeletonFreeMs: number | null;
  };
  resources: {
    assetTotals: {
      css: { count: number; encodedBodyBytes: number; transferBytes: number };
      javascript: {
        count: number;
        encodedBodyBytes: number;
        transferBytes: number;
      };
    };
    count: number;
    decodedBodyBytes: number;
    encodedBodyBytes: number;
    transferBytes: number;
  };
  support: MetricSupport;
};

type Sample = {
  cls: number | null;
  clsEntryCount: number;
  interactionCount: number;
  interactionLatencyProxyMs: number | null;
  largestLayoutShift: RawMetrics["largestLayoutShift"];
  lastAssetsByResponseEnd: AssetDiagnostic[] | null;
  lcpElement: ElementDiagnostic | null;
  lcpResourceAssetFilename: string | null;
  lcpMs: number | null;
  longTasks: RawMetrics["longTasks"] | null;
  milestones: RawMetrics["milestones"];
  navigation: NavigationDiagnostic | null;
  resources: RawMetrics["resources"] | null;
  run: number;
  support: MetricSupport;
  topAssetsByTransferBytes: AssetDiagnostic[] | null;
};

type Result = {
  route: (typeof ROUTES)[number]["name"];
  samples: Sample[];
  visit: typeof VISIT_TYPE;
  viewport: (typeof VIEWPORTS)[number]["name"];
};

async function configureThrottling(
  context: BrowserContext,
  page: Page,
  cacheDisabled: boolean
) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  if (cacheDisabled) {
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  }
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

async function installObservers(context: BrowserContext) {
  await context.addInitScript(() => {
    const supported = new Set(PerformanceObserver.supportedEntryTypes);
    const metrics: RawMetrics = {
      assets: [],
      clsEntries: [],
      firstInputDurationMs: null,
      interactionDurations: {},
      largestLayoutShift: null,
      lcpElement: null,
      lcpResourceAssetFilename: null,
      lcpMs: null,
      longTasks: { count: 0, maxDurationMs: 0, totalDurationMs: 0 },
      milestones: {
        skeletonFreeMs: null,
      },
      resources: {
        assetTotals: {
          css: { count: 0, encodedBodyBytes: 0, transferBytes: 0 },
          javascript: { count: 0, encodedBodyBytes: 0, transferBytes: 0 },
        },
        count: 0,
        decodedBodyBytes: 0,
        encodedBodyBytes: 0,
        transferBytes: 0,
      },
      support: {
        event: supported.has("event"),
        firstInput: supported.has("first-input"),
        largestContentfulPaint: supported.has("largest-contentful-paint"),
        layoutShift: supported.has("layout-shift"),
        longtask: supported.has("longtask"),
        resource: supported.has("resource"),
      },
    };

    const elementDiagnostic = (node: Node | null): ElementDiagnostic | null => {
      if (!(node instanceof Element)) {
        return null;
      }
      return {
        className: (node.getAttribute("class") ?? "").slice(0, 500),
        tagName: node.tagName,
      };
    };
    const assetFilename = (url: string): string | null => {
      try {
        const pathname = new URL(url, window.location.href).pathname;
        if (!pathname.startsWith("/assets/")) {
          return null;
        }
        return pathname.split("/").at(-1) || null;
      } catch {
        return null;
      }
    };

    Object.defineProperty(window, "__webVitalsBenchmark", {
      configurable: false,
      value: metrics,
      writable: false,
    });

    if (metrics.support.largestContentfulPaint) {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries.at(-1);
        if (latest) {
          const lcp = latest as PerformanceEntry & {
            element: Element | null;
            url: string;
          };
          metrics.lcpMs = lcp.startTime;
          metrics.lcpElement = elementDiagnostic(lcp.element);
          metrics.lcpResourceAssetFilename = assetFilename(lcp.url);
        }
      }).observe({ buffered: true, type: "largest-contentful-paint" });
    }

    if (metrics.support.layoutShift) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) {
            metrics.clsEntries.push({
              startTime: shift.startTime,
              value: shift.value,
            });
            if (
              metrics.largestLayoutShift === null ||
              shift.value > metrics.largestLayoutShift.value
            ) {
              const sources = (
                shift as typeof shift & {
                  sources?: Array<{ node: Node | null }>;
                }
              ).sources;
              metrics.largestLayoutShift = {
                sources: (sources ?? []).flatMap(({ node }) => {
                  const diagnostic = elementDiagnostic(node);
                  return diagnostic ? [diagnostic] : [];
                }),
                value: shift.value,
              };
            }
          }
        }
      }).observe({ buffered: true, type: "layout-shift" });
    }

    const recordInteractions = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        const event = entry as PerformanceEntry & {
          duration: number;
          interactionId: number;
        };
        if (event.interactionId > 0) {
          const id = String(event.interactionId);
          metrics.interactionDurations[id] = Math.max(
            metrics.interactionDurations[id] ?? 0,
            event.duration
          );
        }
      }
    };

    if (metrics.support.event) {
      const eventObserverOptions: PerformanceObserverInit & {
        durationThreshold: number;
      } = { buffered: true, durationThreshold: 16, type: "event" };
      new PerformanceObserver((list) => {
        recordInteractions(list.getEntries());
      }).observe(eventObserverOptions);
    }

    if (metrics.support.firstInput) {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        recordInteractions(entries);
        for (const entry of entries) {
          metrics.firstInputDurationMs = Math.max(
            metrics.firstInputDurationMs ?? 0,
            entry.duration
          );
        }
      }).observe({ buffered: true, type: "first-input" });
    }

    if (metrics.support.longtask) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTasks.count += 1;
          metrics.longTasks.totalDurationMs += entry.duration;
          metrics.longTasks.maxDurationMs = Math.max(
            metrics.longTasks.maxDurationMs,
            entry.duration
          );
        }
      }).observe({ buffered: true, type: "longtask" });
    }

    if (metrics.support.resource) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const resource = entry as PerformanceResourceTiming;
          metrics.resources.count += 1;
          metrics.resources.transferBytes += resource.transferSize;
          metrics.resources.encodedBodyBytes += resource.encodedBodySize;
          metrics.resources.decodedBodyBytes += resource.decodedBodySize;
          const filename = assetFilename(resource.name);
          if (filename === null) {
            continue;
          }
          const kind = filename.endsWith(".css")
            ? "css"
            : filename.endsWith(".js")
              ? "javascript"
              : null;
          if (kind) {
            const totals = metrics.resources.assetTotals[kind];
            totals.count += 1;
            totals.encodedBodyBytes += resource.encodedBodySize;
            totals.transferBytes += resource.transferSize;
          }
          metrics.assets.push({
            encodedBodyBytes: resource.encodedBodySize,
            filename,
            responseEndMs: resource.responseEnd,
            startTimeMs: resource.startTime,
            transferBytes: resource.transferSize,
          });
        }
      }).observe({ buffered: true, type: "resource" });
    }
  });
}

async function waitUntilReady(page: Page, route: (typeof ROUTES)[number]) {
  if (route.name === "login") {
    await expect(
      page.getByRole("heading", { exact: true, name: "Log in" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", {
        exact: true,
        name: {
          dashboard: "Dashboard",
          events: "Events",
          reimbursements: "Reimbursements",
        }[route.name],
      })
    ).toBeVisible({ timeout: 30_000 });
    await waitForZeroReady(page, 30_000, 20_000);
    if (route.name === "reimbursements") {
      await expect(
        page.getByPlaceholder("Search reimbursements...")
      ).toBeVisible();
      await expect(page.getByRole("table").getByRole("row")).not.toHaveCount(1);
    }
  }
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0);
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __webVitalsBenchmark: RawMetrics }
    ).__webVitalsBenchmark;
    metrics.milestones.skeletonFreeMs ??= performance.now();
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Leave time for deferred route chunks, images and post-hydration content to
  // settle under throttling before freezing LCP with the first interaction.
  await page.waitForTimeout(SETTLE_MS);
}

async function exerciseInteraction(
  page: Page,
  route: (typeof ROUTES)[number],
  viewport: (typeof VIEWPORTS)[number]
) {
  if (route.name === "login") {
    await page.getByLabel("Email").pressSequentially("vitals@example.test", {
      delay: 40,
    });
  } else if (viewport.name === "mobile") {
    const navigation = page.getByRole("navigation", { name: "Main" });
    await navigation.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Sidebar" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  } else {
    const toggle = page
      .getByRole("main")
      .getByRole("button", { name: "Toggle Sidebar" });
    await expect(toggle).toBeVisible();
    await toggle.click();
  }

  await page.waitForTimeout(INTERACTION_SETTLE_MS);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

function calculateCls(entries: RawMetrics["clsEntries"]) {
  let maximum = 0;
  let sessionStart = 0;
  let previous = 0;
  let sessionValue = 0;

  for (const entry of entries) {
    if (
      sessionValue === 0 ||
      entry.startTime - previous > 1_000 ||
      entry.startTime - sessionStart > 5_000
    ) {
      sessionStart = entry.startTime;
      sessionValue = entry.value;
    } else {
      sessionValue += entry.value;
    }
    previous = entry.startTime;
    maximum = Math.max(maximum, sessionValue);
  }

  return maximum;
}

async function readMetrics(page: Page, run: number): Promise<Sample> {
  const { navigation, raw } = await page.evaluate(() => {
    const value = (
      window as typeof window & { __webVitalsBenchmark: RawMetrics }
    ).__webVitalsBenchmark;
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return {
      navigation: entry
        ? {
            domContentLoadedMs:
              entry.domContentLoadedEventEnd > 0
                ? entry.domContentLoadedEventEnd - entry.startTime
                : null,
            loadMs:
              entry.loadEventEnd > 0
                ? entry.loadEventEnd - entry.startTime
                : null,
            ttfbMs:
              entry.responseStart > 0
                ? entry.responseStart - entry.requestStart
                : null,
          }
        : null,
      raw: structuredClone(value),
    };
  });
  const interactions = Object.values(raw.interactionDurations);
  const observedInteractionDurations = [
    ...interactions,
    ...(raw.firstInputDurationMs === null ? [] : [raw.firstInputDurationMs]),
  ];
  const topAssetsByTransferBytes = raw.assets
    .toSorted((left, right) => right.transferBytes - left.transferBytes)
    .slice(0, 10);

  return {
    cls: raw.support.layoutShift ? calculateCls(raw.clsEntries) : null,
    clsEntryCount: raw.clsEntries.length,
    interactionCount:
      interactions.length > 0
        ? interactions.length
        : raw.firstInputDurationMs === null
          ? 0
          : 1,
    interactionLatencyProxyMs:
      observedInteractionDurations.length > 0
        ? Math.max(...observedInteractionDurations)
        : null,
    largestLayoutShift: raw.largestLayoutShift,
    lastAssetsByResponseEnd: raw.support.resource
      ? raw.assets
          .toSorted((left, right) => right.responseEndMs - left.responseEndMs)
          .slice(0, 10)
      : null,
    lcpElement: raw.lcpElement,
    lcpResourceAssetFilename: raw.lcpResourceAssetFilename,
    lcpMs: raw.lcpMs,
    longTasks: raw.support.longtask ? raw.longTasks : null,
    milestones: raw.milestones,
    navigation,
    resources: raw.support.resource ? raw.resources : null,
    run,
    support: raw.support,
    topAssetsByTransferBytes: raw.support.resource
      ? topAssetsByTransferBytes
      : null,
  };
}

function percentile75(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.75) - 1] ?? null;
}

function summarize(result: Result) {
  const values = (key: "cls" | "interactionLatencyProxyMs" | "lcpMs") =>
    result.samples.flatMap((sample) => {
      const value = sample[key];
      return value === null ? [] : [value];
    });
  return {
    clsP75: percentile75(values("cls")),
    interactionLatencyProxyP75Ms: percentile75(
      values("interactionLatencyProxyMs")
    ),
    interactionsMeasured: result.samples.map(
      (sample) => sample.interactionCount
    ),
    lcpP75Ms: percentile75(values("lcpMs")),
    route: result.route,
    visit: result.visit,
    viewport: result.viewport,
  };
}

test(`measure ${VISIT_TYPE}-load web vitals`, async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.WEB_VITALS_PERFORMANCE !== "true",
    "Opt-in benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(600_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const results: Result[] = [];
  const routes =
    VISIT_TYPE === "returning"
      ? ROUTES.filter((route) => route.authenticated)
      : ROUTES;
  for (const viewport of VIEWPORTS) {
    for (const route of routes) {
      const result: Result = {
        route: route.name,
        samples: [],
        visit: VISIT_TYPE,
        viewport: viewport.name,
      };
      for (let run = 1; run <= RUNS_PER_ROUTE; run += 1) {
        const context = await browser.newContext({
          baseURL,
          deviceScaleFactor: viewport.deviceScaleFactor,
          hasTouch: viewport.hasTouch,
          isMobile: viewport.isMobile,
          storageState: route.authenticated
            ? testInfo.project.use.storageState
            : { cookies: [], origins: [] },
          viewport: viewport.viewport,
        });
        try {
          await installObservers(context);
          const page = await context.newPage();
          let pageErrorCount = 0;
          page.on("pageerror", () => {
            pageErrorCount += 1;
          });
          await configureThrottling(context, page, VISIT_TYPE === "cold");
          await page.goto(route.path, { waitUntil: "domcontentloaded" });
          await waitUntilReady(page, route);
          if (VISIT_TYPE === "returning") {
            await page.reload({ waitUntil: "domcontentloaded" });
            await waitUntilReady(page, route);
          }
          await exerciseInteraction(page, route, viewport);
          const sample = await readMetrics(page, run);
          result.samples.push(sample);
          await testInfo.attach(
            `web-vitals-${viewport.name}-${route.name}-run-${run}.json`,
            {
              body: JSON.stringify(
                {
                  route: route.name,
                  run,
                  sample,
                  throttling: THROTTLING,
                  visit: VISIT_TYPE,
                  viewport: viewport.name,
                },
                null,
                2
              ),
              contentType: "application/json",
            }
          );
          expect(
            pageErrorCount,
            `${VISIT_TYPE}/${viewport.name}/${route.name} run ${run} had uncaught page errors`
          ).toBe(0);
        } finally {
          await context.close();
        }
      }
      results.push(result);
      const summary = summarize(result);
      console.log(
        `[web-vitals] ${summary.visit}/${summary.viewport}/${summary.route} ` +
          `LCP p75=${summary.lcpP75Ms ?? "missing"}ms ` +
          `CLS p75=${summary.clsP75 ?? "missing"} ` +
          `interaction proxy p75=${summary.interactionLatencyProxyP75Ms ?? "missing"}ms ` +
          `interactions=${summary.interactionsMeasured.join(",")}`
      );
    }
  }

  const summaries = results.map(summarize);
  const report = {
    methodology: {
      cacheDisabled: VISIT_TYPE === "cold",
      network: {
        downloadBitsPerSecond: THROTTLING.downloadBitsPerSecond,
        latencyMs: THROTTLING.latencyMs,
        uploadBitsPerSecond: THROTTLING.uploadBitsPerSecond,
      },
      runsPerRoute: RUNS_PER_ROUTE,
      cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
      visit: VISIT_TYPE,
      returningVisit:
        VISIT_TYPE === "returning"
          ? "Each fresh browser context completes the actual route once, then the measured navigation reloads it with HTTP and Zero caches preserved"
          : null,
      interactionMetric:
        "Maximum Event Timing duration for observed interactionIds, falling back to the observed first-input event duration for sub-threshold interactions; a lab interaction-latency proxy, not field INP",
      navigationTiming:
        "TTFB is responseStart minus requestStart; DOMContentLoaded and load are event-end times relative to navigation start",
      clsMetric:
        "Maximum session-window score (1 second gap, 5 second window), excluding shifts with recent input",
    },
    results,
    summaries,
    thresholds: THRESHOLDS,
  };

  const reportPath = testInfo.outputPath("web-vitals.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach("web-vitals.json", {
    path: reportPath,
    contentType: "application/json",
  });
  if (process.env.WEB_VITALS_ASSERT === "true") {
    for (const result of results) {
      const summary = summarize(result);
      expect(
        result.samples.every((sample) => sample.interactionCount > 0),
        `${result.viewport}/${result.route} must record a real interaction`
      ).toBe(true);
      expect(
        summary.lcpP75Ms,
        `${result.viewport}/${result.route} LCP`
      ).not.toBeNull();
      expect(
        summary.clsP75,
        `${result.viewport}/${result.route} CLS`
      ).not.toBeNull();
      expect(
        summary.interactionLatencyProxyP75Ms,
        `${result.viewport}/${result.route} interaction latency proxy`
      ).not.toBeNull();
      expect(summary.lcpP75Ms!).toBeLessThanOrEqual(THRESHOLDS.lcpMs);
      expect(summary.clsP75!).toBeLessThanOrEqual(THRESHOLDS.cls);
      expect(summary.interactionLatencyProxyP75Ms!).toBeLessThanOrEqual(
        THRESHOLDS.interactionLatencyProxyMs
      );
    }
  }
});
