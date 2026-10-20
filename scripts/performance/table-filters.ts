import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type CDPSession, type Page } from "@playwright/test";

import type { TableFilterWorkloadResult } from "./table-filter-workload";

const CPU_SLOWDOWN_MULTIPLIER = 4;
const EXPECTED_MATCHES = 49_500;
const HEAP_SAMPLING_INTERVAL_BYTES = 4_096;
const OUTPUT_DIR = path.resolve("tmp/rendering-performance/filter");
const PASSES_PER_SAMPLE = 20;
const SAMPLE_COUNT = 7;
const WARMUP_PASSES = 5;

type Cli = { bundlePath?: string; label: string };

type SamplingNode = {
  children: SamplingNode[];
  selfSize: number;
};

function parseCli(args: string[]): Cli {
  const [label, ...options] = args;
  if (!label || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(label)) {
    throw new Error(
      "Usage: bun run scripts/performance/table-filters.ts <safe-label> [--bundle <saved-bundle.js>]"
    );
  }
  if (options.length === 0) return { label };
  if (options.length === 2 && options[0] === "--bundle" && options[1]) {
    return { bundlePath: path.resolve(options[1]), label };
  }
  throw new Error("Only --bundle <saved-bundle.js> is supported");
}

async function buildWorkload() {
  const result = await Bun.build({
    entrypoints: [path.resolve("scripts/performance/table-filter-workload.ts")],
    format: "iife",
    minify: false,
    sourcemap: "none",
    target: "browser",
  });
  if (!result.success || !result.outputs[0]) {
    throw new Error(
      `Table-filter workload build failed:\n${result.logs.join("\n")}`
    );
  }
  return await result.outputs[0].text();
}

async function runWorkload(page: Page, passes: number) {
  return await page.evaluate((runPasses) => {
    const benchmark = (
      globalThis as typeof globalThis & {
        tableFilterBenchmark: (value: number) => TableFilterWorkloadResult;
      }
    ).tableFilterBenchmark;
    if (!benchmark) throw new Error("Table-filter workload is not installed");
    return benchmark(runPasses);
  }, passes);
}

function assertWorkloadResult(
  result: TableFilterWorkloadResult,
  passes: number
) {
  const expected = (EXPECTED_MATCHES / PASSES_PER_SAMPLE) * passes;
  if (
    result.matches !== expected ||
    result.passes !== passes ||
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 0 ||
    result.rows !== 5_000
  ) {
    throw new Error(
      `Unexpected workload result: ${JSON.stringify({ expected, result })}`
    );
  }
}

function sampledBytes(node: SamplingNode): number {
  return (
    node.selfSize +
    node.children.reduce((total, child) => total + sampledBytes(child), 0)
  );
}

async function captureHeapProfile({
  includeCollected,
  page,
  session,
}: {
  includeCollected: boolean;
  page: Page;
  session: CDPSession;
}) {
  await session.send("HeapProfiler.collectGarbage");
  await session.send("HeapProfiler.startSampling", {
    includeObjectsCollectedByMajorGC: includeCollected,
    includeObjectsCollectedByMinorGC: includeCollected,
    samplingInterval: HEAP_SAMPLING_INTERVAL_BYTES,
  });
  const stopSampling = async () =>
    (await session.send("HeapProfiler.stopSampling")).profile;
  let profile: Awaited<ReturnType<typeof stopSampling>> | undefined;
  let workload: TableFilterWorkloadResult | undefined;
  try {
    workload = await runWorkload(page, PASSES_PER_SAMPLE);
    assertWorkloadResult(workload, PASSES_PER_SAMPLE);
    await session.send("HeapProfiler.collectGarbage");
  } finally {
    profile = await stopSampling();
  }
  if (!profile || !workload) throw new Error("Heap profile was not captured");
  return { bytes: sampledBytes(profile.head), profile };
}

const { bundlePath, label } = parseCli(process.argv.slice(2));
await mkdir(OUTPUT_DIR, { recursive: true });
const bundle = bundlePath
  ? await readFile(bundlePath, "utf8")
  : await buildWorkload();
const bundleFilename = `${label}.bundle.js`;
const bundleOutputPath = path.join(OUTPUT_DIR, bundleFilename);
await writeFile(bundleOutputPath, bundle);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { height: 768, width: 1366 },
  });
  await page.addScriptTag({ content: bundle });
  const session = await page.context().newCDPSession(page);
  await session.send("HeapProfiler.enable");
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: CPU_SLOWDOWN_MULTIPLIER,
  });

  const warmup = await runWorkload(page, WARMUP_PASSES);
  assertWorkloadResult(warmup, WARMUP_PASSES);
  const samples: TableFilterWorkloadResult[] = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    await session.send("HeapProfiler.collectGarbage");
    const result = await runWorkload(page, PASSES_PER_SAMPLE);
    assertWorkloadResult(result, PASSES_PER_SAMPLE);
    samples.push(result);
  }

  const retained = await captureHeapProfile({
    includeCollected: false,
    page,
    session,
  });
  const collected = await captureHeapProfile({
    includeCollected: true,
    page,
    session,
  });
  const retainedProfileFilename = `${label}.retained.heapprofile`;
  const collectedProfileFilename = `${label}.collected.heapprofile`;
  await Promise.all([
    writeFile(
      path.join(OUTPUT_DIR, retainedProfileFilename),
      JSON.stringify(retained.profile)
    ),
    writeFile(
      path.join(OUTPUT_DIR, collectedProfileFilename),
      JSON.stringify(collected.profile)
    ),
  ]);

  const report = {
    artifacts: {
      bundle: bundleFilename,
      collectedHeapProfile: collectedProfileFilename,
      retainedHeapProfile: retainedProfileFilename,
    },
    browserVersion: browser.version(),
    bundleSha256: new Bun.CryptoHasher("sha256").update(bundle).digest("hex"),
    cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER,
    heap: {
      sampledIncludingCollectedBytes: collected.bytes,
      sampledRetainedBytes: retained.bytes,
      samplingIntervalBytes: HEAP_SAMPLING_INTERVAL_BYTES,
    },
    label,
    methodology: {
      heap: "HeapProfiler allocation sampling runs after timing in two independent diagnostic passes. The retained profile excludes collected objects; the collected profile includes objects collected by minor and major GC. Sampled totals are approximate and must not be subtracted across runs.",
      scope:
        "Pure filter evaluator workload: every pass compiles one nested filter and applies it to 5,000 synthetic rows. It excludes React, table rendering, DOM work, and user interaction.",
      timing:
        "Browser performance.now wall time under 4x CPU throttling. Five warm-up passes precede seven samples of 20 passes; heap profiling is disabled during timing.",
    },
    runtime: {
      arch: process.arch,
      bun: Bun.version,
      platform: process.platform,
    },
    samples,
    workload: {
      expectedMatchesPerSample: EXPECTED_MATCHES,
      passesPerSample: PASSES_PER_SAMPLE,
      rowsPerPass: 5_000,
      sampleCount: SAMPLE_COUNT,
      warmupPasses: WARMUP_PASSES,
    },
  };
  const reportPath = path.join(OUTPUT_DIR, `${label}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
