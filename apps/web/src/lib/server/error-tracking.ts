import type { DrainContext, WideEvent } from "evlog";
import type { PostHog } from "posthog-node";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The error a wide event should report to Error Tracking. Only server events
 * at error level qualify: browser errors belong to posthog-js, client errors
 * (4xx) and aborted requests are not defects. evlog keeps the full stack in
 * production, so the rebuilt error groups like the original.
 */
export function errorToReport(event: WideEvent): Error | undefined {
  if (
    (event.level !== "error" && event.level !== "fatal") ||
    event.source === "client" ||
    !isRecord(event.error) ||
    typeof event.error.message !== "string" ||
    event.error.name === "AbortError"
  ) {
    return undefined;
  }
  const status = event.error.status ?? event.error.statusCode;
  if (typeof status === "number" && status < 500) {
    return undefined;
  }
  const error = new Error(event.error.message);
  if (typeof event.error.name === "string") {
    error.name = event.error.name;
  }
  if (typeof event.error.stack === "string") {
    error.stack = event.error.stack;
  }
  return error;
}

export function createErrorTrackingDrain(
  client: Pick<PostHog, "captureException">,
  config: { environment: string; release?: string }
) {
  return ({ event }: DrainContext) => {
    const error = errorToReport(event);
    if (!error) {
      return;
    }
    const userId = typeof event.userId === "string" ? event.userId : undefined;
    // Without a user, posthog-node sends a personless event.
    client.captureException(error, userId, {
      $geoip_disable: true,
      environment: config.environment,
      release: config.release,
      route: event.path,
      status: event.status,
      traceId: event.traceId ?? event.requestId,
    });
  };
}
