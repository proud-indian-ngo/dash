import fs from "node:fs";
import path from "node:path";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

const DURATIONS_FILE = path.resolve(
  import.meta.dirname,
  ".test-durations.json"
);

type Durations = Record<string, number>;

// Matches the `playwright test --list --reporter=list` output:
// [project] › relative/path.spec.ts:line:col › Suite › test name
// Paths in --list are relative to the project's testDir.
function durationKey(test: TestCase): string {
  const project = test.parent.project()?.name;
  const testDir = test.parent.project()?.testDir;
  const relFile = testDir
    ? path.relative(testDir, test.location.file)
    : test.location.file;
  const location = `${relFile}:${test.location.line}:${test.location.column}`;
  const titles = test.titlePath().slice(3); // skip root, project, file
  return `[${project}] › ${location} › ${titles.join(" › ")}`;
}

const KEY_LOCATION = /^\[(.+?)\] › (.+?):\d+:\d+ › /;

/**
 * Reporter that records test durations to .test-durations.json.
 * Used to enable time-balanced sharding via greedy bin-packing.
 */
export default class DurationReporter implements Reporter {
  private durations: Durations = {};

  onBegin(config: FullConfig, suite: Suite): void {
    // Load existing durations so we preserve data from other shards
    if (fs.existsSync(DURATIONS_FILE)) {
      try {
        this.durations = JSON.parse(fs.readFileSync(DURATIONS_FILE, "utf-8"));
      } catch {
        this.durations = {};
      }
    }

    // Drop entries this run's spec files no longer hold (moved, renamed or
    // removed tests, or a project that now ignores the file) and entries whose
    // spec file or project is gone, so a long-lived local file doesn't
    // accumulate them.
    const current = new Set(suite.allTests().map(durationKey));
    const runFiles = new Set(
      [...current].map((key) => key.match(KEY_LOCATION)?.[2])
    );
    const testDirs = new Map(config.projects.map((p) => [p.name, p.testDir]));
    for (const key of Object.keys(this.durations)) {
      const [, project = "", relFile = ""] = key.match(KEY_LOCATION) ?? [];
      const testDir = testDirs.get(project);
      if (
        !testDir ||
        !fs.existsSync(path.resolve(testDir, relFile)) ||
        (!current.has(key) && runFiles.has(relFile))
      ) {
        delete this.durations[key];
      }
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (
      result.status === "passed" ||
      (result.status === "skipped" && test.expectedStatus === "skipped")
    ) {
      this.durations[durationKey(test)] = result.duration;
    }
  }

  onEnd(_result: FullResult): void {
    fs.writeFileSync(DURATIONS_FILE, JSON.stringify(this.durations, null, 2));
  }
}
