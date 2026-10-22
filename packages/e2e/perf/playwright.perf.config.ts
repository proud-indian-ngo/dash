import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import baseConfig from "../playwright.config";

const e2eDir = path.resolve(import.meta.dirname, "..");

// Opt-in benchmarks, kept out of the CI suite's test directory. Each spec
// still skips unless its own flag is set.
export default defineConfig({
  expect: baseConfig.expect,
  outputDir: path.join(e2eDir, "test-results"),
  projects: [
    {
      name: "setup",
      testDir: e2eDir,
      testMatch: /global-setup\.ts/,
    },
    {
      dependencies: ["setup"],
      name: "super_admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(e2eDir, ".auth/super_admin.json"),
      },
    },
  ],
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(e2eDir, "playwright-report") }],
  ],
  retries: 0,
  testDir: import.meta.dirname,
  timeout: baseConfig.timeout,
  use: baseConfig.use,
  webServer: baseConfig.webServer,
  workers: 1,
});
