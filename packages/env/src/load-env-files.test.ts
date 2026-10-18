import { describe, expect, it } from "vitest";

import { loadEnvFiles } from "./load-env-files";

const BASE = [
  "DEV_DB_HOST=localhost:5432",
  'DATABASE_URL="postgres://postgres:postgres@${DEV_DB_HOST}/pi-dash"',
  'ZERO_UPSTREAM_DB="${DATABASE_URL}"',
  "APP_NAME=Base",
].join("\n");

const WORKTREE = [
  "WORKTREE_ID=3",
  "DATABASE_URL=postgres://postgres:postgres@localhost:5432/pi-dash-wt3",
  'ZERO_UPSTREAM_DB="${DATABASE_URL}"',
].join("\n");

const BASE_URL = "postgres://postgres:postgres@localhost:5432/pi-dash";
const WORKTREE_URL = "postgres://postgres:postgres@localhost:5432/pi-dash-wt3";
const PROD_URL = "postgres://postgres:secret@prod-host:5432/pi-dash";

describe("loadEnvFiles", () => {
  it("lets .env.worktree override .env", () => {
    const env: Record<string, string | undefined> = {};
    const sources = loadEnvFiles(env, { base: BASE, worktree: WORKTREE });
    expect(env.DATABASE_URL).toBe(WORKTREE_URL);
    expect(env.ZERO_UPSTREAM_DB).toBe(WORKTREE_URL);
    expect(env.APP_NAME).toBe("Base");
    expect(env.WORKTREE_ID).toBe("3");
    expect(sources.get("DATABASE_URL")).toBe(".env.worktree");
    expect(sources.get("APP_NAME")).toBe(".env");
  });

  it("lets explicit environment variables win over .env.worktree", () => {
    const env: Record<string, string | undefined> = { DATABASE_URL: PROD_URL };
    const sources = loadEnvFiles(env, { base: BASE, worktree: WORKTREE });
    expect(env.DATABASE_URL).toBe(PROD_URL);
    // References in .env.worktree resolve to the explicit value.
    expect(env.ZERO_UPSTREAM_DB).toBe(PROD_URL);
    expect(env.WORKTREE_ID).toBe("3");
    expect(sources.get("DATABASE_URL")).toBe("environment");
  });

  it("still overrides values Bun already loaded from .env", () => {
    // `bun run` (or `--env-file=.env`) puts .env into process.env first.
    const env: Record<string, string | undefined> = {
      APP_NAME: "Base",
      DATABASE_URL: BASE_URL,
      DEV_DB_HOST: "localhost:5432",
      ZERO_UPSTREAM_DB: BASE_URL,
    };
    const sources = loadEnvFiles(env, { base: BASE, worktree: WORKTREE });
    expect(env.DATABASE_URL).toBe(WORKTREE_URL);
    expect(env.ZERO_UPSTREAM_DB).toBe(WORKTREE_URL);
    expect(sources.get("DATABASE_URL")).toBe(".env.worktree");
  });

  it("keeps an explicit value when Bun also loaded both files", () => {
    // `DATABASE_URL=... bun --env-file=.env --env-file=.env.worktree run`:
    // Bun keeps the explicit value, and so must loadEnvFiles.
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PROD_URL,
      WORKTREE_ID: "3",
      ZERO_UPSTREAM_DB: PROD_URL,
    };
    loadEnvFiles(env, { base: BASE, worktree: WORKTREE });
    expect(env.DATABASE_URL).toBe(PROD_URL);
    expect(env.ZERO_UPSTREAM_DB).toBe(PROD_URL);
  });

  it("lets explicit variables win over .env without a worktree file", () => {
    const env: Record<string, string | undefined> = { APP_NAME: "Shell" };
    const sources = loadEnvFiles(env, { base: BASE });
    expect(env.APP_NAME).toBe("Shell");
    expect(env.DATABASE_URL).toBe(BASE_URL);
    expect(sources.get("APP_NAME")).toBe("environment");
  });

  it("keeps an explicit empty value over .env", () => {
    // The E2E runner blanks secrets such as RAZORPAY_KEY_SECRET this way.
    const env: Record<string, string | undefined> = { DEV_DB_HOST: "" };
    const sources = loadEnvFiles(env, { base: BASE });
    expect(env.DEV_DB_HOST).toBe("");
    expect(env.DATABASE_URL).toBe("postgres://postgres:postgres@/pi-dash");
    expect(sources.get("DEV_DB_HOST")).toBe("environment");
  });
});
