import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { CDPSession, Locator, Page, TestInfo } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const READY_TIMEOUT_MS = 30_000;
const ROUNDS = 8;
const HEAP_SAMPLE_INTERVAL_MS = 50;
const CPU_SLOWDOWN_MULTIPLIER = 4;
const VIEWPORT = { height: 768, width: 1366 } as const;
const TAKE_HEAP_SNAPSHOT =
  process.env.RENDERING_PERFORMANCE_HEAP_SNAPSHOT === "true";
const LABEL =
  process.env.RENDERING_PERFORMANCE_LABEL ??
  process.env.PERFORMANCE_LABEL ??
  "current";
const OUTPUT_DIR = path.resolve(
  import.meta.dirname,
  `../../../../tmp/rendering-performance/${LABEL}`
);

const ROUTES = [
  { name: "dashboard", path: "/", sidebarName: "Dashboard" },
  { name: "users", path: "/users", sidebarName: "Users" },
  { name: "events", path: "/events", sidebarName: "Events" },
  {
    name: "reimbursements",
    path: "/reimbursements",
    sidebarName: "Reimbursements",
  },
  { name: "teams", path: "/teams", sidebarName: "Teams" },
] as const;

type RouteName = (typeof ROUTES)[number]["name"];

type Metrics = {
  documents: number;
  eventListeners: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  layoutCount: number;
  layoutDurationMs: number;
  nodes: number;
  recalcStyleCount: number;
  recalcStyleDurationMs: number;
  scriptDurationMs: number;
  taskDurationMs: number;
};

type NavigationMeasurement = {
  afterForcedGc: Metrics;
  afterReady: Metrics;
  before: Metrics;
  cpu: {
    layoutCount: number;
    layoutDurationMs: number;
    recalcStyleCount: number;
    recalcStyleDurationMs: number;
    scriptDurationMs: number;
    taskDurationMs: number;
  };
  domDelta: {
    documents: number;
    eventListeners: number;
    nodes: number;
  };
  heap: {
    peakAboveBaselineBytes: number;
    peakSampledBytes: number;
    postReadyBytes: number;
    retainedAfterForcedGcBytes: number;
    retainedDeltaBytes: number;
    sampleCount: number;
  };
  navigationMs: number;
  round: number;
  route: RouteName;
};

