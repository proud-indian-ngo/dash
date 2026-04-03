import { db } from "@pi-dash/db";
import type { JobName } from "@pi-dash/jobs/enqueue";
import { enqueue, QUEUE_NAMES } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { type SQL, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

export const Route = createFileRoute("/api/jobs/")({
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

        const url = new URL(request.url);
        const queue = url.searchParams.get("queue");
        const state = url.searchParams.get("state");
        const limit = Math.min(
          Number(url.searchParams.get("limit") ?? 50),
          100
        );
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

        if (queue && !QUEUE_NAMES.includes(queue as JobName)) {
          return Response.json(
            { error: `Unknown queue: ${queue}` },
            { status: 400 }
          );
        }

        const validStates = [
          "created",
          "retry",
          "active",
          "completed",
          "cancelled",
          "failed",
        ];
        if (state && !validStates.includes(state)) {
          return Response.json(
            { error: `Invalid state: ${state}` },
            { status: 400 }
          );
        }

        try {
          const conditions: SQL[] = [];
          if (queue) {
            conditions.push(sql`name = ${queue}`);
          }
          if (state) {
            conditions.push(sql`state = ${state}`);
          }
          if (conditions.length === 0) {
            conditions.push(
              sql`name IN (${sql.join(
                QUEUE_NAMES.map((n) => sql`${n}`),
                sql`, `
              )})`
            );
          }

          const whereClause = sql.join(conditions, sql` AND `);

          const [jobs, countResult] = await Promise.all([
            db.execute<{
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
              sql`SELECT id, name, data, output, state, priority, retry_limit AS "retryLimit", retry_count AS "retryCount", created_on AS "createdOn", started_on AS "startedOn", completed_on AS "completedOn", start_after AS "startAfter" FROM pgboss.job_common WHERE ${whereClause} ORDER BY created_on DESC LIMIT ${limit} OFFSET ${offset}`
            ),
            db.execute<{ total: number }>(
              sql`SELECT COUNT(*)::int AS total FROM pgboss.job_common WHERE ${whereClause}`
            ),
          ]);

          return Response.json({
            jobs,
            total: countResult[0]?.total ?? 0,
            limit,
            offset,
          });
        } catch (err) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/jobs",
          });
          log.set({ userId: session.user.id, queue, state });
          log.error(err instanceof Error ? err : String(err));
          log.emit();
          return Response.json(
            { error: "Failed to fetch jobs" },
            { status: 500 }
          );
        }
      },

      POST: async ({ request }) => {
        const { session, error } = await requireSession(request);
        if (error) {
          return error;
        }

        try {
          await assertServerPermission(session, "jobs.manage");
        } catch {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        let body: {
          queue: string;
          data: object;
          options?: { startAfter?: string };
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!(body.queue && body.data)) {
          return Response.json(
            { error: "queue and data are required" },
            { status: 400 }
          );
        }

        if (!QUEUE_NAMES.includes(body.queue as JobName)) {
          return Response.json(
            { error: `Unknown queue: ${body.queue}` },
            { status: 400 }
          );
        }

        try {
          const jobId = await enqueue(
            body.queue as JobName,
            body.data as never,
            body.options
          );

          return Response.json({ id: jobId }, { status: 201 });
        } catch (err) {
          const log = createRequestLogger({
            method: "POST",
            path: "/api/jobs",
          });
          log.set({ userId: session.user.id, queue: body.queue });
          log.error(err instanceof Error ? err : String(err));
          log.emit();
          return Response.json(
            { error: "Failed to create job" },
            { status: 500 }
          );
        }
      },
    },
  },
});
