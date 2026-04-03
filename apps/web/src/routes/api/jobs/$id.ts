import { db } from "@pi-dash/db";
import { QUEUE_NAMES } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
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
          const rows = await db.execute<{
            id: string;
            name: string;
            data: object;
            output: object | null;
            state: string;
            priority: number;
            retryLimit: number;
            retryCount: number;
            createdOn: string;
            startedOn: string | null;
            completedOn: string | null;
            startAfter: string;
          }>(
            sql`SELECT id, name, data, output, state, priority, retry_limit AS "retryLimit", retry_count AS "retryCount", created_on AS "createdOn", started_on AS "startedOn", completed_on AS "completedOn", start_after AS "startAfter" FROM pgboss.job_common WHERE id = ${id} AND name IN (${sql.join(
              QUEUE_NAMES.map((n) => sql`${n}`),
              sql`, `
            )}) LIMIT 1`
          );

          const job = rows[0];
          if (!job) {
            return Response.json({ error: "Job not found" }, { status: 404 });
          }

          return Response.json({ job });
        } catch (err) {
          const log = createRequestLogger({
            method: "GET",
            path: `/api/jobs/${id}`,
          });
          log.set({ userId: session.user.id, jobId: id });
          log.error(err instanceof Error ? err : String(err));
          log.emit();
          return Response.json(
            { error: "Failed to fetch job" },
            { status: 500 }
          );
        }
      },
    },
  },
});
