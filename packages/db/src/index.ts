import { env } from "@pi-dash/env/server";
import { drizzle } from "drizzle-orm/bun-sql";

// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });
