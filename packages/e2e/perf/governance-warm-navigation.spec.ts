import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BrowserContext,
  CDPSession,
  Locator,
  Page,
} from "@playwright/test";

import { expect, test, waitForZeroReady } from "../fixtures/test";

const RUNS = 3;
const READY_TIMEOUT_MS = 30_000;
const DASHBOARD_SETTLE_MS = 2_000;
const MEASURE_REGISTER_ACTIONS =
  process.env.GOVERNANCE_WARM_REGISTER_ACTIONS === "true";
const LABEL = (process.env.GOVERNANCE_WARM_LABEL ?? "unlabelled")
  .replace(/[^a-zA-Z0-9_-]+/g, "-")
  .slice(0, 60);
const STORAGE_STATE = path.resolve(
  import.meta.dirname,
  "../.auth/super_admin.json"
);
const EXTRA_IDLE_WAIT_MS = (() => {
  const raw =
    process.env.GOVERNANCE_WARM_IDLE_WAIT_MS ??
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
      `Governance warm navigation idle wait must be a finite nonnegative integer, received ${JSON.stringify(raw)}`
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

const DESTINATIONS = [
  {
    heading: "Trustee register",
    link: "Trustee register",
    name: "register",
    path: "/governance",
    populatedText: "Asha Rao",
  },
  {
    heading: "Governance documents",
    link: "Documents",
    name: "documents",
    path: "/governance/documents",
    populatedText: "Volunteer code of conduct (approved)",
  },
  {
    heading: "Trust deed",
    link: "Trust deed",
    name: "deed",
    path: "/governance/deed",
    populatedText: "Version 2: Deed of amendment (planned), 2026",
  },
  {
    heading: "Resolutions",
    link: "Resolutions",
    name: "resolutions",
    path: "/governance/resolutions",
    populatedText: "Approve the budget for 2027-28",
  },
  {
    heading: "Board meetings",
    link: "Meetings",
    name: "meetings",
    path: "/governance/meetings",
    populatedTab: /^Past\s+1$/,
  },
  {
    heading: "Compliance calendar",
    link: "Compliance",
    name: "compliance",
    path: "/governance/compliance",
    readyTestIdPrefix: "compliance-item-",
  },
  {
    heading: "Declarations of interests",
    link: "Declarations",
    name: "declarations",
    path: "/governance/declarations",
    populatedText: "Vikram Menon",
  },
  {
    heading: "Policies",
    link: "Policies",
    name: "policies",
    path: "/governance/policies",
    populatedText: "Child-safeguarding policy",
  },
  {
    heading: "Registrations",
    link: "Registrations",
    name: "registrations",
    path: "/governance/registrations",
    readyControl: "Search registrations...",
  },
] as const;

const requestedRoutes = (process.env.GOVERNANCE_WARM_ROUTES ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const unknownRoutes = requestedRoutes.filter(
  (name) => !DESTINATIONS.some((destination) => destination.name === name)
);
if (unknownRoutes.length > 0) {
  throw new Error(
    `Unknown governance warm routes: ${unknownRoutes.join(", ")}`
  );
}
const SELECTED_DESTINATIONS =
  requestedRoutes.length === 0
    ? DESTINATIONS
    : DESTINATIONS.filter((destination) =>
        requestedRoutes.includes(destination.name)
      );

type Destination = (typeof DESTINATIONS)[number];
type DestinationName = Destination["name"];
type Phase = "first" | "repeat";
type Scenario = "add-trustee" | "navigation" | "trustee-detail";
type ViewportName = (typeof VIEWPORTS)[number]["name"];

function scenariosFor(destination: Destination): readonly Scenario[] {
  return MEASURE_REGISTER_ACTIONS && destination.name === "register"
    ? ["add-trustee", "trustee-detail"]
    : ["navigation"];
}

type TimedEntry = {
  duration: number;
  startTime: number;
};

type BrowserMetrics = {
  active: {
    armedAt: number;
    clickAt: number | null;
    timeOrigin: number;
  } | null;
  longTasks: TimedEntry[];
  longtaskSupported: boolean;
};

type JavaScriptAsset = {
  encodedBodyBytes: number;
  filename: string;
  startFromClickMs: number;
  transferBytes: number;
};

type JavaScriptSnapshot = {
  assets: JavaScriptAsset[];
  count: number;
  totalEncodedBodyBytes: number;
  totalTransferBytes: number;
};

type Diagnostic = {
  message: string;
  name: string;
};

type Measurement = {
  destination: DestinationName;
  phase: Phase;
} & InteractionMeasurement;

type InteractionMeasurement = {
  armToClickMs: number;
  clickToReadyMs: number;
  longTasks: {
    count: number;
    maxDurationMs: number;
    totalDurationMs: number;
  } | null;
  postClickJavaScript: JavaScriptSnapshot;
  sameDocumentTimeOrigin: boolean;
  timeOrigin: number;
};

type RegisterActionMeasurement = {
  action: "add-term" | "add-trustee" | "trustee-detail";
} & InteractionMeasurement;

type RunResult = {
  destination: DestinationName;
  initialTimeOrigin: number;
  measurements: Measurement[];
  pageErrors: Diagnostic[];
  preNavigationJavaScript: Omit<JavaScriptSnapshot, "assets">;
  registerActions: RegisterActionMeasurement[] | null;
  run: number;
  scenario: Scenario;
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
    const supported = new Set(PerformanceObserver.supportedEntryTypes);
    const metrics: BrowserMetrics = {
      active: null,
      longTasks: [],
      longtaskSupported: supported.has("longtask"),
    };
    Object.defineProperty(window, "__governanceWarmNavigationBenchmark", {
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
          target.closest('a[href],button,[role="button"],[role="row"],tr')
        ) {
          metrics.active.clickAt = event.timeStamp;
        }
      },
      { capture: true }
    );
    if (metrics.longtaskSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      }).observe({ buffered: true, type: "longtask" });
    }
  });
}

