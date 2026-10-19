import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

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
  readRequestBody: typeof readRequestBody;
};

const defaultDeps: LogIngestDeps = {
  checkRateLimit,
  createRequestLogger,
  readRequestBody,
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

    const log = deps.createRequestLogger({
      method: "POST",
      path: PATH,
      ...(traceId ? { requestId: traceId } : {}),
    });
    // Browser errors reach Error Tracking through posthog-js; the server
    // drain skips `source: "client"`, so these stay logs.
    log.set({ ...event, source: "client" });
    if (event.level === "error" || event.level === "warn") {
      log.setLevel(event.level);
    }
    log.emit();
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
