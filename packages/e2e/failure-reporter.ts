import fs from "node:fs";
import path from "node:path";

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

const FAILURES_FILE = path.resolve(import.meta.dirname, ".failed-specs.json");

/**
 * Records each spec file with a failed attempt, retries included, for the
 * master push's check of E2E selection (`select-tests.ts --shadow`).
 */
export default class FailureReporter implements Reporter {
  private failed = new Set<string>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const testDir = test.parent.project()?.testDir;
    if (testDir && result.status !== "passed" && result.status !== "skipped") {
      this.failed.add(path.relative(testDir, test.location.file));
    }
  }

  onEnd(): void {
    fs.writeFileSync(FAILURES_FILE, JSON.stringify([...this.failed].sort()));
  }
}
