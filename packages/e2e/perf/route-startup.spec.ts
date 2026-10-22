import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../fixtures/test";

const READY_TIMEOUT_MS = 30_000;
const FONT_TIMEOUT_MS = 10_000;
const SETTLE_MS = 2_000;
const WARM_RELOAD = process.env.ROUTE_AUDIT_RETURNING === "true";
const execFileAsync = promisify(execFile);
const publicScheduleHelperPath = path.resolve(
  import.meta.dirname,
  "../helpers/kalakriti-public-schedule.ts"
);

const THROTTLING = {
  cpuSlowdownMultiplier: 4,
  downloadBitsPerSecond: 1_600_000,
  latencyMs: 150,
  uploadBitsPerSecond: 750_000,
} as const;

const VIEWPORTS = {
  desktop: {
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    viewport: { height: 900, width: 1440 },
  },
  mobile: {
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  },
} as const;

type ExpectedState = "fallback" | "normal" | "redirect";

type RouteManifestEntry = {
  authenticated: boolean;
  expectedHeading?: string;
  expectedPath?: string;
  expectedSelector?: string;
  expectedState?: ExpectedState;
  id: string;
  path: string;
};

type ElementDiagnostic = {
  className: string;
  tagName: string;
};

type ResourceCategory = "api" | "asset" | "auth" | "other" | "server-function";

type ResourceDiagnostic = {
  category: ResourceCategory;
  decodedBodyBytes: number;
  encodedBodyBytes: number;
  fetchStartMs: number;
  initiatorType: string;
  label: string;
  responseEndMs: number;
  responseStartMs: number;
  startTimeMs: number;
  transferBytes: number;
};

type RouterTraceEvent = {
  endMs: number | null;
  outcome: "error" | "pending" | "success";
  phase: "beforeLoad" | "invalidate" | "loader" | "update";
  routeId: string | null;
  startMs: number;
};

type BrowserMetrics = {
  cls: {
    entryCount: number;
    maximumSessionValue: number;
  };
  lcp: {
    element: ElementDiagnostic | null;
    startTimeMs: number | null;
  };
  longTasks: {
    count: number;
    maximumDurationMs: number;
    totalDurationMs: number;
  };
  milestones: {
    firstVisibleH1Ms: number | null;
    skeletonFreeMs: number | null;
    skeletonSamples: Array<{ count: number; timeMs: number }>;
    zeroReadyMs: number | null;
  };
  resources: ResourceDiagnostic[];
  router: {
    enabled: boolean;
    events: RouterTraceEvent[];
    firstZeroContextUpdate: {
      available: boolean;
      timeMs: number;
    } | null;
    routerAvailableMs: number | null;
    traceInstalled: boolean;
  };
  support: {
    largestContentfulPaint: boolean;
    layoutShift: boolean;
    longtask: boolean;
    resource: boolean;
  };
};

type FailedRequest = {
  category: ResourceCategory;
  failure: string | null;
  status: number | null;
};

type SampleStatus = "error" | "fallback" | "ready" | "redirect" | "timeout";

type Sample = {
  cls: BrowserMetrics["cls"] | null;
  failure: string | null;
  failedRequests: FailedRequest[];
  finalMarkers: {
    forms: number;
    rows: number;
    tables: number;
  } | null;
  finalPathname: string | null;
  fallbackIndicators: {
    alertsWithHeading: number;
    knownFallbackHeadings: number;
    statusesWithHeading: number;
    visibleDestructiveParagraphs: number;
  } | null;
  httpDocumentStatus: number | null;
  javascriptEncodedBodyBytes: number | null;
  lcp: BrowserMetrics["lcp"] | null;
  longTasks: BrowserMetrics["longTasks"] | null;
  milestones: BrowserMetrics["milestones"] | null;
  pageErrors: string[];
  resources: ResourceDiagnostic[] | null;
  router: BrowserMetrics["router"] | null;
  run: number;
  status: SampleStatus;
  support: BrowserMetrics["support"] | null;
};

type RouteResult = {
  authenticated: boolean;
  expectedState: ExpectedState;
  id: string;
  path: string;
  samples: Sample[];
};

