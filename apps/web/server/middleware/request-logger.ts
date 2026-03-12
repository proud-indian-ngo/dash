import { createRequestLogger } from "evlog";
import {
  defineEventHandler,
  getMethod,
  getRequestURL,
  getResponseStatus,
  setHeader,
} from "nitro/h3";

const SKIP_PREFIXES = ["/_build/", "/assets/", "/_server/"];
const SKIP_EXACT = new Set(["/api/log/ingest", "/api/health"]);

function shouldSkip(path: string): boolean {
  return SKIP_EXACT.has(path) || SKIP_PREFIXES.some((p) => path.startsWith(p));
}

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;
  if (shouldSkip(path)) {
    return;
  }

  const requestId = crypto.randomUUID();
  const start = performance.now();
  setHeader(event, "X-Request-Id", requestId);

  if (!event.node?.res) {
    const log = createRequestLogger({
      method: getMethod(event),
      path,
      requestId,
    });
    log.set({
      warning: "missing event.node.res — response listener not attached",
    });
    log.emit();
    return;
  }

  event.node.res.on("finish", () => {
    const log = createRequestLogger({
      method: getMethod(event),
      path,
      requestId,
    });
    log.set({
      status: getResponseStatus(event),
      durationMs: Math.round(performance.now() - start),
    });
    log.emit();
  });
});
