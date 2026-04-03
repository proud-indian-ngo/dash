import { db } from "@pi-dash/db";
import { ensureBossReady } from "@pi-dash/jobs/boss-instance";
import { QUEUE_NAMES } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/jobs/$id/retry")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { session, error } = await requireSession(request);
        if (error) {
          return error;
        }

        try {
          await assertServerPermission(session, "jobs.manage");
        } catch {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = params;

        if (!UUID_RE.test(id)) {
          return Response.json({ error: "Job not found" }, { status: 404 });
        }

        try {
          const rows = await db.execute<{ name: string; state: string }>(
            sql`SELECT name, state FROM pgboss.job_common WHERE id = ${id} AND name IN (${sql.join(
              QUEUE_NAMES.map((n) => sql`${n}`),
              sql`, `
            )}) LIMIT 1`
          );

          const row = rows[0];
          if (!row) {
            return Response.json({ error: "Job not found" }, { status: 404 });
          }

          if (row.state !== "failed") {
            return Response.json(
              { error: "Only failed jobs can be retried" },
              { status: 400 }
            );
          }

          const boss = await ensureBossReady();
          await boss.retry(row.name, id);
          return Response.json({ success: true });
        } catch (err) {
          const log = createRequestLogger({
            method: "POST",
            path: `/api/jobs/${id}/retry`,
          });
          log.set({ userId: session.user.id, jobId: id });
          log.error(err instanceof Error ? err : String(err));
          log.emit();
          return Response.json(
            { error: "Failed to retry job" },
            { status: 500 }
          );
        }
      },
    },
  },
});
