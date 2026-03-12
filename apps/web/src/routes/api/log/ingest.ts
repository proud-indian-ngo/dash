import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

export const Route = createFileRoute("/api/log/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let events: unknown[];
        try {
          const body = (await request.json()) as unknown;
          events = Array.isArray(body) ? (body as unknown[]).slice(0, 100) : [];
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        for (const ctx of events) {
          if (!ctx || typeof ctx !== "object") {
            continue;
          }
          const { event } = ctx as { event?: Record<string, unknown> };
          if (!event) {
            continue;
          }

          const log = createRequestLogger({
            method: "POST",
            path: "/api/log/ingest",
          });
          const level = event.level as string | undefined;
          log.set({ ...event, source: "client" });

          if (level === "error") {
            log.error(
              typeof event.message === "string" ? event.message : "Client error"
            );
          } else {
            log.emit();
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
