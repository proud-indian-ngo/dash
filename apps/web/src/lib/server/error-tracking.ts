import { AsyncLocalStorage } from "node:async_hooks";

import { errorStatus } from "@pi-dash/observability";
import { type DrainContext, log, type WideEvent } from "evlog";
import type { PostHog } from "posthog-node";

import { HttpError } from "@/lib/http-error";

type ErrorTrackingClient = Pick<PostHog, "captureException">;

interface ErrorTrackingConfig {
  environment: string;
  release?: string;
}

interface RequestErrorScope {
  handlerType: "router" | "serverFn";
  /** Thrown errors this request already reported. */
  reported: WeakSet<Error>;
  /** Name and scrubbed message of each report, since the drain rebuilds errors. */
  reportedKeys: Set<string>;
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

// evlog's builtin maskers, which it does not export: the ones logger.ts
// enables, plus phone numbers written with a country code or area code, and
// Indian mobile numbers without one (a 6-9 lead, 10 digits, whole or grouped
// 5-5, 4-3-3 or 3-3-4, optionally after 0 or 91). Longer digit runs, IDs
// joined by `_` and decimals are left alone.
const PII_MASKERS: [RegExp, (match: string) => string][] = [
  [
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    (m) => `****${m.replace(/[\s-]/g, "").slice(-4)}`,
  ],
  [
    /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})*\.[a-zA-Z]{2,63}\b/g,
    (m) => `${m[0]}***@***${m.slice(m.lastIndexOf("."))}`,
  ],
  [/\beyJ(?:(?!-eyJ)[\w-])*\.[\w-]*\.[\w-]*\b/g, () => "eyJ***.***"],
  [/\bBearer\s+[\w\-.~+/]{8,}=*/gi, () => "Bearer ***"],
  [
    /\b[A-Z]{2}\d{2}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{0,4}[\s-]?[\dA-Z]{0,4}[\s-]?[\dA-Z]{0,4}\b/g,
    (m) => {
      const clean = m.replace(/[\s-]/g, "");
      return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
    },
  ],
  [
    /(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?|\(\d{1,4}\))(?:[\s.-]?\d{2,4}){2,4}\b/g,
    (m) =>
      `${m.startsWith("+") ? "+" : ""}******${m.replace(/\D/g, "").slice(-2)}`,
  ],
  [
    /(?<![\d.,])\b(?:(?:91|0)[\s-]?)?[6-9](?:\d{9}|\d{4}[\s-]\d{5}|\d{3}[\s-]\d{3}[\s-]\d{3}|\d{2}[\s-]\d{3}[\s-]\d{4})\b(?![.,]\d)/g,
    (m) => `******${m.slice(-2)}`,
  ],
];

// DrizzleQueryError appends every bound value: `Failed query: <sql>\nparams: <values>`.
const QUERY_PARAMS_RE = /\nparams: [\s\S]*?(?=\n\s+at |$)/;

/** Removes query parameters and the PII patterns evlog redacts from logs. */
export function scrubText(text: string): string {
  let scrubbed = text.replace(QUERY_PARAMS_RE, "\nparams: [redacted]");
  for (const [pattern, mask] of PII_MASKERS) {
    scrubbed = scrubbed.replace(pattern, mask);
  }
  return scrubbed;
}

/**
 * A copy safe to send: scrubbed message, stack and causes. Own properties are
 * dropped, since they can hold the query, its params or a record.
 */
export function scrubError(error: Error): Error {
  const scrubbed = new Error(
    scrubText(error.message),
    error.cause instanceof Error ? { cause: scrubError(error.cause) } : {}
  );
  scrubbed.name = error.name;
  scrubbed.stack =
    error.stack === undefined ? undefined : scrubText(error.stack);
  return scrubbed;
}

interface ValidationIssue {
  code?: string;
  /** Keys and indices only: Standard Schema paths never hold the input. */
  path: string;
}

function issueSummary(value: unknown): ValidationIssue | undefined {
  if (!(isRecord(value) && typeof value.message === "string")) {
    return undefined;
  }
  const segments = Array.isArray(value.path) ? value.path : [];
  const path = segments
    .map((segment: unknown) =>
      String(isRecord(segment) ? segment.key : segment)
    )
    .join(".");
  return typeof value.code === "string" ? { code: value.code, path } : { path };
}

