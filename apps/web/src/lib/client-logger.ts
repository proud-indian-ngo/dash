import { initLogger } from "evlog";
import {
  clearIdentity as evlogClearIdentity,
  setIdentity as evlogSetIdentity,
} from "evlog/client";
import { createHttpLogDrain } from "evlog/http";

let initialized = false;

export function initClientLogger() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  const drain = createHttpLogDrain({
    drain: { endpoint: "/api/log/ingest" },
    pipeline: {
      batch: { size: 25, intervalMs: 2000 },
      retry: { maxAttempts: 2 },
    },
  });

  initLogger({
    env: { service: "pi-dash-client" },
    pretty: import.meta.env.DEV,
    drain,
  });
}

export function setLogIdentity(userId: string, role: string) {
  evlogSetIdentity({ userId, role });
}

export function clearLogIdentity() {
  evlogClearIdentity();
}
