import { getCurrentTraceId } from "@pi-dash/observability/trace-store";
import { initLogger } from "evlog";
import { createOTLPDrain } from "evlog/otlp";
import { definePlugin } from "nitro";

function buildDrain() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const endpoint = apiKey
    ? `${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"}/i`
    : process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return undefined;
  }

  return createOTLPDrain({
    endpoint,
    serviceName: process.env.OTEL_SERVICE_NAME ?? "pi-dash",
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
  });
}

export default definePlugin((nitroApp) => {
  initLogger({
    env: {
      service: process.env.OTEL_SERVICE_NAME ?? "pi-dash",
      environment: process.env.NODE_ENV ?? "production",
    },
    pretty: process.env.NODE_ENV !== "production",
    redact: { builtins: ["creditCard", "email", "jwt", "bearer", "iban"] },
    drain: buildDrain(),
  });

  nitroApp.hooks.hook("evlog:enrich", (ctx) => {
    const traceId = getCurrentTraceId();
    if (traceId && !ctx.event.traceId) {
      ctx.event.traceId = traceId;
    }
  });
});
