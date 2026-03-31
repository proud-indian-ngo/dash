import { getBoss, QUEUE_NAMES } from "@pi-dash/jobs";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";

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
        const boss = getBoss();

        try {
          for (const queue of QUEUE_NAMES) {
            const job = await boss.getJobById(queue, id, {
              includeArchive: true,
            });
            if (job) {
              return Response.json({ job });
            }
          }

          return Response.json({ error: "Job not found" }, { status: 404 });
        } catch (err) {
          const log = createRequestLogger({
            method: "GET",
            path: `/api/jobs/${id}`,
          });
          log.error(err instanceof Error ? err : String(err));
          return Response.json(
            { error: "Failed to fetch job" },
            { status: 500 }
          );
        }
      },
    },
  },
});
