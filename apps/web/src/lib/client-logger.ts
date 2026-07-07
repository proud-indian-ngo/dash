import { initLogger } from "evlog";
import {
  clearIdentity as evlogClearIdentity,
  setIdentity as evlogSetIdentity,
} from "evlog/client";
import { createHttpLogDrain } from "evlog/http";
import { installFetchTracing } from "./tracing";

let initialized = false;

export function initClientLogger() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  installFetchTracing();

  const drain = createHttpLogDrain({
    drain: { endpoint: "/api/log/ingest" },
    pipeline: {
      batch: { intervalMs: 2000, size: 25 },
      retry: { maxAttempts: 2 },
    },
  });

  initLogger({
    drain,
    env: { service: "pi-dash-client" },
    pretty: import.meta.env.DEV,
  });
}

export function setLogIdentity(userId: string, role: string) {
  evlogSetIdentity({ role, userId });
}

export function clearLogIdentity() {
  evlogClearIdentity();
}
