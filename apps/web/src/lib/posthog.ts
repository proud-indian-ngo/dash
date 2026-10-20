import { env } from "@pi-dash/env/web";
import posthogJs, { type CaptureResult, type Properties } from "posthog-js";

import { CHUNK_ERROR_PATTERNS } from "@/lib/chunk-load-error";

let initialized = false;
let identifiedUserId: string | undefined;
let currentRouteTemplate: string | undefined;
// An error the boundaries already reported must not be reported again on re-render.
const capturedErrors = new WeakSet<Error>();

// Chunk-load failures come from tabs open across a deploy, not from defects.
const IGNORED_LOG_PATTERNS = [
  "_nonReactive",
  "WebSocket connection closed abruptly",
  "Failed to connect",
  ...CHUNK_ERROR_PATTERNS,
];

// Raw URLs, paths and referrers carry record IDs and query strings.
const URL_PROPERTY_RE = /url|referr|pathname/i;
const IP_PROPERTIES = new Set(["ip", "$ip"]);

function scrubProperties(properties: Properties | undefined) {
  if (!properties) {
    return properties;
  }
  const scrubbed: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!(IP_PROPERTIES.has(key) || URL_PROPERTY_RE.test(key))) {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

type ExceptionFrame = { abs_path?: unknown; filename?: unknown };
type ExceptionEntry = { stacktrace?: { frames?: ExceptionFrame[] } };

function stripQuery(value: unknown) {
  return typeof value === "string" ? value.split(/[?#]/)[0] : value;
}

function scrubExceptionList(list: unknown) {
  if (!Array.isArray(list)) {
    return list;
  }
  return (list as ExceptionEntry[]).map((entry) => {
    const frames = entry.stacktrace?.frames;
    if (!frames) {
      return entry;
    }
    return {
      ...entry,
      stacktrace: {
        ...entry.stacktrace,
        frames: frames.map((frame) => ({
          ...frame,
          abs_path: stripQuery(frame.abs_path),
          filename: stripQuery(frame.filename),
        })),
      },
    };
  });
}

/** Drops IP, raw URL and referrer properties; the route template stands in for the URL. */
export function scrubEvent(
  event: CaptureResult,
  routeTemplate: string | undefined
): CaptureResult {
  const properties = scrubProperties(event.properties) ?? {};
  properties.$geoip_disable = true;
  properties.environment = env.VITE_APP_ENV;
  if (env.VITE_APP_RELEASE) {
    properties.release = env.VITE_APP_RELEASE;
  }
  if (routeTemplate) {
    properties.$current_url = routeTemplate;
    properties.$pathname = routeTemplate;
  }
  if (properties.$exception_list) {
    properties.$exception_list = scrubExceptionList(properties.$exception_list);
  }
  return {
    ...event,
    $set: scrubProperties(event.$set),
    $set_once: scrubProperties(event.$set_once),
    properties,
  };
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) {
    return null;
  }
  const payload = JSON.stringify(event.properties ?? {});
  if (IGNORED_LOG_PATTERNS.some((p) => payload.includes(p))) {
    return null;
  }
  return scrubEvent(event, currentRouteTemplate);
}

export function initPostHog(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }
  const key = env.VITE_POSTHOG_KEY;
  if (!key) {
    return;
  }

  initialized = true;
  posthogJs.init(key, {
    api_host: env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    before_send: beforeSend,
    // Window errors and rejections only: the error boundaries report what they
    // catch, and React's console.error for those would be a second copy.
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
    capture_pageleave: false,
    capture_pageview: false,
    disable_session_recording: true,
    disable_surveys: true,
    persistence: "localStorage+cookie",
    save_campaign_params: false,
    save_referrer: false,
  });
}

/** Maps a TanStack route ID to its URL template: `/_app/teams/$id` becomes `/teams/$id`. */
export function routeIdToTemplate(routeId: string): string {
  const segments = routeId
    .split("/")
    .filter((segment) => segment && !segment.startsWith("_"));
  return `/${segments.join("/")}`;
}

export function capturePageview(routeTemplate: string): void {
  currentRouteTemplate = routeTemplate;
  initPostHog();
  if (!initialized) {
    return;
  }
  posthogJs.capture("$pageview", { route_template: routeTemplate });
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>
): void {
  // Child effects run before the root's initPostHog call.
  initPostHog();
  if (!initialized) {
    return;
  }
  if (identifiedUserId && identifiedUserId !== userId) {
    posthogJs.reset();
  }
  identifiedUserId = userId;
  posthogJs.identify(userId, properties);
}

export function resetUser(): void {
  if (!initialized) {
    return;
  }
  identifiedUserId = undefined;
  posthogJs.reset();
}

const IGNORED_ERRORS = ["_nonReactive", "WebSocket connection closed abruptly"];

/**
 * Links React's component stack as the innermost cause, which is how
 * @posthog/react reports it, so Error Tracking shows the crashing component.
 */
export function attachComponentStack(error: Error, componentStack: string) {
  const stackError = new Error(error.message);
  Object.defineProperty(stackError, "name", {
    configurable: true,
    value: `React ErrorBoundary ${error.name}`,
    writable: true,
  });
  stackError.stack = componentStack;
  const seen = new Set<Error>([error]);
  let innermost = error;
  while (innermost.cause instanceof Error && !seen.has(innermost.cause)) {
    innermost = innermost.cause;
    seen.add(innermost);
  }
  if (innermost.cause !== undefined && !(innermost.cause instanceof Error)) {
    stackError.cause = innermost.cause;
  }
  innermost.cause = stackError;
}

export function captureException(
  error: Error,
  properties?: Record<string, unknown>,
  componentStack?: string | null
): void {
  initPostHog();
  if (!initialized || capturedErrors.has(error)) {
    return;
  }
  if (IGNORED_ERRORS.some((msg) => error.message.includes(msg))) {
    return;
  }
  capturedErrors.add(error);
  if (componentStack) {
    attachComponentStack(error, componentStack);
  }
  posthogJs.captureException(error, properties);
}
