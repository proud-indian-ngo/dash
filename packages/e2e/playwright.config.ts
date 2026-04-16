import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const isTestDB = !!process.env.TEST_DB_URL;
const webServerPort =
  Number(process.env.E2E_WEB_PORT) || (isTestDB ? 3099 : 3001);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: undefined,
  reporter: isCI
    ? [["github"], ["html"], ["./duration-reporter.ts"]]
    : [["list"], ["html"], ["./duration-reporter.ts"]],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${webServerPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      testDir: path.resolve(import.meta.dirname),
    },
    {
      name: "super_admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/super_admin.json"
        ),
      },
      dependencies: ["setup"],
      testIgnore: /auth\//,
    },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/admin.json"),
      },
      dependencies: ["setup"],
      testIgnore: [/auth\//, /users\//],
    },
    {
      name: "finance_admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/finance_admin.json"
        ),
      },
      dependencies: ["setup"],
      testIgnore: [/auth\//, /users\//],
    },
    {
      name: "volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/volunteer.json"),
      },
      dependencies: ["setup"],
      testIgnore: [/auth\//, /users\//],
    },
    {
      name: "unoriented_volunteer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/unoriented_volunteer.json"
        ),
      },
      dependencies: ["setup"],
      // Skip domains whose specs assume access unoriented volunteers lack.
      // Dedicated coverage lives in tests/roles/unoriented-volunteer-flows.spec.ts
      // and tests/authorization/.
      testIgnore: [/auth\//, /users\//, /reimbursements\//, /teams\//],
    },
    {
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\//,
    },
  ],
  // When BASE_URL is set, run-e2e.sh already started and pre-warmed the server
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: isCI
            ? `PORT=${webServerPort} bun run .output/server/index.mjs`
            : `bunx --bun vite dev --port ${webServerPort}`,
          url: `http://localhost:${webServerPort}`,
          reuseExistingServer: !isCI,
          timeout: isCI ? 30_000 : 180_000,
          stdout: "pipe",
          stderr: "pipe",
          cwd: path.resolve(import.meta.dirname, "../../apps/web"),
          env: {
            ...process.env,
          },
        },
      }),
});
