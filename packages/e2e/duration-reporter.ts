import fs from "node:fs";
import path from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

const DURATIONS_FILE = path.resolve(
  import.meta.dirname,
  ".test-durations.json"
);

type Durations = Record<string, number>;

/**
 * Reporter that records test durations to .test-durations.json.
 * Used to enable time-balanced sharding via greedy bin-packing.
 */
export default class DurationReporter implements Reporter {
  private durations: Durations = {};

  onBegin(): void {
    // Load existing durations so we preserve data from other shards
    if (fs.existsSync(DURATIONS_FILE)) {
      try {
        this.durations = JSON.parse(fs.readFileSync(DURATIONS_FILE, "utf-8"));
      } catch {
        this.durations = {};
      }
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "passed" || result.status === "flaky") {
      // Build key matching the `playwright test --list --reporter=list` output:
      // [project] › relative/path.spec.ts:line:col › Suite › test name
      // Paths in --list are relative to testDir (packages/e2e/tests/)
      const project = test.parent.project()?.name ?? "";
      const testDir = test.parent.project()?.testDir ?? "";
      const relFile = testDir
        ? path.relative(testDir, test.location.file)
        : test.location.file;
      const location = `${relFile}:${test.location.line}:${test.location.column}`;
      const titles = test.titlePath().slice(3); // skip root, project, file
      const key = `[${project}] › ${location} › ${titles.join(" › ")}`;
      this.durations[key] = result.duration;
    }
  }

  onEnd(_result: FullResult): void {
    fs.writeFileSync(DURATIONS_FILE, JSON.stringify(this.durations, null, 2));
  }
}
