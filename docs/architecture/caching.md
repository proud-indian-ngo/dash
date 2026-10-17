# Caching and Rate Limiting

> **Load when**: auth cache, permission cache, `getCachedAuth`, `invalidateAuthCache`, `invalidatePermissionCache`, rate limiting, `checkRateLimit`, 429, `Retry-After`, cache TTL.
> **Related**: `auth.md`, `authorization.md`, `data-layer.md`

Every cache and limiter is in memory in one process. There is no Redis or shared layer, by design for the single-process deployment. Running several instances would need shared invalidation and counters.

| Cache | Where | TTL | Invalidation |
|---|---|---|---|
| Auth (session and permissions) | browser tab | 5 min | `invalidateAuthCache()` |
| Permissions by role | server process | 60 s | `invalidatePermissionCache(roleId)` |
| Rate-limit counters | server process | window (default 60 s) | lost on restart or HMR |
| Public events responses | server process | 60 s, at most 100 keys | expiry only |
| Public events active cost centre codes | server process | 60 s; last codes kept 1 day if a refresh fails | expiry only |

## Auth cache

`apps/web/src/lib/auth-cache.ts` wraps the `getAuth()` server function on the client. The `_app` layout's `beforeLoad` calls `getCachedAuth()` on every protected route.

- Concurrent callers share one in-flight request, which stops fan-out from router viewport preloading.
- Call `invalidateAuthCache()` after sign-in, sign-out or a role change.
- A null session resets the cache and returns `{ session: null, permissions: [] }`.

## Permission cache

`packages/db/src/queries/resolve-permissions.ts`, keyed by role. Call `invalidatePermissionCache(roleId)` after role or permission changes. It clears only the local process; another instance would serve stale permissions for up to 60 seconds.

## Rate limiter

`apps/web/src/lib/rate-limit.ts`: `checkRateLimit(key, limit, windowMs = 60_000)` returns `{ allowed, limit, remaining, resetAt }`, and `rateLimitResponse(info)` builds a 429 with `X-RateLimit-*` and `Retry-After`. Expired entries are pruned on an unref'd 60-second interval.

Limits per minute:

| Caller | Key | Limit |
|---|---|---|
| `/api/zero/mutate` | user | 100 |
| `/api/zero/query` | user | 200 |
| `/api/attachments/download` | user | 30 |
| `/api/media/avatar`, `/api/media/event-update` | user (shared `private-media`) | 300 |
| `/api/media/event-photo` | user; user and photo | 3000; 30 |
| `/api/public/events` | client IP | 60 |
| Social API | token and endpoint | 600 (`social-api.md`) |

For the public feed, the client IP is `cf-connecting-ip` (production is reachable only through Cloudflare), else the right-most `x-forwarded-for` hop. With neither, all requests share `unknown` and a warning is logged once.

`/api/public/events` also keeps a 60-second response cache (`apps/web/src/lib/ttl-cache.ts`, at most 100 entries) keyed by the cost centre codes asked for (every active code without `city`), raw `from`, window and limit. The active codes are refreshed every 60 seconds (`centresCache`, one entry); if the database can't be read, the last codes serve for up to a day with a warning. Responses carry `Cache-Control: public, max-age=300, stale-while-revalidate=3600`, so a centre deactivated in Settings can linger at Cloudflare and in browsers after it leaves the server's cache. `/api/public/openapi.json` is sent with `public, max-age=300`.

Better Auth has its own limits in `packages/auth/src/auth.ts`, separate from this limiter: 100/min by default; sign-in and email verification 10/min; sign-up, forgot and reset password 5/min.