/**
 * Start's input validator throws a plain Error whose message is the
 * schema's Standard Schema issues as JSON: the caller sent input the server
 * refuses. Returns it as a 400, with each issue's path and code (never its
 * input) for logging; anything else is not a validation error.
 */
export function validationRefusal(
  error: unknown
): { issues: ValidationIssue[]; refusal: HttpError } | undefined {
  if (!(error instanceof Error) || error.constructor !== Error) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(error.message);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return undefined;
  }
  const issues = parsed.map(issueSummary);
  return issues.every((issue) => issue !== undefined)
    ? { issues, refusal: new HttpError(400, error.message) }
    : undefined;
}

/** Client errors (4xx) and aborted requests are not defects. */
function isExpected(error: unknown): boolean {
  const status = errorStatus(error);
  return (
    (isRecord(error) && error.name === "AbortError") ||
    (status !== undefined && status < 500)
  );
}

const ID_SEGMENT_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+)$/i;

/** A request path with its ID segments replaced: `/api/teams/<uuid>` becomes `/api/teams/:id`. */
export function routeTemplate(path: string): string {
  return (path.split(/[?#]/)[0] ?? "")
    .split("/")
    .map((segment) => (ID_SEGMENT_RE.test(segment) ? ":id" : segment))
    .join("/");
}

/** Records a report in its request's scope; false if the request already reported this error. */
function markReported(error: Error): boolean {
  const scope = requestScope.getStore();
  if (!scope) {
    return true;
  }
  const key = `${error.name}: ${scrubText(error.message)}`;
  if (scope.reported.has(error) || scope.reportedKeys.has(key)) {
    return false;
  }
  scope.reported.add(error);
  scope.reportedKeys.add(key);
  return true;
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
    isExpected(event.error)
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
    if (!(error && markReported(error))) {
      return;
    }
    const userId = typeof event.userId === "string" ? event.userId : undefined;
    // Without a user, posthog-node sends a personless event.
    client.captureException(scrubError(error), userId, {
      $geoip_disable: true,
      environment: config.environment,
      release: config.release,
      route:
        typeof event.path === "string" ? routeTemplate(event.path) : undefined,
      status: event.status,
      traceId: event.traceId ?? event.requestId,
    });
  };
}

/** Runs a Start request so its thrown errors and drained logs share one capture per error. */
export function runWithErrorScope<T>(
  handlerType: RequestErrorScope["handlerType"],
  fn: () => T
): T {
  return requestScope.run(
    { handlerType, reported: new WeakSet(), reportedKeys: new Set() },
    fn
  );
}

export function isServerFnRequest(): boolean {
  return requestScope.getStore()?.handlerType === "serverFn";
}

let userLookupFailed = false;

function withoutUser(error: unknown): undefined {
  if (!userLookupFailed) {
    userLookupFailed = true;
    log.warn({
      action: "errorTrackingUserLookup",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return undefined;
}

/**
 * Reports an error a server function or API route threw, unless it is
 * expected or its request already reported it, usually because the handler
 * passed it to `log.error()` before rethrowing. The scope is updated before
 * the first await, so callers need not wait: the user is looked up only when
 * the error is reported, and a failed lookup sends the error without one.
 */
export async function captureThrownError(
  error: unknown,
  properties: { route: string; traceId?: string },
  resolveUserId: () => Promise<string | undefined>
): Promise<void> {
  const tracker = shared[TRACKER_KEY] as
    | { client: ErrorTrackingClient; config: ErrorTrackingConfig }
    | undefined;
  if (
    !(tracker && error instanceof Error) ||
    isExpected(error) ||
    !markReported(error)
  ) {
    return;
  }
  const userId = await resolveUserId().catch(withoutUser);
  tracker.client.captureException(scrubError(error), userId, {
    $geoip_disable: true,
    environment: tracker.config.environment,
    release: tracker.config.release,
    status: 500,
    ...properties,
  });
}
