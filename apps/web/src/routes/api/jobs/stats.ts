import { ensureBossReady, QUEUE_NAMES } from "@pi-dash/jobs";
import { createFileRoute } from "@tanstack/react-router";
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

        const boss = await ensureBossReady();

        try {
          const stats = await Promise.all(
            QUEUE_NAMES.map(async (queue) => {
              const size = await boss.getQueueSize(queue);
              return { queue, size };
            })
          );

          return Response.json({ queues: stats });
        } catch (err) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/jobs/stats",
          });
          log.error(err instanceof Error ? err : String(err));
          return Response.json(
            { error: "Failed to fetch queue stats" },
            { status: 500 }
          );
        }
      },
    },
  },
});