async function parseManifest(): Promise<RouteManifestEntry[]> {
  const manifestPath = process.env.ROUTE_AUDIT_MANIFEST;
  if (!manifestPath) {
    throw new Error("ROUTE_AUDIT_MANIFEST must name a JSON manifest file");
  }

  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("ROUTE_AUDIT_MANIFEST must be a readable JSON file", {
      cause: error,
    });
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ROUTE_AUDIT_MANIFEST must be a non-empty array");
  }

  return value.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error(`Route manifest entry ${index} must be an object`);
    }
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.path !== "string" ||
      !entry.path.startsWith("/") ||
      typeof entry.authenticated !== "boolean"
    ) {
      throw new Error(
        `Route manifest entry ${index} requires id, absolute path and authenticated`
      );
    }
    const expectedState = entry.expectedState ?? "normal";
    if (
      !(["fallback", "normal", "redirect"] as const).includes(
        expectedState as ExpectedState
      )
    ) {
      throw new Error(
        `Route manifest entry ${index} has an invalid expectedState`
      );
    }
    for (const key of [
      "expectedHeading",
      "expectedPath",
      "expectedSelector",
    ] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "string") {
        throw new Error(`Route manifest entry ${index} has an invalid ${key}`);
      }
    }
    if (
      entry.expectedPath !== undefined &&
      !(entry.expectedPath as string).startsWith("/")
    ) {
      throw new Error(
        `Route manifest entry ${index} expectedPath must be absolute`
      );
    }
    if (expectedState === "redirect" && entry.expectedPath === undefined) {
      throw new Error(
        `Route manifest entry ${index} requires expectedPath for a redirect`
      );
    }
    return {
      authenticated: entry.authenticated,
      expectedHeading: entry.expectedHeading as string | undefined,
      expectedPath: entry.expectedPath as string | undefined,
      expectedSelector: entry.expectedSelector as string | undefined,
      expectedState: expectedState as ExpectedState,
      id: entry.id,
      path: entry.path,
    };
  });
}

function parseRuns() {
  const runs = Number(process.env.ROUTE_AUDIT_RUNS ?? "1");
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new Error("ROUTE_AUDIT_RUNS must be a positive integer");
  }
  return runs;
}

function parseViewport() {
  const name = process.env.ROUTE_AUDIT_VIEWPORT ?? "mobile";
  if (name !== "desktop" && name !== "mobile") {
    throw new Error("ROUTE_AUDIT_VIEWPORT must be mobile or desktop");
  }
  return { name, ...VIEWPORTS[name] };
}

function normalizePathname(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function sanitizePathname(pathname: string) {
  return normalizePathname(pathname).replace(
    /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,
    "[uuid]"
  );
}

function sanitizeMessage(message: string) {
  return message
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, "[uuid]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .slice(0, 500);
}

function resourceCategory(url: string): ResourceCategory {
  try {
    const pathname = new URL(url).pathname;
    if (pathname.startsWith("/api/auth/")) {
      return "auth";
    }
    if (
      /\/(?:_server(?:fn)?|serverfn|server-function)(?:\/|$)/i.test(pathname)
    ) {
      return "server-function";
    }
    if (pathname.startsWith("/api/")) {
      return "api";
    }
    if (pathname.startsWith("/assets/")) {
      return "asset";
    }
  } catch {
    // Invalid request URLs are retained only as the non-identifying category.
  }
  return "other";
}

async function configureThrottling(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", {
    cacheDisabled: !WARM_RELOAD,
  });
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

