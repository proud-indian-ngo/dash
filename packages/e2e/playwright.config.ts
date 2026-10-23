import { cpus } from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { exclusiveLastPatterns, testIgnoreForRole } from "./project-selection";

const isCI = !!process.env.CI;
// CI names the exclusive_last specs a shard runs, comma-separated; the
// shards after the first get none. Unset runs them all.
const exclusiveLastOnly =
  process.env.E2E_EXCLUSIVE_LAST?.split(",").filter(Boolean);
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
      // Runs once every project that depends on setup has finished.
      teardown: "exclusive_last",
    },
    {
      dependencies: ["setup"],
      // First role project, so its single-live-edition specs, which run one
      // at a time, are queued ahead of the other projects' work.
      name: "unoriented_volunteer",
      // Skip domains whose specs assume access unoriented volunteers lack.
      // Dedicated coverage lives in tests/roles/unoriented-volunteer-flows.spec.ts
      // and tests/authorization/.
      testIgnore: testIgnoreForRole("unoriented_volunteer", [
        /auth\//,
        /users\//,
        /reimbursements\//,
        /teams\//,
      ]),
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/unoriented_volunteer.json"
        ),
      },
    },
    {
      dependencies: ["setup"],
      name: "super_admin",
      testIgnore: testIgnoreForRole("super_admin", [/auth\//]),
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
      testIgnore: testIgnoreForRole("admin", [/auth\//, /users\//]),
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/admin.json"),
      },
    },
    {
      dependencies: ["setup"],
      name: "finance_admin",
      testIgnore: testIgnoreForRole("finance_admin", [/auth\//, /users\//]),
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
      testIgnore: testIgnoreForRole("volunteer", [/auth\//, /users\//]),
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/volunteer.json"),
      },
    },
    {
      // After setup, only so that setup's teardown (exclusive_last) also
      // waits for it.
      dependencies: ["setup"],
      name: "unauthenticated",
      testMatch: /auth\//,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // setup's teardown: runs once every other project has finished, with
      // one worker, so the state it changes is never seen by another spec.
      name: "exclusive_last",
      testMatch: exclusiveLastOnly
        ? exclusiveLastPatterns.filter((pattern) =>
            exclusiveLastOnly.some((spec) => pattern.test(`/${spec}`))
          )
        : exclusiveLastPatterns,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(
          import.meta.dirname,
          ".auth/super_admin.json"
        ),
      },
      workers: 1,
    },
  ],
  reporter: isCI
    ? [
        ["github"],
        ["html"],
        ["./duration-reporter.ts"],
        ["./failure-reporter.ts"],
      ]
    : [["list"], ["html"], ["./duration-reporter.ts"]],
  retries: isCI ? 2 : 1,
  testDir: "./tests",
  timeout: 45_000,
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${webServerPort}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  workers: isCI
    ? undefined
    : Math.min(4, Math.max(1, Math.floor(cpus().length / 2))),
  // When BASE_URL is set, run-e2e.sh already started and pre-warmed the server
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: isCI
            ? `PORT=${webServerPort} bun run .output/server/index.mjs`
            : `bunx --bun vite dev --port ${webServerPort}`,
          cwd: path.resolve(import.meta.dirname, "../../apps/web"),
          reuseExistingServer: !isCI,
          stderr: "pipe",
          stdout: "pipe",
          timeout: isCI ? 30_000 : 180_000,
          url: `http://localhost:${webServerPort}`,
        },
      }),
});
