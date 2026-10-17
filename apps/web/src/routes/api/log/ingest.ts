import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { sendBatchToPostHogEvents } from "evlog/posthog";

import { trustedClientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readRequestBody } from "@/lib/read-request-body";

const PATH = "/api/log/ingest";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENT_DEPTH = 64;
const MAX_EVENTS = 25;
const READ_TIMEOUT_MS = 3000;
const RATE_LIMIT_PER_MINUTE = 60;

export type LogIngestDeps = {
  checkRateLimit: typeof checkRateLimit;
  createRequestLogger: typeof createRequestLogger;
  postHogApiKey?: string;
  postHogHost?: string;
  readRequestBody: typeof readRequestBody;
  sendBatchToPostHogEvents: typeof sendBatchToPostHogEvents;
};

const defaultDeps: LogIngestDeps = {
  checkRateLimit,
  createRequestLogger,
  postHogApiKey: env.POSTHOG_API_KEY,
  postHogHost: env.POSTHOG_HOST,
  readRequestBody,
  sendBatchToPostHogEvents,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProcessableEvent(event: Record<string, unknown>): boolean {
  const pending: Array<{ depth: number; value: unknown }> = [
    { depth: 0, value: event },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    if (current.depth > MAX_EVENT_DEPTH) {
      return false;
    }
    if (Array.isArray(current.value)) {
      for (const value of current.value) {
        pending.push({ depth: current.depth + 1, value });
      }
      continue;
    }
    if (isRecord(current.value)) {
      for (const [key, value] of Object.entries(current.value)) {
        if (key === "__proto__") {
          return false;
        }
        pending.push({ depth: current.depth + 1, value });
      }
    }
  }
  return true;
}

export async function handleLogIngestRequest(
  request: Request,
  deps: LogIngestDeps = defaultDeps
): Promise<Response> {
  const rateLimit = deps.checkRateLimit(
    `log-ingest:${trustedClientIp(request) ?? "unknown"}`,
    RATE_LIMIT_PER_MINUTE
  );
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const bodyResult = await deps.readRequestBody(request, {
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: READ_TIMEOUT_MS,
  });
  if (!bodyResult.ok) {
    return Response.json(
      {
        error:
          bodyResult.reason === "too_large"
            ? "Payload too large"
            : "Request body unavailable",
      },
      { status: bodyResult.reason === "too_large" ? 413 : 408 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyResult.text) as unknown;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contexts = Array.isArray(body) ? body.slice(0, MAX_EVENTS) : [];
  const postHogEvents: Parameters<typeof sendBatchToPostHogEvents>[0] = [];

  for (const context of contexts) {
    if (!isRecord(context) || !isRecord(context.event)) {
      continue;
    }
    const event = context.event;
    const traceId = event.traceId;
    if (
      !isProcessableEvent(event) ||
      (traceId !== undefined && typeof traceId !== "string")
    ) {
      continue;
    }

    if (event.level === "error") {
      postHogEvents.push({
        ...event,
        environment: process.env.NODE_ENV ?? "development",
        level: "error",
        service: "pi-dash-client",
        source: "client",
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const log = deps.createRequestLogger({
      method: "POST",
      path: PATH,
      ...(traceId ? { requestId: traceId } : {}),
    });
    log.set({ ...event, source: "client" });
    log.emit();
  }

  if (deps.postHogApiKey && postHogEvents.length > 0) {
    deps
      .sendBatchToPostHogEvents(postHogEvents, {
        apiKey: deps.postHogApiKey,
        host: deps.postHogHost,
      })
      .catch(() => {
        // Best effort: client logging must not fail when PostHog is down.
      });
  }

  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/log/ingest")({
  server: {
    handlers: {
      POST: ({ request }) => handleLogIngestRequest(request),
    },
  },
});
