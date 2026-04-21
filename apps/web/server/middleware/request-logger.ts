import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from "@pi-dash/observability/trace-context";
import { runWithTraceId } from "@pi-dash/observability/trace-store";
import { createRequestLogger } from "evlog";
import { defineMiddleware } from "nitro/h3";

const SKIP_PREFIXES = ["/_build/", "/assets/", "/_server/"];
const SKIP_EXACT = new Set(["/api/log/ingest", "/api/health"]);

function shouldSkip(path: string): boolean {
  return SKIP_EXACT.has(path) || SKIP_PREFIXES.some((p) => path.startsWith(p));
}

export default defineMiddleware(async (event, next) => {
  const path = event.url.pathname;
  if (shouldSkip(path)) {
    return next();
  }

  const incoming = parseTraceparent(
    event.req.headers.get("traceparent") ?? undefined
  );
  const traceId = incoming?.traceId ?? generateTraceId();
  const spanId = generateSpanId();

  event.context.traceId = traceId;
  event.context.spanId = spanId;

  const start = performance.now();
  event.res.headers.set("X-Request-Id", traceId);
  event.res.headers.set("traceparent", formatTraceparent(traceId, spanId));

  const result = await runWithTraceId(traceId, () => next());

  const log = createRequestLogger({
    method: event.req.method,
    path,
    requestId: traceId,
  });
  const status =
    event.res.status ??
    (result instanceof Response ? result.status : undefined);
  log.set({
    traceId,
    spanId,
    ...(status === undefined ? {} : { status }),
    durationMs: Math.round(performance.now() - start),
  });
  log.emit();

  return result;
});
