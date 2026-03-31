import { env } from "@pi-dash/env/server";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "./schema";

// Cache on globalThis to survive Vite SSR HMR (same pattern as pg-boss in packages/jobs)
const DB_KEY = "__drizzle_db__";

function createDb() {
  const existing = (globalThis as Record<string, unknown>)[DB_KEY] as
    | ReturnType<typeof drizzle<typeof schema>>
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

export const db = createDb();
