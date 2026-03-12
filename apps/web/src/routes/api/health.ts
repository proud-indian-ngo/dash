import { db } from "@pi-dash/db";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        let dbConnected = false;
        try {
          await Promise.race([
            db.execute(sql`SELECT 1`),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("DB health check timeout")),
                3000
              )
            ),
          ]);
          dbConnected = true;
        } catch {
          // DB unreachable or timed out — report as degraded
        }

        return Response.json({
          status: dbConnected ? "ok" : "degraded",
          uptime: Math.round(process.uptime()),
          db: { connected: dbConnected },
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
