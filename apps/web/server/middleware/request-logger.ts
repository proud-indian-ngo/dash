import "@/lib/logger";
import { createRequestLogger } from "evlog";
import { defineMiddleware } from "nitro/h3";
import { uuidv7 } from "uuidv7";

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

  const requestId = uuidv7();
  const start = performance.now();
  event.res.headers.set("X-Request-Id", requestId);

  const result = await next();

  const log = createRequestLogger({
    method: event.req.method,
    path,
    requestId,
  });
  const status =
    event.res.status ??
    (result instanceof Response ? result.status : undefined);
  log.set({
    ...(status === undefined ? {} : { status }),
    durationMs: Math.round(performance.now() - start),
  });
  log.emit();

  return result;
});
