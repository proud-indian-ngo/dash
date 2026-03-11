// Single-process in-memory rate limiter. State is per-process, lost on restart,
// and not shared across instances. Replace with Redis/Upstash for horizontal scaling.
const store = new Map<string, { count: number; resetAt: number }>();

// Lazy-init prune interval on first use
let pruneInitialized = false;
function ensurePruneInterval() {
  if (pruneInitialized) {
    return;
  }
  pruneInitialized = true;
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);
  interval.unref();
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): RateLimitResult {
  ensurePruneInterval();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  entry.count += 1;
  const remaining = Math.max(limit - entry.count, 0);
  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    resetAt: entry.resetAt,
  };
}

export function rateLimitResponse(info: RateLimitResult): Response {
  const retryAfter = Math.ceil((info.resetAt - Date.now()) / 1000);
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": String(info.limit),
      "X-RateLimit-Remaining": String(info.remaining),
      "X-RateLimit-Reset": String(Math.ceil(info.resetAt / 1000)),
      "Retry-After": String(Math.max(retryAfter, 1)),
    },
  });
}