async function installObservers(
  context: BrowserContext,
  authenticated: boolean,
  traceRouter: boolean
) {
  await context.addInitScript(
    ({ needsZeroReady, shouldTraceRouter }) => {
      const supported = new Set(PerformanceObserver.supportedEntryTypes);
      const metrics: BrowserMetrics = {
        cls: { entryCount: 0, maximumSessionValue: 0 },
        lcp: { element: null, startTimeMs: null },
        longTasks: {
          count: 0,
          maximumDurationMs: 0,
          totalDurationMs: 0,
        },
        milestones: {
          firstVisibleH1Ms: null,
          skeletonFreeMs: null,
          skeletonSamples: [],
          zeroReadyMs: null,
        },
        resources: [],
        router: {
          enabled: shouldTraceRouter,
          events: [],
          firstZeroContextUpdate: null,
          routerAvailableMs: null,
          traceInstalled: false,
        },
        support: {
          largestContentfulPaint: supported.has("largest-contentful-paint"),
          layoutShift: supported.has("layout-shift"),
          longtask: supported.has("longtask"),
          resource: supported.has("resource"),
        },
      };
      Object.defineProperty(window, "__routeStartupAudit", {
        configurable: false,
        value: metrics,
        writable: false,
      });

      if (shouldTraceRouter) {
        type TracedFunction = (...args: unknown[]) => unknown;
        type TracedRouter = {
          invalidate?: TracedFunction;
          routesById?: Record<string, { options?: Record<string, unknown> }>;
          update?: TracedFunction;
        };
        const instrumentedRouters = new WeakSet<object>();
        const finishEvent = (
          event: RouterTraceEvent,
          outcome: "error" | "success"
        ) => {
          if (event.outcome !== "pending") return;
          event.endMs = performance.now();
          event.outcome = outcome;
        };
        const wrapPhase = (
          original: TracedFunction,
          phase: RouterTraceEvent["phase"],
          routeId: string | null,
          beforeCall?: (args: unknown[]) => void
        ): TracedFunction =>
          function (this: unknown, ...args: unknown[]) {
            const event: RouterTraceEvent = {
              endMs: null,
              outcome: "pending",
              phase,
              routeId,
              startMs: performance.now(),
            };
            metrics.router.events.push(event);
            try {
              beforeCall?.(args);
            } catch {
              // Diagnostics must not change router behavior.
            }

            let result: unknown;
            try {
              result = Reflect.apply(original, this, args);
            } catch (error) {
              finishEvent(event, "error");
              throw error;
            }

            try {
              const then =
                (typeof result === "object" && result !== null) ||
                typeof result === "function"
                  ? (result as { then?: unknown }).then
                  : undefined;
              if (typeof then === "function") {
                Reflect.apply(then, result, [
                  () => finishEvent(event, "success"),
                  () => finishEvent(event, "error"),
                ]);
              } else {
                finishEvent(event, "success");
              }
            } catch {
              // Leave the event pending when a non-standard thenable cannot be observed.
            }
            return result;
          };
        const installRouterTrace = (candidate: unknown) => {
          if (
            typeof candidate !== "object" ||
            candidate === null ||
            instrumentedRouters.has(candidate)
          ) {
            return;
          }
          instrumentedRouters.add(candidate);
          metrics.router.routerAvailableMs ??= performance.now();
          metrics.router.traceInstalled = true;
          const router = candidate as TracedRouter;

          for (const [routeId, route] of Object.entries(
            router.routesById ?? {}
          )) {
            for (const phase of ["beforeLoad", "loader"] as const) {
              const original = route.options?.[phase];
              if (typeof original !== "function") continue;
              try {
                route.options![phase] = wrapPhase(
                  original as TracedFunction,
                  phase,
                  routeId
                );
              } catch {
                // A frozen route option remains uninstrumented.
              }
            }
          }

          if (typeof router.update === "function") {
            try {
              router.update = wrapPhase(
                router.update,
                "update",
                null,
                (args) => {
                  if (metrics.router.firstZeroContextUpdate !== null) return;
                  const options = args[0] as
                    | { context?: { zero?: unknown } }
                    | undefined;
                  if (options?.context?.zero == null) return;
                  metrics.router.firstZeroContextUpdate = {
                    available: true,
                    timeMs: performance.now(),
                  };
                }
              );
            } catch {
              // A non-writable method remains uninstrumented.
            }
          }
          if (typeof router.invalidate === "function") {
            try {
              router.invalidate = wrapPhase(
                router.invalidate,
                "invalidate",
                null
              );
            } catch {
              // A non-writable method remains uninstrumented.
            }
          }
        };

        let routerValue: unknown;
        try {
          Object.defineProperty(self, "__TSR_ROUTER__", {
            configurable: true,
            enumerable: true,
            get: () => routerValue,
            set: (value) => {
              routerValue = value;
              try {
                installRouterTrace(value);
              } catch {
                // Preserve the router assignment if tracing is unavailable.
              }
            },
          });
        } catch {
          // The trace remains explicitly uninstalled when the hook is unavailable.
        }
      }

      const elementDiagnostic = (
        element: Element | null
      ): ElementDiagnostic | null =>
        element
          ? {
              className: (element.getAttribute("class") ?? "").slice(0, 500),
              tagName: element.tagName,
            }
          : null;
      const isVisible = (element: Element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      };
      const classify = (url: string): ResourceCategory => {
        try {
          const pathname = new URL(url, location.href).pathname;
          if (pathname.startsWith("/api/auth/")) return "auth";
          if (
            /\/(?:_server(?:fn)?|serverfn|server-function)(?:\/|$)/i.test(
              pathname
            )
          ) {
            return "server-function";
          }
          if (pathname.startsWith("/api/")) return "api";
          if (pathname.startsWith("/assets/")) return "asset";
        } catch {
          return "other";
        }
        return "other";
      };
      const resourceLabel = (url: string, category: ResourceCategory) => {
        try {
          const pathname = new URL(url, location.href).pathname;
          if (category === "asset")
            return pathname.split("/").at(-1) || "asset";
          if (
            category === "server-function" ||
            category === "api" ||
            category === "auth"
          ) {
            return pathname.replace(
              /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,
              "[uuid]"
            );
          }
        } catch {
          return category;
        }
        return category;
      };

      if (metrics.support.largestContentfulPaint) {
        new PerformanceObserver((list) => {
          const latest = list.getEntries().at(-1) as
            | (PerformanceEntry & { element: Element | null })
            | undefined;
          if (latest) {
            metrics.lcp.startTimeMs = latest.startTime;
            metrics.lcp.element = elementDiagnostic(latest.element);
          }
        }).observe({ buffered: true, type: "largest-contentful-paint" });
      }

      if (metrics.support.layoutShift) {
        let sessionStart = 0;
        let previous = 0;
        let sessionValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            };
            if (shift.hadRecentInput) continue;
            if (
              sessionValue === 0 ||
              shift.startTime - previous > 1_000 ||
              shift.startTime - sessionStart > 5_000
            ) {
              sessionStart = shift.startTime;
              sessionValue = shift.value;
            } else {
              sessionValue += shift.value;
            }
            previous = shift.startTime;
            metrics.cls.entryCount += 1;
            metrics.cls.maximumSessionValue = Math.max(
              metrics.cls.maximumSessionValue,
              sessionValue
            );
          }
        }).observe({ buffered: true, type: "layout-shift" });
      }

      if (metrics.support.longtask) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTasks.count += 1;
            metrics.longTasks.totalDurationMs += entry.duration;
            metrics.longTasks.maximumDurationMs = Math.max(
              metrics.longTasks.maximumDurationMs,
              entry.duration
            );
          }
        }).observe({ buffered: true, type: "longtask" });
      }

      if (metrics.support.resource) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            const category = classify(entry.name);
            metrics.resources.push({
              category,
              decodedBodyBytes: entry.decodedBodySize,
              encodedBodyBytes: entry.encodedBodySize,
              fetchStartMs: entry.fetchStart,
              initiatorType: entry.initiatorType,
              label: resourceLabel(entry.name, category),
              responseEndMs: entry.responseEnd,
              responseStartMs: entry.responseStart,
              startTimeMs: entry.startTime,
              transferBytes: entry.transferSize,
            });
          }
        }).observe({ buffered: true, type: "resource" });
      }

      let scanScheduled = false;
      let observer: MutationObserver | null = null;
      let previousSkeletonCount: number | null = null;
      const scan = () => {
        scanScheduled = false;
        const now = performance.now();
        const main = document.querySelector("#main");
        if (metrics.milestones.firstVisibleH1Ms === null) {
          const heading = needsZeroReady
            ? main?.querySelector("h1")
            : document.querySelector("h1");
          if (heading && isVisible(heading)) {
            metrics.milestones.firstVisibleH1Ms = now;
          }
        }
        if (
          metrics.milestones.zeroReadyMs === null &&
          main?.hasAttribute("data-zero-ready")
        ) {
          metrics.milestones.zeroReadyMs = now;
        }
        const skeletonCount = [
          ...document.querySelectorAll('[data-slot="skeleton"]'),
        ].filter(isVisible).length;
        if (skeletonCount !== previousSkeletonCount) {
          metrics.milestones.skeletonSamples.push({
            count: skeletonCount,
            timeMs: now,
          });
          previousSkeletonCount = skeletonCount;
          metrics.milestones.skeletonFreeMs = skeletonCount === 0 ? now : null;
        }
        if (
          metrics.milestones.firstVisibleH1Ms !== null &&
          (!needsZeroReady || metrics.milestones.zeroReadyMs !== null)
        ) {
          observer?.disconnect();
        }
      };
      const scheduleScan = () => {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(scan);
      };
      observer = new MutationObserver(scheduleScan);
      observer.observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      scheduleScan();
    },
    { needsZeroReady: authenticated, shouldTraceRouter: traceRouter }
  );
}

async function waitForFonts(page: Page) {
  await page.evaluate(
    (timeoutMs) =>
      Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]),
    FONT_TIMEOUT_MS
  );
}

async function waitForRouteReadiness(page: Page, route: RouteManifestEntry) {
  if (route.expectedHeading) {
    await expect(
      page.getByRole("heading", { exact: true, name: route.expectedHeading })
    ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  }
  if (route.expectedSelector) {
    await expect(page.locator(route.expectedSelector).first()).toBeVisible({
      timeout: READY_TIMEOUT_MS,
    });
  }
  if (!route.expectedHeading && !route.expectedSelector) {
    const headingSelector = route.authenticated
      ? "#main h1:visible"
      : "h1:visible";
    await expect(page.locator(headingSelector).first()).toBeVisible({
      timeout: READY_TIMEOUT_MS,
    });
  }
  if (route.authenticated) {
    await page.locator("#main[data-zero-ready]").waitFor({
      state: "attached",
      timeout: READY_TIMEOUT_MS,
    });
  }
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & { __routeStartupAudit: BrowserMetrics }
    ).__routeStartupAudit;
    const now = performance.now();
    const latest = metrics.milestones.skeletonSamples.at(-1);
    if (latest?.count !== 0) {
      metrics.milestones.skeletonSamples.push({ count: 0, timeMs: now });
    }
    metrics.milestones.skeletonFreeMs = now;
  });
  await waitForFonts(page);
  await page.waitForTimeout(SETTLE_MS);
}

