import { env } from "@pi-dash/env/server";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL || "",
  },
  dialect: "postgresql",
  out: "./src/migrations",
  // Includes the server-only tables under schema/private, which the Zero
  // generator never sees because they are not exported from schema/index.ts.
  schema: ["./src/schema", "./src/schema/private"],
  schemaFilter: ["public", "private"],
});
