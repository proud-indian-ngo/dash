import { env } from "@pi-dash/env/web";
import posthogJs from "posthog-js";

let initialized = false;

export function initPostHog(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }
  const key = env.VITE_POSTHOG_KEY;
  if (!key) {
    return;
  }

  initialized = true;
  const IGNORED_LOG_PATTERNS = [
    "_nonReactive",
    "WebSocket connection closed abruptly",
    "Failed to connect",
  ];

  posthogJs.init(key, {
    api_host: env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    capture_exceptions: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    persistence: "localStorage+cookie",
    before_send: (event) => {
      if (!event) {
        return null;
      }
      const payload = JSON.stringify(event.properties ?? {});
      if (IGNORED_LOG_PATTERNS.some((p) => payload.includes(p))) {
        return null;
      }
      return event;
    },
  });
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>
): void {
  if (!initialized) {
    return;
  }
  posthogJs.identify(userId, properties);
}

export function resetUser(): void {
  if (!initialized) {
    return;
  }
  posthogJs.reset();
}

const IGNORED_ERRORS = ["_nonReactive", "WebSocket connection closed abruptly"];

export function captureException(
  error: Error,
  properties?: Record<string, unknown>
): void {
  if (!initialized) {
    return;
  }
  if (IGNORED_ERRORS.some((msg) => error.message?.includes(msg))) {
    return;
  }
  posthogJs.captureException(error, properties);
}
