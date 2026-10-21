# Caching and Rate Limiting

> **Load when**: auth or permission cache, `getCachedAuth`, `invalidateAuthCache`, `invalidatePermissionCache`, rate limiting, `checkRateLimit`, 429, cache TTLs.
> **Related**: `auth.md`, `authorization.md`, `data-layer.md`

Every cache and limiter is in memory in one process. There is no Redis or shared layer, by design for the single-process deployment. Running several instances would need shared invalidation and counters.

| Cache | Where | Invalidation |
|---|---|---|
| Auth (session and permissions) | browser tab | `invalidateAuthCache()` |
| User admin data | authenticated browser session | auth invalidation, denied reads, user-admin writes and role writes |
| Permissions by role | server process | `invalidatePermissionCache(roleId)` |
| Rate-limit counters | server process | lost on restart or HMR |
| Public events responses and active cost centre codes | server process | expiry only |

## Auth cache

`apps/web/src/lib/auth-cache.ts` wraps the `getAuth()` server function on the client. Concurrent callers share one in-flight request, which stops fan-out from router viewport preloading. Call `invalidateAuthCache()` after sign-in, sign-out or a role change.

## User admin cache

The Users page keeps its last successful private list and role options in browser memory for the current Better Auth session. Repeat visits show both immediately and refresh them independently in the background. User-admin writes invalidate the list while keeping unchanged role options. Role create, update and delete clear both because labels and available choices can change. Auth invalidation also clears both and invalidates pending reads so an older response cannot restore private data. The cache is unavailable during server rendering.

## Permission cache

Call `invalidatePermissionCache(roleId)` after role or permission changes. It clears only the local process.

## Rate limiter

`apps/web/src/lib/rate-limit.ts` holds `checkRateLimit()` and `rateLimitResponse()`. Each caller sets its own key and limit.

The public feed, anonymous log ingestion, the receipt verification page and the DSC helper's job endpoint use the right-most `x-forwarded-for` hop appended by Dokploy's Traefik. Earlier entries and `cf-connecting-ip` are untrusted. Missing or empty final hops share one bucket. This requires the app to be reachable only through the proxy; see the [deployment checklist](../../DEPLOYMENT.md#production-checklist).

`/api/public/events` responses are cached in the server for 60 seconds and in browsers for longer, so a centre deactivated in Settings can linger after it leaves the server's cache. If the database can't be read, the last active cost centre codes keep serving for up to a day.

Better Auth has its own limits in `packages/auth/src/auth.ts`, separate from this limiter.
