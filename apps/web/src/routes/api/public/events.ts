import { getPublicEvents } from "@pi-dash/db/queries/public-events";
import { env } from "@pi-dash/env/server";
import {
  parsePublicEventsQuery,
  PublicEventsQueryError,
  type PublicEventsResponse,
} from "@pi-dash/shared/public-events";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createTtlCache, type TtlCache } from "@/lib/ttl-cache";

const PATH = "/api/public/events";
const PUBLIC_EVENTS_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=3600";
const RATE_LIMIT_PER_MINUTE = 60;
// Public, credential-free data for proudindian.ngo and any other site or agent:
// every origin may read it (the per-IP rate limit still applies).
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

let warnedUnknownIp = false;

/**
 * Client IP for rate limiting. Production is only reachable through
 * Cloudflare (see DEPLOYMENT.md), which sets `cf-connecting-ip`. Otherwise use
 * the right-most `x-forwarded-for` hop, the one appended by our own proxy;
 * left-most entries are client-controlled.
 */
export function clientIp(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (ip) {
    return ip;
  }
  if (!warnedUnknownIp) {
    warnedUnknownIp = true;
    const log = createRequestLogger({ method: "GET", path: PATH });
    log.set({
      warning: "no client IP header; public events share one rate-limit key",
    });
    log.emit();
  }
  return "unknown";
}

function withHeaders(response: Response, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export interface PublicEventsHandlerDeps {
  baseUrl: string;
  cache: TtlCache<PublicEventsResponse>;
  checkRateLimit: typeof checkRateLimit;
  getPublicEvents: typeof getPublicEvents;
  now: () => number;
}

// Every website visitor refreshes the list; serve repeats from memory.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 100;

export const createPublicEventsCache = () =>
  createTtlCache<PublicEventsResponse>({
    maxEntries: CACHE_MAX_ENTRIES,
    ttlMs: CACHE_TTL_MS,
  });

const defaultHandlerDeps: PublicEventsHandlerDeps = {
  baseUrl: env.BETTER_AUTH_URL,
  cache: createPublicEventsCache(),
  checkRateLimit,
  getPublicEvents,
  now: Date.now,
};

export async function handlePublicEventsRequest(
  request: Request,
  deps = defaultHandlerDeps
): Promise<Response> {
  const noStore = { ...CORS_HEADERS, "Cache-Control": "no-store" };

  const rateLimit = deps.checkRateLimit(
    `public-events:${clientIp(request)}`,
    RATE_LIMIT_PER_MINUTE
  );
  if (!rateLimit.allowed) {
    return withHeaders(rateLimitResponse(rateLimit), noStore);
  }

  const now = deps.now();
  const params = new URL(request.url).searchParams;
  let query: ReturnType<typeof parsePublicEventsQuery>;
  try {
    query = parsePublicEventsQuery(params, now);
  } catch (error) {
    if (error instanceof PublicEventsQueryError) {
      return Response.json(
        { error: error.message },
        { headers: noStore, status: 400 }
      );
    }
    throw error;
  }

  // `from` defaults to now, so key on the raw param rather than the timestamp.
  const cacheKey = [
    query.city,
    params.get("from") ?? "",
    query.to - query.from,
    query.limit,
  ].join("|");
  try {
    let body = deps.cache.get(cacheKey, now);
    if (!body) {
      body = {
        events: await deps.getPublicEvents(query, deps.baseUrl),
        generatedAt: new Date(now).toISOString(),
      };
      deps.cache.set(cacheKey, body, now);
    }
    return Response.json(body, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": PUBLIC_EVENTS_CACHE_CONTROL,
      },
    });
  } catch (error) {
    const log = createRequestLogger({ method: "GET", path: PATH });
    log.set({ city: query.city, from: query.from, to: query.to });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json(
      { error: "Events are unavailable right now" },
      { headers: noStore, status: 500 }
    );
  }
}

export function handlePublicEventsPreflight(): Response {
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Headers": "Accept, Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
    status: 204,
  });
}

export const Route = createFileRoute("/api/public/events")({
  server: {
    handlers: {
      // Read-only feed: every other method is refused.
      ANY: () =>
        Response.json(
          { error: "Method not allowed" },
          {
            headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" },
            status: 405,
          }
        ),
      GET: ({ request }) => handlePublicEventsRequest(request),
      OPTIONS: () => handlePublicEventsPreflight(),
    },
  },
});
