import { env } from "@pi-dash/env/server";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "./schema";

// Cache on globalThis to survive Vite SSR HMR (same pattern as pg-boss in packages/jobs)
const DB_KEY = "__drizzle_db__";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function createDb() {
  const existing = (globalThis as Record<string, unknown>)[DB_KEY] as
    | DrizzleDb
    | undefined;
  if (existing) {
    return existing;
  }

  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("application_name", "pi-dash");
  // max: 20 — leaves headroom for pg-boss (10) and Zero (~22) within max_connections=300
  const client = new SQL(url.toString(), { max: 20 });
  const instance = drizzle({ client, schema });

  (globalThis as Record<string, unknown>)[DB_KEY] = instance;

  return instance;
}

function createBrowserDbProxy(): DrizzleDb {
  return new Proxy({} as DrizzleDb, {
    get() {
      throw new Error("db is server-only and cannot be used in the browser");
    },
  });
}

const isBrowser =
  typeof (globalThis as { window?: unknown }).window !== "undefined";

export const db = isBrowser ? createBrowserDbProxy() : createDb();