function metricValue(
  metrics: Array<{ name: string; value: number }>,
  name: string
) {
  const value = metrics.find((metric) => metric.name === name)?.value;
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Required CDP metric is missing or invalid: ${name}`);
  }
  return value;
}

async function readMetrics(session: CDPSession): Promise<Metrics> {
  const { metrics } = await session.send("Performance.getMetrics");
  return {
    documents: metricValue(metrics, "Documents"),
    eventListeners: metricValue(metrics, "JSEventListeners"),
    heapTotalBytes: metricValue(metrics, "JSHeapTotalSize"),
    heapUsedBytes: metricValue(metrics, "JSHeapUsedSize"),
    layoutCount: metricValue(metrics, "LayoutCount"),
    layoutDurationMs: metricValue(metrics, "LayoutDuration") * 1000,
    nodes: metricValue(metrics, "Nodes"),
    recalcStyleCount: metricValue(metrics, "RecalcStyleCount"),
    recalcStyleDurationMs: metricValue(metrics, "RecalcStyleDuration") * 1000,
    scriptDurationMs: metricValue(metrics, "ScriptDuration") * 1000,
    taskDurationMs: metricValue(metrics, "TaskDuration") * 1000,
  };
}

async function forceGcAndReadMetrics(session: CDPSession) {
  await session.send("HeapProfiler.collectGarbage");
  return await readMetrics(session);
}

async function readProcessUsage(session: CDPSession) {
  const { processInfo } = await session.send("SystemInfo.getProcessInfo");
  if (platform() !== "darwin" && platform() !== "linux") return null;
  const ids = processInfo.map((process) => process.id);
  const { stdout } = await execFileAsync("ps", [
    "-o",
    "pid=,rss=",
    "-p",
    ids.join(","),
  ]);
  const rssByPid = new Map(
    stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [pid, kib] = line.trim().split(/\s+/).map(Number);
        return [pid!, kib! * 1024] as const;
      })
  );
  return processInfo.map((process) => ({
    cpuSeconds: process.cpuTime,
    rssBytes: rssByPid.get(process.id) ?? null,
    type: process.type,
  }));
}

async function waitForPopulatedRoute(page: Page, route: RouteName) {
  const routePath = ROUTES.find((item) => item.name === route)?.path;
  await page.waitForURL((url) => url.pathname === routePath, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.locator("#main[data-zero-ready]").waitFor({
    timeout: READY_TIMEOUT_MS,
  });
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout: READY_TIMEOUT_MS,
  });

  const expected = {
    dashboard: page
      .getByRole("main")
      .locator('a[href="/users"]')
      .filter({ hasText: /^Users/ })
      .first(),
    events: page
      .getByRole("main")
      .getByRole("link", { name: "E2E Upcoming Public Bangalore", exact: true })
      .first(),
    reimbursements: page
      .getByRole("main")
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: "Row actions" }) })
      .first(),
    teams: page
      .getByRole("main")
      .getByText(/^Synthetic performance team /)
      .first(),
    users: page
      .getByRole("main")
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: "Row actions" }) })
      .first(),
  } satisfies Record<RouteName, Locator>;
  await expect(expected[route]).toBeVisible({ timeout: READY_TIMEOUT_MS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function navigateFromSidebar(page: Page, route: (typeof ROUTES)[number]) {
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page
    .locator('[data-sidebar="content"]')
    .getByRole("link", { exact: true, name: route.sidebarName })
    .click();
  await waitForPopulatedRoute(page, route.name);
  if ((await page.evaluate(() => performance.timeOrigin)) !== timeOrigin) {
    throw new Error(`${route.name} navigation replaced the document`);
  }
}

async function measureNavigation({
  page,
  route,
  round,
  session,
}: {
  page: Page;
  route: (typeof ROUTES)[number];
  round: number;
  session: CDPSession;
}): Promise<NavigationMeasurement> {
  const before = await forceGcAndReadMetrics(session);
  const heapSamples = [before.heapUsedBytes];
  let sampling = true;
  let samplingError: Error | undefined;
  const sampler = (async () => {
    while (sampling) {
      await new Promise((resolve) =>
        setTimeout(resolve, HEAP_SAMPLE_INTERVAL_MS)
      );
      if (!sampling) break;
      try {
        heapSamples.push((await readMetrics(session)).heapUsedBytes);
      } catch (error) {
        samplingError =
          error instanceof Error ? error : new Error(String(error));
        sampling = false;
      }
    }
  })();

  const startedAt = performance.now();
  let afterReady: Metrics | undefined;
  let finishedAt: number | undefined;
  try {
    await navigateFromSidebar(page, route);
    finishedAt = performance.now();
    afterReady = await readMetrics(session);
    heapSamples.push(afterReady.heapUsedBytes);
  } finally {
    sampling = false;
    await sampler;
  }
  if (samplingError) throw samplingError;
  if (!afterReady || finishedAt === undefined) {
    throw new Error(`Metrics were not captured for ${route.name}`);
  }
  const navigationMs = finishedAt - startedAt;
  const retained = await forceGcAndReadMetrics(session);

  return {
    afterForcedGc: retained,
    afterReady,
    before,
    cpu: {
      layoutCount: afterReady.layoutCount - before.layoutCount,
      layoutDurationMs: afterReady.layoutDurationMs - before.layoutDurationMs,
      recalcStyleCount: afterReady.recalcStyleCount - before.recalcStyleCount,
      recalcStyleDurationMs:
        afterReady.recalcStyleDurationMs - before.recalcStyleDurationMs,
      scriptDurationMs: afterReady.scriptDurationMs - before.scriptDurationMs,
      taskDurationMs: afterReady.taskDurationMs - before.taskDurationMs,
    },
    domDelta: {
      documents: retained.documents - before.documents,
      eventListeners: retained.eventListeners - before.eventListeners,
      nodes: retained.nodes - before.nodes,
    },
    heap: {
      peakAboveBaselineBytes: Math.max(...heapSamples) - before.heapUsedBytes,
      peakSampledBytes: Math.max(...heapSamples),
      postReadyBytes: afterReady.heapUsedBytes,
      retainedAfterForcedGcBytes: retained.heapUsedBytes,
      retainedDeltaBytes: retained.heapUsedBytes - before.heapUsedBytes,
      sampleCount: heapSamples.length,
    },
    navigationMs,
    round,
    route: route.name,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function summarize(measurements: NavigationMeasurement[]) {
  return Object.fromEntries(
    ROUTES.map((route) => {
      const routeMeasurements = measurements.filter(
        (measurement) => measurement.route === route.name
      );
      return [
        route.name,
        {
          samples: routeMeasurements.length,
          medianLayoutDurationMs: median(
            routeMeasurements.map((item) => item.cpu.layoutDurationMs)
          ),
          medianNavigationMs: median(
            routeMeasurements.map((item) => item.navigationMs)
          ),
          medianRetainedHeapDeltaBytes: median(
            routeMeasurements.map((item) => item.heap.retainedDeltaBytes)
          ),
          medianScriptDurationMs: median(
            routeMeasurements.map((item) => item.cpu.scriptDurationMs)
          ),
          medianTaskDurationMs: median(
            routeMeasurements.map((item) => item.cpu.taskDurationMs)
          ),
          peakSampledHeapBytes: Math.max(
            ...routeMeasurements.map((item) => item.heap.peakSampledBytes)
          ),
          medianPeakAboveBaselineBytes: median(
            routeMeasurements.map((item) => item.heap.peakAboveBaselineBytes)
          ),
        },
      ];
    })
  );
}

function retainedDashboardTrend(measurements: NavigationMeasurement[]) {
  const checkpoints = measurements
    .filter((measurement) => measurement.route === "dashboard")
    .map((measurement) => ({
      documents: measurement.afterForcedGc.documents,
      eventListeners: measurement.afterForcedGc.eventListeners,
      heapUsedBytes: measurement.afterForcedGc.heapUsedBytes,
      nodes: measurement.afterForcedGc.nodes,
      round: measurement.round,
    }));
  const postWarmup = checkpoints[0];
  const final = checkpoints.at(-1);
  if (!postWarmup || !final) {
    throw new Error("Dashboard retained-memory checkpoints are missing");
  }
  return {
    checkpoints,
    postWarmupToFinalDelta: {
      documents: final.documents - postWarmup.documents,
      eventListeners: final.eventListeners - postWarmup.eventListeners,
      heapUsedBytes: final.heapUsedBytes - postWarmup.heapUsedBytes,
      nodes: final.nodes - postWarmup.nodes,
    },
  };
}

async function captureCpuProfile({
  page,
  session,
  testInfo,
}: {
  page: Page;
  session: CDPSession;
  testInfo: TestInfo;
}) {
  await navigateFromSidebar(page, ROUTES[0]);
  await session.send("Profiler.enable");
  await session.send("Profiler.start");
  try {
    for (const route of ROUTES.slice(1)) {
      await navigateFromSidebar(page, route);
    }
    await navigateFromSidebar(page, ROUTES[0]);
  } finally {
    const { profile } = await session.send("Profiler.stop");
    await session.send("Profiler.disable");
    const filename = `rendering-${LABEL}.cpuprofile`;
    const artifactPath = path.join(OUTPUT_DIR, filename);
    await writeFile(artifactPath, JSON.stringify(profile));
    await testInfo.attach(filename, {
      contentType: "application/json",
      path: artifactPath,
    });
  }
}

async function captureHeapSnapshot({
  phase,
  session,
  testInfo,
}: {
  phase: "warm" | "final";
  session: CDPSession;
  testInfo: TestInfo;
}) {
  const filename = `rendering-${LABEL}-${phase}.heapsnapshot`;
  const artifactPath = path.join(OUTPUT_DIR, filename);
  const output = createWriteStream(artifactPath, { encoding: "utf8" });
  const onChunk = ({ chunk }: { chunk: string }) => output.write(chunk);
  session.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await session.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
    });
  } finally {
    session.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await new Promise<void>((resolve, reject) => {
      output.once("error", reject);
      output.end(resolve);
    });
  }
  await testInfo.attach(filename, {
    contentType: "application/json",
    path: artifactPath,
  });
}

test("measure rendering CPU and renderer heap across repeated navigation", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(
    process.env.RENDERING_PERFORMANCE !== "true" ||
      testInfo.project.name !== "super_admin",
    "Opt-in benchmark on the isolated super_admin stack only"
  );
  test.setTimeout(600_000);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(LABEL)) {
    throw new Error(
      "Rendering performance label must be 1-80 safe filename characters, starting with a letter or digit"
    );
  }
  if (process.env.E2E_SERVER === "dev") {
    throw new Error(
      "Rendering performance requires the production-build E2E server"
    );
  }
  await mkdir(OUTPUT_DIR, { recursive: true });

  const seed = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/seed-app-performance.ts"
      ),
    ],
    { env: process.env, timeout: 90_000 }
  );
  const fixture = JSON.parse(seed.stdout.trim()) as {
    counts: Record<string, number>;
  };

  await page.setViewportSize(VIEWPORT);
  const session = await page.context().newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await session.send("Performance.enable", { timeDomain: "timeTicks" });
  await session.send("HeapProfiler.enable");
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: CPU_SLOWDOWN_MULTIPLIER,
  });

  await page.goto("/");
  await waitForPopulatedRoute(page, "dashboard");
  await forceGcAndReadMetrics(session);
  const measurements: NavigationMeasurement[] = [];
  const processCheckpoints = [
    { round: 0, processes: await readProcessUsage(browserSession) },
  ];

  for (let round = 1; round <= ROUNDS; round++) {
    for (const route of [...ROUTES.slice(1), ROUTES[0]]) {
      measurements.push(
        await measureNavigation({ page, route, round, session })
      );
    }
    processCheckpoints.push({
      round,
      processes: await readProcessUsage(browserSession),
    });
  }

  const report = {
    fixtureCounts: fixture.counts,
    label: LABEL,
    measurements,
    environment: {
      architecture: arch(),
      browser: browser.version(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      platform: platform(),
      systemMemoryBytes: totalmem(),
    },
    processCheckpoints,
    methodology: {
      cpu: "Cumulative renderer Performance.getMetrics deltas; TaskDuration and ScriptDuration are main-thread time proxies, not CPU utilization percentages.",
      cpuProfile:
        "A separate, fully warmed route cycle captured after all unprofiled measurements; excluded from summaries.",
      heap: `JSHeapUsedSize for this page renderer isolate, sampled every ${HEAP_SAMPLE_INTERVAL_MS} ms and after forced GC; excludes browser-process and system RAM.`,
      readiness:
        "Each real sidebar click waits for its route, Zero readiness, no visible skeletons, seeded row/card content, fonts, and two animation frames.",
      retainedTrend:
        "Forced-GC checkpoints use the same Dashboard route at each round end; the reported delta starts after round 1 has warmed route code and caches.",
      heapSnapshots:
        "Optional warm/final snapshots bracket eight additional navigation cycles after timing and CPU profiling. Snapshot overhead is excluded from timing and process-memory checkpoints.",
      processMemory:
        "OS RSS and cumulative CPU seconds for this benchmark browser's CDP-listed processes at Dashboard checkpoints. RSS includes native memory; summing processes can double-count shared pages. Checkpoints are not peaks or minimum hardware requirements.",
    },
    rendererRetainedTrend: retainedDashboardTrend(measurements),
    rounds: ROUNDS,
    summary: summarize(measurements),
    throttling: { cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER },
    viewport: VIEWPORT,
  };
  const reportName = `rendering-${LABEL}.json`;
  const reportPath = path.join(OUTPUT_DIR, reportName);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach(reportName, {
    contentType: "application/json",
    path: reportPath,
  });

  await captureCpuProfile({ page, session, testInfo });
  if (TAKE_HEAP_SNAPSHOT) {
    await forceGcAndReadMetrics(session);
    await captureHeapSnapshot({ phase: "warm", session, testInfo });
    for (let round = 0; round < ROUNDS; round++) {
      for (const route of [...ROUTES.slice(1), ROUTES[0]]) {
        await navigateFromSidebar(page, route);
      }
    }
    await forceGcAndReadMetrics(session);
    await captureHeapSnapshot({ phase: "final", session, testInfo });
  }

  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.send("HeapProfiler.disable");
  await session.send("Performance.disable");
  await session.detach();
  await browserSession.detach();
});
