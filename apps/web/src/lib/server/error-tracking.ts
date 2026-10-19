import { AsyncLocalStorage } from "node:async_hooks";

import type { DrainContext, WideEvent } from "evlog";
import type { PostHog } from "posthog-node";

type ErrorTrackingClient = Pick<PostHog, "captureException">;

interface ErrorTrackingConfig {
  environment: string;
  release?: string;
}

interface RequestErrorScope {
  handlerType: "router" | "serverFn";
  /** Set once Error Tracking has a capture for this request. */
  reported: boolean;
}

// The Nitro plugin and Start's server bundle can load this module as separate
// instances, so the client and the request scope live on globalThis.
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const TRACKER_KEY = Symbol.for("pi-dash:error-tracking");
const SCOPE_KEY = Symbol.for("pi-dash:error-tracking-scope");

shared[SCOPE_KEY] ??= new AsyncLocalStorage<RequestErrorScope>();
const requestScope = shared[SCOPE_KEY] as AsyncLocalStorage<RequestErrorScope>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Client errors (4xx) and aborted requests are not defects. */
function isExpected(name: unknown, status: unknown): boolean {
  return name === "AbortError" || (typeof status === "number" && status < 500);
}

/**
 * The error a wide event should report to Error Tracking. Only server events
 * at error level qualify: browser errors belong to posthog-js. evlog keeps the
 * full stack in production, so the rebuilt error groups like the original.
 */
export function errorToReport(event: WideEvent): Error | undefined {
  if (
    (event.level !== "error" && event.level !== "fatal") ||
    event.source === "client" ||
    !isRecord(event.error) ||
    typeof event.error.message !== "string" ||
    isExpected(event.error.name, event.error.status ?? event.error.statusCode)
  ) {
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
  client: ErrorTrackingClient,
  config: ErrorTrackingConfig
) {
  shared[TRACKER_KEY] = { client, config };
  return ({ event }: DrainContext) => {
    const error = errorToReport(event);
    if (!error) {
      return;
    }
    const scope = requestScope.getStore();
    if (scope) {
      scope.reported = true;
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

/** Runs a Start request so its thrown errors and drained logs share one capture. */
export function runWithErrorScope<T>(
  handlerType: RequestErrorScope["handlerType"],
  fn: () => T
): T {
  return requestScope.run({ handlerType, reported: false }, fn);
}

export function isServerFnRequest(): boolean {
  return requestScope.getStore()?.handlerType === "serverFn";
}

/**
 * Reports an error a server function or API route threw, unless it is
 * expected or its request already has a capture, usually because the handler
 * passed it to `log.error()` before rethrowing. The user is looked up only
 * when the error is reported.
 */
export async function captureThrownError(
  error: unknown,
  properties: { route: string; traceId?: string },
  resolveUserId: () => Promise<string | undefined>
): Promise<void> {
  const tracker = shared[TRACKER_KEY] as
    | { client: ErrorTrackingClient; config: ErrorTrackingConfig }
    | undefined;
  const scope = requestScope.getStore();
  if (!(tracker && error instanceof Error) || scope?.reported) {
    return;
  }
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  if (isExpected(error.name, status ?? statusCode)) {
    return;
  }
  if (scope) {
    scope.reported = true;
  }
  tracker.client.captureException(error, await resolveUserId(), {
    $geoip_disable: true,
    environment: tracker.config.environment,
    release: tracker.config.release,
    status: 500,
    ...properties,
  });
}
