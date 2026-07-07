import { env } from "@pi-dash/env/server";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL || "",
  },
  dialect: "postgresql",
  out: "./src/migrations",
  schema: "./src/schema",
});