async function configureThrottling(
  context: BrowserContext,
  page: Page
): Promise<CDPSession> {
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
  return session;
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
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  await waitForSettledContent(page);
}

async function waitForDestination(page: Page, destination: Destination) {
  await page.waitForURL((url) => url.pathname === destination.path, {
    timeout: READY_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: destination.heading,
    })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForZeroReady(page, READY_TIMEOUT_MS, READY_TIMEOUT_MS);
  if ("populatedText" in destination) {
    await expect(
      page.getByText(destination.populatedText, { exact: true }).first()
    ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  } else if ("populatedTab" in destination) {
    await expect(
      page.getByRole("tab", { name: destination.populatedTab })
    ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  } else if ("readyTestIdPrefix" in destination) {
    await page
      .locator(`[data-testid^="${destination.readyTestIdPrefix}"]`)
      .first()
      .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
  } else {
    await expect(page.getByPlaceholder(destination.readyControl)).toBeVisible({
      timeout: READY_TIMEOUT_MS,
    });
  }
  await waitForSettledContent(page);
}

async function navigationLink(
  page: Page,
  viewport: ViewportName,
  destination: Pick<Destination, "link"> | "Dashboard"
): Promise<Locator> {
  if (viewport === "desktop") {
    return page.locator('[data-sidebar="content"]').getByRole("link", {
      exact: true,
      name: destination === "Dashboard" ? "Dashboard" : destination.link,
    });
  }
  const mainNavigation = page.getByRole("navigation", { name: "Main" });
  if (destination === "Dashboard") {
    return mainNavigation.getByRole("link", { exact: true, name: "Home" });
  }
  await mainNavigation.getByRole("button", { name: "Menu" }).tap();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer).toBeVisible({ timeout: READY_TIMEOUT_MS });
  return drawer.getByRole("link", { exact: true, name: destination.link });
}

async function armMeasurement(page: Page) {
  await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __governanceWarmNavigationBenchmark: BrowserMetrics;
      }
    ).__governanceWarmNavigationBenchmark;
    metrics.active = {
      armedAt: performance.now(),
      clickAt: null,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function finishMeasurement(page: Page): Promise<InteractionMeasurement> {
  return await page.evaluate(() => {
    const metrics = (
      window as typeof window & {
        __governanceWarmNavigationBenchmark: BrowserMetrics;
      }
    ).__governanceWarmNavigationBenchmark;
    const active = metrics.active;
    if (!active || active.clickAt === null) {
      throw new Error("The measured governance click was not observed");
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
              startFromClickMs: entry.startTime - active.clickAt!,
              transferBytes: entry.transferSize,
            },
          ];
        } catch {
          return [];
        }
      })
      .filter(
        (asset) =>
          asset.startFromClickMs >= 0 &&
          asset.startFromClickMs <= readyAt - active.clickAt!
      );
    const longTasks = metrics.longTasks.filter(
      (entry) =>
        entry.startTime <= readyAt &&
        entry.startTime + entry.duration >= active.clickAt!
    );
    metrics.active = null;
    return {
      armToClickMs: active.clickAt - active.armedAt,
      clickToReadyMs: readyAt - active.clickAt,
      longTasks: metrics.longtaskSupported
        ? {
            count: longTasks.length,
            maxDurationMs:
              longTasks.length === 0
                ? 0
                : Math.max(...longTasks.map((entry) => entry.duration)),
            totalDurationMs: longTasks.reduce(
              (total, entry) => total + entry.duration,
              0
            ),
          }
        : null,
      postClickJavaScript: {
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
  });
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
  await waitForDestination(page, destination);
  return {
    ...(await finishMeasurement(page)),
    destination: destination.name,
    phase,
  };
}

