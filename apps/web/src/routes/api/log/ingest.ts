import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { sendToPostHogEvents } from "evlog/posthog";

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

          const traceId = event.traceId as string | undefined;
          const log = createRequestLogger({
            method: "POST",
            path: "/api/log/ingest",
            ...(traceId ? { requestId: traceId } : {}),
          });
          const level = event.level as string | undefined;
          log.set({ ...event, source: "client" });

          if (level === "error") {
            log.error(
              typeof event.message === "string" ? event.message : "Client error"
            );
            if (env.POSTHOG_API_KEY) {
              sendToPostHogEvents(
                {
                  ...event,
                  source: "client",
                  timestamp: new Date().toISOString(),
                  level: "error" as const,
                  service: "pi-dash-client",
                  environment: process.env.NODE_ENV ?? "development",
                },
                {
                  apiKey: env.POSTHOG_API_KEY,
                  host: env.POSTHOG_HOST,
                }
              ).catch(() => {
                // Non-critical: don't block log ingestion if PostHog is down
              });
            }
          } else {
            log.emit();
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