async function seedPublicScheduleIfNeeded(manifest: RouteManifestEntry[]) {
  const needsFixture = manifest.some(
    (route) =>
      normalizePathname(
        new URL(route.path, "http://audit.invalid").pathname
      ) === "/kalakriti/2191/schedule"
  );
  if (!needsFixture) return;

  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error(
      "DATABASE_URL is required to seed the public schedule fixture"
    );
  }
  const databaseUrl = new URL(rawDatabaseUrl);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    databaseName !== "pi-dash-test"
  ) {
    throw new Error(
      "The public schedule fixture may run only on localhost pi-dash-test"
    );
  }
  await execFileAsync("bun", ["run", publicScheduleHelperPath, "setup"], {
    env: process.env,
  });
}

async function readBrowserState(page: Page, expectedState: ExpectedState) {
  return page.evaluate((countDestructiveFallback) => {
    const metrics = structuredClone(
      (window as typeof window & { __routeStartupAudit: BrowserMetrics })
        .__routeStartupAudit
    );
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const countVisible = (selector: string) =>
      [...document.querySelectorAll(selector)].filter(visible).length;
    return {
      fallbackIndicators: {
        alertsWithHeading: countVisible('[role="alert"] h1'),
        knownFallbackHeadings: [...document.querySelectorAll("h1")].filter(
          (heading) =>
            visible(heading) &&
            /(?:access denied|not found|page couldn't load|something went wrong|this link doesn't work)/i.test(
              heading.textContent ?? ""
            )
        ).length,
        statusesWithHeading: countVisible('[role="status"] h1'),
        visibleDestructiveParagraphs: countDestructiveFallback
          ? countVisible("p.text-destructive")
          : 0,
      },
      finalMarkers: {
        forms: countVisible("#main form"),
        rows: countVisible("#main table tbody tr"),
        tables: countVisible("#main table"),
      },
      metrics,
      pathname: location.pathname,
    };
  }, expectedState === "fallback");
}

