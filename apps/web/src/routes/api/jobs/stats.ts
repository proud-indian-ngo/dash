import { db } from "@pi-dash/db";
import { ensureBossReady } from "@pi-dash/jobs/boss-instance";
import { QUEUE_NAMES } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

export const Route = createFileRoute("/api/jobs/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { session, error } = await requireSession(request);
        if (error) {
          return error;
        }

        try {
          await assertServerPermission(session, "jobs.manage");
        } catch {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        try {
          const boss = await ensureBossReady();
          const stats = await Promise.all(
            QUEUE_NAMES.map(async (queue) => {
              try {
                const result = await boss.getQueueStats(queue);
                return {
                  queue,
                  size: result.queuedCount,
                  active: result.activeCount,
                  total: result.totalCount,
                };
              } catch {
                // Queue may not exist yet (worker startup race)
                return { queue, size: 0, active: 0, total: 0 };
              }
            })
          );

          const stateCountRows = await db.execute<{
            state: string;
            count: number;
          }>(
            sql`SELECT state, COUNT(*)::int AS count FROM pgboss.job_common WHERE name IN (${sql.join(
              QUEUE_NAMES.map((n) => sql`${n}`),
              sql`, `
            )}) GROUP BY state`
          );

          const stateCounts: Record<string, number> = {};
          for (const row of stateCountRows) {
            stateCounts[row.state] = row.count;
          }

          return Response.json({ queues: stats, stateCounts });
        } catch (err) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/jobs/stats",
          });
          log.set({ userId: session.user.id });
          log.error(err instanceof Error ? err : String(err));
          log.emit();
          return Response.json(
            { error: "Failed to fetch queue stats" },
            { status: 500 }
          );
        }
      },
    },
  },
});
