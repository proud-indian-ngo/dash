import { db } from "@pi-dash/db";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";

// Zero acknowledges replication only once Litestream has backed a change up,
// so an R2 outage or an abandoned slot makes Postgres retain WAL until the
// disk fills (`max_slot_wal_keep_size` is unlimited).
const MAX_RETAINED_WAL_BYTES = 1024 ** 3;
// Longer than a zero-cache restart, so a redeploy doesn't fail the check.
const MAX_INACTIVE_MINUTES = 15;

type Reason = "db_unreachable" | "inactive_slot" | "wal_retained";

const degraded = (reason: Reason) =>
  Response.json(
    { reason, status: "degraded" },
    { headers: { "Cache-Control": "no-store" }, status: 503 }
  );

export const Route = createFileRoute("/api/health/replication")({
  server: {
    handlers: {
      GET: async () => {
        let row: Record<string, unknown> | undefined;
        try {
          const rows = await Promise.race([
            db.execute(sql`
              SELECT
                coalesce(bool_or(
                  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > ${MAX_RETAINED_WAL_BYTES}
                ), false) AS wal_retained,
                coalesce(bool_or(
                  NOT active
                  AND inactive_since < now() - make_interval(mins => ${MAX_INACTIVE_MINUTES})
                ), false) AS inactive_slot
              FROM pg_replication_slots
            `),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Replication health check timeout")),
                3000
              )
            ),
          ]);
          [row] = rows;
        } catch {
          return degraded("db_unreachable");
        }

        if (row?.wal_retained) {
          return degraded("wal_retained");
        }
        if (row?.inactive_slot) {
          return degraded("inactive_slot");
        }
        return Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } }
        );
      },
    },
  },
});
