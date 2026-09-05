import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const isTestDB = !!process.env.TEST_DB_URL;
const webServerPort =
  Number(process.env.E2E_WEB_PORT) || (isTestDB ? 3099 : 3001);

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [
    {
      name: "setup",
      testDir: path.resolve(import.meta.dirname),
      testMatch: /global-setup\.ts/,
    },
    {
      dependencies: ["setup"],
      name: "kalakriti_phase2",
      testIgnore: /auth\//,
      testMatch: [
        /kalakriti\/00-lifecycle-golive\.spec\.ts/,
        /kalakriti\/center-transport\.spec\.ts/,
        /kalakriti\/credential-print\.spec\.ts/,
        /kalakriti\/event-day-stations\.spec\.ts/,
        /kalakriti\/event-day-transport\.spec\.ts/,
        /kalakriti\/release-database-races\.spec\.ts/,
        /kalakriti\/public-schedule\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/super_admin.json"
        ),
      },
      workers: 1,
    },
    {
      dependencies: ["setup"],
      name: "super_admin",
      testIgnore: [
        /auth\//,
        /kalakriti\/00-lifecycle-golive\.spec\.ts/,
        /kalakriti\/center-transport\.spec\.ts/,
        /kalakriti\/credential-print\.spec\.ts/,
        /kalakriti\/event-day-stations\.spec\.ts/,
        /kalakriti\/event-day-transport\.spec\.ts/,
        /kalakriti\/release-database-races\.spec\.ts/,
        /kalakriti\/public-schedule\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/super_admin.json"
        ),
      },
    },
    {
      dependencies: ["setup"],
      name: "admin",
      testIgnore: [/auth\//, /users\//],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/admin.json"),
      },
    },
    {
      dependencies: ["setup"],
      name: "finance_admin",
      testIgnore: [/auth\//, /users\//],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/finance_admin.json"
        ),
      },
    },
    {
      dependencies: ["setup"],
      name: "volunteer",
      testIgnore: [/auth\//, /users\//],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/volunteer.json"),
      },
    },
    {
      dependencies: ["setup"],
      name: "unoriented_volunteer",
      // Skip domains whose specs assume access unoriented volunteers lack.
      // Dedicated coverage lives in tests/roles/unoriented-volunteer-flows.spec.ts
      // and tests/authorization/.
      testIgnore: [/auth\//, /users\//, /reimbursements\//, /teams\//],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/unoriented_volunteer.json"
        ),
      },
    },
    {
      name: "unauthenticated",
      testMatch: /auth\//,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: isCI
    ? [["github"], ["html"], ["./duration-reporter.ts"]]
    : [["list"], ["html"], ["./duration-reporter.ts"]],
  retries: isCI ? 2 : 1,
  testDir: "./tests",
  timeout: 45_000,
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${webServerPort}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  workers: undefined,
  // When BASE_URL is set, run-e2e.sh already started and pre-warmed the server
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: isCI
            ? `PORT=${webServerPort} bun run .output/server/index.mjs`
            : `bunx --bun vite dev --port ${webServerPort}`,
          cwd: path.resolve(import.meta.dirname, "../../apps/web"),
          env: {
            ...process.env,
          },
          reuseExistingServer: !isCI,
          stderr: "pipe",
          stdout: "pipe",
          timeout: isCI ? 30_000 : 180_000,
          url: `http://localhost:${webServerPort}`,
        },
      }),
});