function emptySample(run: number): Sample {
  return {
    cls: null,
    failedRequests: [],
    failure: null,
    fallbackIndicators: null,
    finalMarkers: null,
    finalPathname: null,
    httpDocumentStatus: null,
    javascriptEncodedBodyBytes: null,
    lcp: null,
    longTasks: null,
    milestones: null,
    pageErrors: [],
    resources: null,
    router: null,
    run,
    status: "error",
    support: null,
  };
}

function classifyError(error: unknown): Pick<Sample, "failure" | "status"> {
  const message = sanitizeMessage(
    error instanceof Error ? error.message : String(error)
  );
  return {
    failure: message,
    status: /timeout/i.test(message) ? "timeout" : "error",
  };
}

test("audit startup across the route manifest", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.ROUTE_STARTUP_AUDIT !== "true",
    "Opt-in diagnostic on the isolated super_admin test stack only"
  );
  test.setTimeout(2_700_000);
  expect(baseURL, "The route audit requires the E2E base URL").toBeTruthy();

  const manifest = await parseManifest();
  const runs = parseRuns();
  const viewport = parseViewport();
  const routerTrace = process.env.ROUTE_AUDIT_TRACE === "true";
  await seedPublicScheduleIfNeeded(manifest);
  const results: RouteResult[] = [];
  const reportPath = testInfo.outputPath("route-startup.json");
  const report = () => ({
    methodology: {
      cacheDisabled: !WARM_RELOAD,
      contentReadiness:
        "Authenticated readiness means the app shell rendered, Zero connected, visible skeletons cleared, fonts settled (up to 10 seconds), and a 2 second quiet period elapsed. It does not verify seeded-data completeness.",
      cpuSlowdownMultiplier: THROTTLING.cpuSlowdownMultiplier,
      fieldPercentile: false,
      network: {
        downloadBitsPerSecond: THROTTLING.downloadBitsPerSecond,
        latencyMs: THROTTLING.latencyMs,
        uploadBitsPerSecond: THROTTLING.uploadBitsPerSecond,
      },
      runsPerRoute: runs,
      routerTrace,
      routerTraceMethod:
        "Optional best-effort client router beforeLoad, loader, update and invalidate timing; traceInstalled=false means no router timing was observed, not zero work.",
      sampleKind: WARM_RELOAD
        ? "warm reload after a complete initial visit in the same context"
        : "cold synthetic route-startup screening",
      sequential: true,
      viewport: viewport.name,
    },
    results,
  });

  for (const route of manifest) {
    const result: RouteResult = {
      authenticated: route.authenticated,
      expectedState: route.expectedState ?? "normal",
      id: route.id,
      path: sanitizePathname(new URL(route.path, baseURL).pathname),
      samples: [],
    };

    for (let run = 1; run <= runs; run += 1) {
      const sample = emptySample(run);
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
        await installObservers(context, route.authenticated, routerTrace);
        const page = await context.newPage();
        page.on("pageerror", (error) => {
          sample.pageErrors.push(sanitizeMessage(error.message));
        });
        page.on("requestfailed", (request) => {
          sample.failedRequests.push({
            category: resourceCategory(request.url()),
            failure: request.failure()
              ? sanitizeMessage(request.failure()!.errorText)
              : null,
            status: null,
          });
        });
        page.on("response", (response) => {
          if (response.status() >= 400) {
            sample.failedRequests.push({
              category: resourceCategory(response.url()),
              failure: null,
              status: response.status(),
            });
          }
        });
        await configureThrottling(context, page);

        try {
          if (WARM_RELOAD) {
            await page.goto(route.path, {
              timeout: READY_TIMEOUT_MS,
              waitUntil: "domcontentloaded",
            });
            await waitForRouteReadiness(page, route);
            sample.pageErrors.length = 0;
            sample.failedRequests.length = 0;
          }
          const navigationOptions = {
            timeout: READY_TIMEOUT_MS,
            waitUntil: "domcontentloaded" as const,
          };
          const navigationResponse = WARM_RELOAD
            ? await page.reload(navigationOptions)
            : await page.goto(route.path, navigationOptions);
          sample.httpDocumentStatus = navigationResponse?.status() ?? null;
          await waitForRouteReadiness(page, route);
        } catch (error) {
          Object.assign(sample, classifyError(error));
        }

        const state = await readBrowserState(
          page,
          route.expectedState ?? "normal"
        ).catch(() => null);
        if (state) {
          sample.cls = state.metrics.support.layoutShift
            ? state.metrics.cls
            : null;
          sample.fallbackIndicators = state.fallbackIndicators;
          sample.finalMarkers = state.finalMarkers;
          sample.finalPathname = sanitizePathname(state.pathname);
          sample.javascriptEncodedBodyBytes = state.metrics.resources
            .filter(
              (resource) =>
                resource.category === "asset" && resource.label.endsWith(".js")
            )
            .reduce((total, resource) => total + resource.encodedBodyBytes, 0);
          sample.lcp = state.metrics.support.largestContentfulPaint
            ? state.metrics.lcp
            : null;
          sample.longTasks = state.metrics.support.longtask
            ? state.metrics.longTasks
            : null;
          sample.milestones = state.metrics.milestones;
          sample.resources = state.metrics.support.resource
            ? state.metrics.resources
            : null;
          sample.router = state.metrics.router;
          sample.support = state.metrics.support;

          const expectedPath = normalizePathname(
            new URL(route.expectedPath ?? route.path, baseURL).pathname
          );
          const finalPath = normalizePathname(state.pathname);
          if (finalPath !== expectedPath) {
            sample.status = "redirect";
            sample.failure = `Unexpected redirect to ${sanitizePathname(finalPath)}`;
          }

          if (
            sample.failure === null &&
            sample.httpDocumentStatus !== null &&
            sample.httpDocumentStatus >= 400 &&
            route.expectedState !== "fallback"
          ) {
            sample.status = "error";
            sample.failure = `Document returned HTTP ${sample.httpDocumentStatus}`;
          }

          if (sample.failure === null) {
            const hasError = state.fallbackIndicators.alertsWithHeading > 0;
            const hasFallback =
              state.fallbackIndicators.knownFallbackHeadings > 0 ||
              state.fallbackIndicators.visibleDestructiveParagraphs > 0;
            if (hasError) {
              sample.status = "error";
              sample.failure = "A page-level error state rendered";
            } else if (hasFallback && route.expectedState !== "fallback") {
              sample.status = "fallback";
              sample.failure = "An unexpected fallback state rendered";
            } else if (route.expectedState === "fallback" && !hasFallback) {
              sample.status = "error";
              sample.failure = "The expected fallback state did not render";
            } else {
              sample.status = "ready";
            }
          }
        }
      } finally {
        await context.close();
      }
      if (sample.pageErrors.length > 0 && sample.failure === null) {
        sample.status = "error";
        sample.failure = `Browser reported ${sample.pageErrors.length} uncaught error(s)`;
      }
      result.samples.push(sample);
      const jsKb =
        sample.javascriptEncodedBodyBytes === null
          ? "missing"
          : (sample.javascriptEncodedBodyBytes / 1024).toFixed(1);
      console.log(
        `[route-startup] ${route.id} run=${run} status=${sample.status} ` +
          `LCP=${sample.lcp?.startTimeMs ?? "missing"}ms ` +
          `first-heading=${sample.milestones?.firstVisibleH1Ms ?? "missing"}ms ` +
          `zero-ready=${sample.milestones?.zeroReadyMs ?? "missing"}ms JS=${jsKb}KB`
      );
    }

    results.push(result);
    await writeFile(reportPath, JSON.stringify(report(), null, 2));
  }

  await testInfo.attach("route-startup.json", {
    contentType: "application/json",
    path: reportPath,
  });

  const readyWithoutLcp = results.flatMap((result) =>
    result.samples.flatMap((sample) =>
      sample.status === "ready" && sample.lcp?.startTimeMs == null
        ? [`${result.id}/run-${sample.run}`]
        : []
    )
  );
  expect(
    readyWithoutLcp,
    "Samples classified ready must contain an LCP observation"
  ).toEqual([]);
});
