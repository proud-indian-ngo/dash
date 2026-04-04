#!/usr/bin/env bun
/**
 * Generates test-list files for balanced sharding based on historical durations.
 *
 * Usage: bun run shard-by-duration.ts <total-shards>
 *
 * Reads .test-durations.json (produced by duration-reporter.ts) and the output
 * of `playwright test --list` to assign tests to shards using greedy bin-packing
 * (longest-processing-time-first), minimizing the maximum shard runtime.
 *
 * Outputs: .shard-lists/shard-{1..N}.txt (test-list files for --test-list flag)
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

const totalShards = Number.parseInt(process.argv[2] ?? "4", 10);
if (totalShards < 2) {
  console.error("Usage: bun run shard-by-duration.ts <total-shards>");
  process.exit(1);
}

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
      encoding: "utf-8",
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: { ...process.env, BASE_URL: "http://localhost:3099" },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
} catch (error: unknown) {
  const err = error as { stdout?: string; stderr?: string; status?: number };
  console.error("playwright --list failed with exit code:", err.status);
  console.error("stdout:", err.stdout?.slice(0, 500) ?? "(empty)");
  console.error("stderr:", err.stderr?.slice(0, 500) ?? "(empty)");
  process.exit(1);
}

if (!listOutput.trim()) {
  console.error("playwright --list returned empty output");
  process.exit(1);
}

const testLines = listOutput
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("[") && l.includes("›"))
  // Skip setup project tests — they run as dependencies, not in shards
  .filter((l) => !l.startsWith("[setup]"));

if (testLines.length === 0) {
  console.error("No tests found from --list output. Raw output:");
  console.error(listOutput.slice(0, 500));
  process.exit(1);
}

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

const entries: TestEntry[] = testLines.map((line) => {
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
  return { line, duration: duration ?? DEFAULT_DURATION_MS };
});

// 4. Greedy bin-packing (Longest Processing Time first)
// Sort by duration descending, assign each test to the shard with lowest total
const shards: { lines: string[]; totalMs: number }[] = Array.from(
  { length: totalShards },
  () => ({ lines: [], totalMs: 0 })
);

entries.sort((a, b) => b.duration - a.duration);

for (const entry of entries) {
  // Find shard with minimum total duration
  let minIdx = 0;
  for (let i = 1; i < shards.length; i++) {
    if (shards[i].totalMs < shards[minIdx].totalMs) {
      minIdx = i;
    }
  }
  shards[minIdx].lines.push(entry.line);
  shards[minIdx].totalMs += entry.duration;
}

// 5. Write shard list files
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (let i = 0; i < shards.length; i++) {
  const filePath = path.join(OUTPUT_DIR, `shard-${i + 1}.txt`);
  fs.writeFileSync(filePath, `${shards[i].lines.join("\n")}\n`);
  const estSeconds = (shards[i].totalMs / 1000).toFixed(1);
  console.log(
    `Shard ${i + 1}: ${shards[i].lines.length} tests, ~${estSeconds}s estimated`
  );
}

console.log(`\nWrote ${totalShards} shard lists to ${OUTPUT_DIR}/`);
