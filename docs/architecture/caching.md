# Caching & Rate Limiting

> **Load when**: auth cache, permission cache, `getCachedAuth`, `invalidateAuthCache`, `invalidatePermissionCache`, rate limiting, `checkRateLimit`, 429 response, `Retry-After`, cache TTL, HMR-reset cache.
> **Related**: `auth.md`, `authorization.md`, `data-layer.md`

Three independent in-memory caches. None distributed — all scoped to a single process. Horizontal scaling implications noted per-cache.

## Auth Cache (client-side)

`apps/web/src/lib/auth-cache.ts`. Client-side only. Wraps `getAuth()` server function.

- **TTL**: 5 min (`CACHE_TTL = 5 * 60 * 1000`).
- **Dedup**: `inflight: Promise | null` — concurrent callers share one request. Prevents fan-out from TanStack Router viewport preloading.
- **Invalidation**: `invalidateAuthCache()` resets both `cached` and `inflight`. Call after login/logout/role change.
- **On null session**: resets cache, returns `{ session: null, permissions: [] }`.

Used in `_app` layout `beforeLoad` — every protected route calls `getCachedAuth()`.

## Permission Cache (server-side)

`packages/db/src/queries/resolve-permissions.ts`. Server-side per-process.

- **TTL**: 60 sec (`CACHE_TTL_MS = 60_000`).
- **Scope**: keyed by role name.
- **Invalidation**: `invalidatePermissionCache(role)` — call after role/permission mutations.

**Horizontal-scaling caveat**: `invalidatePermissionCache()` only clears the local process. Other instances serve stale data for up to 60 sec after changes. Acceptable for current single-process deployment. If moving to multi-instance: add Redis pub/sub or shorten TTL.

## Rate Limiter (server-side)

`apps/web/src/lib/rate-limit.ts`. In-memory `Map<string, { count, resetAt }>`.

- **API**: `checkRateLimit(key, limit, windowMs = 60_000)` → `{ allowed, limit, remaining, resetAt }`.
- **Response helper**: `rateLimitResponse(info)` → 429 with `X-RateLimit-*` + `Retry-After` headers.
- **Pruning**: lazy 60-sec interval via `ensurePruneInterval()` — `.unref()` so it doesn't block exit.
- **Scope**: single process. Restart / HMR → state lost → limits reset.

**Multi-instance caveat**: each instance maintains separate counters. A user can burn N×instances requests before getting limited. Acceptable for Better Auth sign-in (10/min) where brute-force floor is high enough, but revisit if adding tighter limits.

`/api/public/events` uses key `public-events:<ip>` at 60/min. The IP is `cf-connecting-ip` (production is only reachable through Cloudflare), else the right-most `x-forwarded-for` hop; with neither, all requests share `unknown` and a warning is logged once. The same route keeps a 60-second in-process response cache (`apps/web/src/lib/ttl-cache.ts`, at most 100 entries) keyed by city, raw `from`, window and limit.

Better Auth has its own per-endpoint rate limits (sign-in 10/min, sign-up 5/min) — those live in `packages/auth/src/index.ts`, independent from this limiter.

## Summary

| Cache | Location | TTL | Scope | Invalidation |
|---|---|---|---|---|
| Auth (session + perms) | client | 5 min | per-tab | `invalidateAuthCache()` |
| Permissions (by role) | server process | 60 sec | per-instance | `invalidatePermissionCache(role)` |
| Rate limit counters | server process | window-based (default 60s) | per-instance | reset on restart |
| Public events feed responses | server process | 60 sec (max 100 keys) | per-instance | expiry only |

No Redis, no Memcached, no shared cache layer. Intentional: single-process deployment simplicity. Re-evaluate when horizontal scaling becomes a requirement.
