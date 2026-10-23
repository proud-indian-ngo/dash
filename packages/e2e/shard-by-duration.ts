#!/usr/bin/env bun
/**
 * Generates test-list files for balanced sharding based on historical durations.
 *
 * Usage: bun run shard-by-duration.ts [selection.json]
 *
 * Reads .test-durations.json (produced by duration-reporter.ts) and the output
 * of `playwright test --list` to assign tests to shards using greedy bin-packing
 * (longest-processing-time-first), minimizing the maximum shard runtime. With
 * select-tests.ts output, only the selected specs' tests are planned. The
 * shard count follows their total duration.
 *
 * Outputs: shard-lists/shard-{1..N}.txt (test-list files for --test-list flag),
 * and `shards` and `matrix` in $GITHUB_OUTPUT for the e2e job.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DURATIONS_FILE = path.resolve(
  import.meta.dirname,
  ".test-durations.json"
);
const OUTPUT_DIR = path.resolve(import.meta.dirname, "shard-lists");
const DEFAULT_DURATION_MS = 10_000; // 10s default for unknown tests
// Selected test time per shard, summed over the role projects a spec runs
// in, since each project's run is real work. Each shard also spends about
// 70s on setup. The repository is public, so runners are free, and 20
// shards stay well inside the 60 concurrent jobs GitHub Team allows.
const SHARD_TEST_MS = 70_000;
const MAX_SHARDS = 20;
// Pulls in setup and its teardown, exclusive_last, which then runs the specs
// E2E_EXCLUSIVE_LAST names. The path is relative to the config's testDir.
const SETUP_LINE = "[setup] › ../global-setup.ts";

// No selection file (a push, a dispatch or the run-all-e2e label) means all.
const selectionFile = process.argv[2];
const selection: { all: boolean; specs: string[] } =
  selectionFile && fs.existsSync(selectionFile)
    ? JSON.parse(fs.readFileSync(selectionFile, "utf-8"))
    : { all: true, specs: [] };

// 1. Get full test list from Playwright
// Set BASE_URL to prevent Playwright from trying to start a web server
let listOutput: string;
try {
  listOutput = execFileSync(
    "bunx",
    [
      "playwright",
      "test",
      "--config",
      "packages/e2e/playwright.config.ts",
      "--list",
      "--reporter=list",
    ],
    {
      cwd: path.resolve(import.meta.dirname, "../.."),
      encoding: "utf-8",
      env: { ...process.env, BASE_URL: "http://localhost:3099" },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
} catch (caughtError: unknown) {
  const err = caughtError as {
    stdout?: string;
    stderr?: string;
    status?: number;
  };
  console.error("playwright --list failed with exit code:", err.status);
  console.error("stdout:", err.stdout?.slice(0, 500) ?? "(empty)");
  console.error("stderr:", err.stderr?.slice(0, 500) ?? "(empty)");
  process.exit(1);
}

if (!listOutput.trim()) {
  console.error("playwright --list returned empty output");
  process.exit(1);
}

const allLines = listOutput
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("[") && l.includes("›"));
if (allLines.length === 0) {
  console.error("No tests found from --list output. Raw output:");
  console.error(listOutput.slice(0, 500));
  process.exit(1);
}

// "[project] › dir/file.spec.ts:12:3 › title" -> "dir/file.spec.ts"
const specOf = (line: string) => line.split(" › ")[1]?.replace(/:\d+:\d+$/, "");
const selected = new Set(selection.specs);
const listedSpecs = new Set(allLines.map(specOf));
const unlisted = selection.specs.filter((spec) => !listedSpecs.has(spec));
// A selected spec Playwright doesn't list means the two disagree on paths;
// run everything rather than risk running nothing.
const runAll = selection.all || unlisted.length > 0;
if (unlisted.length > 0) {
  console.warn(
    `Selected specs not listed, running all: ${unlisted.join(", ")}`
  );
}
const listedLines = allLines.filter(
  (line) => runAll || selected.has(specOf(line) ?? "")
);
// Setup runs in every shard. Its teardown (exclusive_last) runs only in
// shard 1; CI gives the other shards an empty E2E_EXCLUSIVE_LAST.
const exclusiveLines = listedLines.filter((l) =>
  l.startsWith("[exclusive_last]")
);
const testLines = listedLines.filter(
  (l) => !(l.startsWith("[setup]") || l.startsWith("[exclusive_last]"))
);
const exclusiveSpecs = [...new Set(exclusiveLines.map(specOf))].sort();

// 2. Load historical durations
let durations: Record<string, number> = {};
if (fs.existsSync(DURATIONS_FILE)) {
  try {
    durations = JSON.parse(fs.readFileSync(DURATIONS_FILE, "utf-8"));
  } catch {
    console.warn("Could not parse .test-durations.json, using defaults");
  }
}

// 3. Build test entries with durations
interface TestEntry {
  duration: number;
  line: string;
}

function lookupDuration(line: string): number {
  // Try exact match first, then match ignoring line:col numbers
  let duration = durations[line];
  if (duration === undefined) {
    // Strip line:col from the key for fuzzy matching
    // "[admin] › path.spec.ts:27:3 › Suite › test" → "[admin] › path.spec.ts › Suite › test"
    const normalized = line.replace(/:\d+:\d+\s›/, " ›");
    for (const [key, val] of Object.entries(durations)) {
      if (key.replace(/:\d+:\d+\s›/, " ›") === normalized) {
        duration = val;
        break;
      }
    }
  }
  return duration ?? DEFAULT_DURATION_MS;
}

const entries: TestEntry[] = testLines.map((line) => ({
  duration: lookupDuration(line),
  line,
}));

const exclusiveMs = exclusiveLines.reduce(
  (sum, line) => sum + lookupDuration(line),
  0
);
const totalMs = entries.reduce((sum, e) => sum + e.duration, exclusiveMs);
const totalShards =
  listedLines.length === 0
    ? 0
    : Math.min(MAX_SHARDS, Math.max(1, Math.ceil(totalMs / SHARD_TEST_MS)));

// 4. Greedy bin-packing (Longest Processing Time first)
// Sort by duration descending, assign each test to the shard with lowest total
const shards: { lines: string[]; totalMs: number }[] = Array.from(
  { length: totalShards },
  () => ({ lines: [], totalMs: 0 })
);

// exclusive_last runs alone in shard 1 after everything else. Counting it
// once, not per idle worker, matched measured shard times better.
if (shards[0]) {
  shards[0].totalMs = exclusiveMs;
}

entries.sort((a, b) => b.duration - a.duration);

for (const entry of entries) {
  // Find shard with minimum total duration
  let target = shards[0]!;
  for (const shard of shards) {
    if (shard.totalMs < target.totalMs) {
      target = shard;
    }
  }
  target.lines.push(entry.line);
  target.totalMs += entry.duration;
}

// 5. Write shard list files
fs.rmSync(OUTPUT_DIR, { force: true, recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [i, shard] of shards.entries()) {
  const filePath = path.join(OUTPUT_DIR, `shard-${i + 1}.txt`);
  fs.writeFileSync(filePath, `${[SETUP_LINE, ...shard.lines].join("\n")}\n`);
  const estSeconds = (shard.totalMs / 1000).toFixed(1);
  console.log(
    `Shard ${i + 1}: ${shard.lines.length} tests, ~${estSeconds}s estimated`
  );
}

console.log(
  `\nWrote ${totalShards} shard lists for ${(totalMs / 1000).toFixed(0)}s of tests to ${OUTPUT_DIR}/`
);

const matrix = {
  include: shards.map((_, i) => ({
    exclusiveLast: i === 0 ? exclusiveSpecs.join(",") : "",
    shard: i + 1,
  })),
};
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `shards=${totalShards}\nmatrix=${JSON.stringify(matrix)}\n`
  );
}
