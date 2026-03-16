import { initLogger } from "evlog";
import { createBrowserLogDrain } from "evlog/browser";

let initialized = false;

export function initClientLogger() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  const drain = createBrowserLogDrain({
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
