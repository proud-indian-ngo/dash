import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const isTestDB = !!process.env.TEST_DB_URL;
const webServerPort = isTestDB ? 3099 : 3001;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: undefined,
  reporter: isCI ? [["github"], ["html"]] : "html",
  timeout: 45_000,
  expect: {
    timeout: 15_000,
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
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.resolve(import.meta.dirname, ".auth/admin.json"),
      },
      dependencies: ["setup"],
      testIgnore: /auth\//,
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
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\//,
    },
  ],
  webServer: {
    command: isCI
      ? `PORT=${webServerPort} bun run .output/server/index.mjs`
      : `bunx --bun vite dev --port ${webServerPort}`,
    url: `http://localhost:${webServerPort}`,
    reuseExistingServer: !(isCI || isTestDB),
    timeout: isCI ? 30_000 : 120_000,
    stdout: "pipe",
    stderr: "pipe",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    env: {
      ...process.env,
    },
  },
});
