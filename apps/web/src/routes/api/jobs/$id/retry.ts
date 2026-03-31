import { ensureBossReady, QUEUE_NAMES } from "@pi-dash/jobs";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

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
        const boss = await ensureBossReady();

        try {
          for (const queue of QUEUE_NAMES) {
            const job = await boss.getJobById(queue, id);
            if (job) {
              if (job.state !== "failed") {
                return Response.json(
                  { error: "Only failed jobs can be retried" },
                  { status: 400 }
                );
              }
              await boss.resume(queue, id);
              return Response.json({ success: true });
            }
          }

          return Response.json({ error: "Job not found" }, { status: 404 });
        } catch (err) {
          const log = createRequestLogger({
            method: "POST",
            path: `/api/jobs/${id}/retry`,
          });
          log.error(err instanceof Error ? err : String(err));
          return Response.json(
            { error: "Failed to retry job" },
            { status: 500 }
          );
        }
      },
    },
  },
});
