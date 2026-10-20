import { env } from "@pi-dash/env/server";
import { getCurrentTraceId } from "@pi-dash/observability/trace-store";
import { type DrainContext, initLogger } from "evlog";
import { createOTLPDrain } from "evlog/otlp";
import { definePlugin } from "nitro";
import { PostHog } from "posthog-node";

import { createErrorTrackingDrain } from "../../src/lib/server/error-tracking";

const environment = env.APP_ENV;
const release = env.APP_RELEASE;

function buildDrain() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const endpoint = apiKey
    ? `${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"}/i`
    : process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return;
  }

  return createOTLPDrain({
    endpoint,
    semanticConventions: true,
    serviceName: process.env.OTEL_SERVICE_NAME ?? "pi-dash",
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
  });
}

function buildPostHog() {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    return;
  }
  return new PostHog(apiKey, {
    disableGeoip: true,
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  });
}

export default definePlugin((nitroApp) => {
  const exportLogs = buildDrain();
  const posthog = buildPostHog();
  const trackErrors =
    posthog && createErrorTrackingDrain(posthog, { environment, release });

  initLogger({
    drain:
      exportLogs || trackErrors
        ? async (ctx: DrainContext) => {
            const exported = exportLogs?.(ctx);
            trackErrors?.(ctx);
            await exported;
          }
        : undefined,
    env: {
      commitHash: release,
      environment,
      service: process.env.OTEL_SERVICE_NAME ?? "pi-dash",
    },
    pretty: process.env.NODE_ENV !== "production",
    redact: {
      builtins: ["creditCard", "email", "jwt", "bearer", "iban", "secrets"],
    },
  });

  nitroApp.hooks.hook("evlog:enrich", (ctx) => {
    const traceId = getCurrentTraceId();
    if (traceId && !ctx.event.traceId) {
      ctx.event.traceId = traceId;
    }
  });

  if (posthog) {
    nitroApp.hooks.hook("close", () => posthog.shutdown());
  }
});