async function activate(page: Page, viewport: ViewportName, locator: Locator) {
  await armMeasurement(page);
  if (viewport === "mobile") {
    await locator.tap();
  } else {
    await locator.click();
  }
}

async function measureAddTrustee(
  page: Page,
  viewport: ViewportName
): Promise<RegisterActionMeasurement[]> {
  await activate(
    page,
    viewport,
    page.getByRole("button", { exact: true, name: "Add trustee" })
  );
  const addDialog = page.getByRole("dialog", { name: "Add trustee" });
  await expect(
    addDialog.getByRole("textbox", { exact: true, name: "Legal name" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
  const addTrustee: RegisterActionMeasurement = {
    ...(await finishMeasurement(page)),
    action: "add-trustee",
  };
  const cancel = addDialog.getByRole("button", { exact: true, name: "Cancel" });
  if (viewport === "mobile") {
    await cancel.tap();
  } else {
    await cancel.click();
  }
  await expect(addDialog).toBeHidden({ timeout: READY_TIMEOUT_MS });
  return [addTrustee];
}

async function measureTrusteeDetailActions(
  page: Page,
  viewport: ViewportName
): Promise<RegisterActionMeasurement[]> {
  const ashaRow = page.getByRole("row").filter({ hasText: "Asha Rao" }).first();
  await activate(page, viewport, ashaRow);
  const detailSheet = page.getByRole("dialog", { name: "Asha Rao" });
  await expect(
    detailSheet.getByText("Contact and KYC", { exact: true })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await expect(detailSheet.getByText("Email", { exact: true })).toBeVisible({
    timeout: READY_TIMEOUT_MS,
  });
  await waitForSettledContent(page);
  const trusteeDetail: RegisterActionMeasurement = {
    ...(await finishMeasurement(page)),
    action: "trustee-detail",
  };

  await activate(
    page,
    viewport,
    detailSheet.getByRole("button", { exact: true, name: "Add term" })
  );
  const termDialog = page.getByRole("dialog", { name: "Add a term" });
  await expect(
    termDialog.getByRole("textbox", { exact: true, name: "Validity note" })
  ).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await waitForSettledContent(page);
  const addTerm: RegisterActionMeasurement = {
    ...(await finishMeasurement(page)),
    action: "add-term",
  };
  const cancel = termDialog.getByRole("button", {
    exact: true,
    name: "Cancel",
  });
  if (viewport === "mobile") {
    await cancel.tap();
  } else {
    await cancel.click();
  }
  await expect(termDialog).toBeHidden({ timeout: READY_TIMEOUT_MS });
  await page.keyboard.press("Escape");
  await expect(detailSheet).toBeHidden({ timeout: READY_TIMEOUT_MS });

  return [trusteeDetail, addTerm];
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

async function preNavigationJavaScript(page: Page) {
  return await page.evaluate(() => {
    const assets = performance.getEntriesByType("resource").flatMap((item) => {
      const entry = item as PerformanceResourceTiming;
      try {
        const pathname = new URL(entry.name, location.href).pathname;
        return pathname.startsWith("/assets/") && pathname.endsWith(".js")
          ? [entry]
          : [];
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
}

test("measure first and repeat warm governance navigation", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    process.env.GOVERNANCE_WARM_PERFORMANCE !== "true" ||
      process.env.E2E_SERVER === "dev",
    "Opt-in production benchmark on the isolated super_admin test stack only"
  );
  test.setTimeout(1_800_000);
  expect(baseURL, "The benchmark requires the E2E base URL").toBeTruthy();

  const results: RunResult[] = [];
  const runErrors: Array<{
    destination: DestinationName;
    error: Diagnostic;
    pageErrors: Diagnostic[];
    run: number;
    scenario: Scenario;
    viewport: ViewportName;
  }> = [];

  for (const destination of SELECTED_DESTINATIONS) {
    for (const viewport of VIEWPORTS) {
      for (const scenario of scenariosFor(destination)) {
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
          context.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
          const pageErrors: Diagnostic[] = [];
          try {
            await installMetrics(context);
            const page = await context.newPage();
            page.on("pageerror", (error) => pageErrors.push(diagnostic(error)));
            const session = await configureThrottling(context, page);
            await page.goto("/", { waitUntil: "domcontentloaded" });
            await waitForDashboard(page);
            await page.waitForTimeout(DASHBOARD_SETTLE_MS);
            if (EXTRA_IDLE_WAIT_MS > 0) {
              await page.waitForTimeout(EXTRA_IDLE_WAIT_MS);
            }
            const initialTimeOrigin = await page.evaluate(
              () => performance.timeOrigin
            );
            const preNavigationJavaScriptAssets =
              await preNavigationJavaScript(page);
            const first = await measureNavigation(
              page,
              viewport.name,
              destination,
              "first"
            );
            const registerActions =
              scenario === "add-trustee"
                ? await measureAddTrustee(page, viewport.name)
                : scenario === "trustee-detail"
                  ? await measureTrusteeDetailActions(page, viewport.name)
                  : null;
            await returnToDashboard(page, viewport.name);
            const repeat = await measureNavigation(
              page,
              viewport.name,
              destination,
              "repeat"
            );
            results.push({
              destination: destination.name,
              initialTimeOrigin,
              measurements: [first, repeat],
              pageErrors,
              preNavigationJavaScript: preNavigationJavaScriptAssets,
              registerActions,
              run,
              scenario,
              viewport: viewport.name,
            });
            const actions = (registerActions ?? [])
              .map(
                (measurement) =>
                  `${measurement.action}=${Math.round(measurement.clickToReadyMs)}ms/${measurement.postClickJavaScript.totalEncodedBodyBytes}B`
              )
              .join(" ");
            console.log(
              `[governance-warm] ${destination.name}/${viewport.name}/${scenario}/run-${run} first=${Math.round(first.clickToReadyMs)}ms repeat=${Math.round(repeat.clickToReadyMs)}ms pre-js=${preNavigationJavaScriptAssets.totalEncodedBodyBytes}B first-post-click-js=${first.postClickJavaScript.totalEncodedBodyBytes}B repeat-post-click-js=${repeat.postClickJavaScript.totalEncodedBodyBytes}B${actions ? ` ${actions}` : ""}`
            );
            void session;
          } catch (error) {
            runErrors.push({
              destination: destination.name,
              error: diagnostic(error),
              pageErrors,
              run,
              scenario,
              viewport: viewport.name,
            });
          } finally {
            await context.close();
          }
        }
      }
    }
  }

  const report = {
    label: LABEL,
    methodology: {
      cache:
        "HTTP and Zero caches remain enabled within each destination sample",
      clickStart:
        "Capture-phase intended click Event.timeStamp, excluding Playwright actionability work",
      dashboardSettleMs: DASHBOARD_SETTLE_MS,
      extraIdleWaitMs: EXTRA_IDLE_WAIT_MS,
      network: THROTTLING,
      readiness:
        "Level-one heading, Zero ready, route-specific seeded content, no visible skeletons, fonts ready and two animation frames. Meetings verifies the populated Past tab because the real link opens Upcoming. Registrations has no standard seeded row and verifies its search control.",
      registerActions: MEASURE_REGISTER_ACTIONS
        ? "Two independent fresh-context register scenarios: Add trustee until Legal name is ready; Asha Rao detail until private Email is ready, followed by Add term until Validity note is ready. Dialogs are cancelled without mutation. Each action also requires no visible skeletons, fonts ready and two animation frames."
        : "disabled",
      role: "super_admin",
      routeFilter: requestedRoutes,
      routes: SELECTED_DESTINATIONS.map(({ link, name, path: routePath }) => ({
        link,
        name,
        path: routePath,
      })),
      runsPerScenarioAndViewport: RUNS,
      sampleIsolation:
        "A fresh authenticated browser context is used for each destination, viewport, scenario and run. With register actions enabled, Add trustee and trustee detail start in separate fresh contexts. First navigation, optional actions, dashboard return and repeat stay in one document.",
      viewports: VIEWPORTS,
    },
    results,
    runErrors,
  };
  const filename = `governance-warm-${LABEL}.json`;
  const reportPath = testInfo.outputPath(filename);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const comparisonDirectory = path.resolve(
    import.meta.dirname,
    "../../../tmp/web-vitals/governance"
  );
  await mkdir(comparisonDirectory, { recursive: true });
  await writeFile(
    path.join(comparisonDirectory, filename),
    JSON.stringify(report, null, 2)
  );
  await testInfo.attach(filename, {
    contentType: "application/json",
    path: reportPath,
  });

  expect(
    runErrors,
    `Governance warm navigation failures are recorded in ${filename}`
  ).toHaveLength(0);
  expect(
    results.flatMap((result) => result.pageErrors),
    "Governance warm navigation produced uncaught page errors"
  ).toHaveLength(0);
  expect(
    results.every((result) =>
      [...result.measurements, ...(result.registerActions ?? [])].every(
        (measurement) =>
          measurement.sameDocumentTimeOrigin &&
          measurement.timeOrigin === result.initialTimeOrigin
      )
    ),
    "Every navigation and register action measurement must preserve the dashboard document"
  ).toBe(true);
});
