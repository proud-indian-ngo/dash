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

The public feed, anonymous log ingestion, the receipt verification page and the DSC helper's job endpoint key on the visitor from `trustedClientIp()` (`apps/web/src/lib/client-ip.ts`). Production traffic arrives through Cloudflare and then Dokploy's Traefik, which trusts Cloudflare's ranges, keeps the `x-forwarded-for` Cloudflare built and appends its peer. When that right-most hop is a Cloudflare edge, the visitor is the hop just before it; otherwise the visitor is the right-most hop. Earlier entries and `cf-connecting-ip` are untrusted, and a missing or malformed hop puts the request in one shared bucket. The Cloudflare ranges in that file must match Traefik's `trustedIPs`; see the [deployment checklist](../../DEPLOYMENT.md#production-checklist).

`/api/public/events` responses are cached in the server for 60 seconds and in browsers for longer, so a centre deactivated in Settings can linger after it leaves the server's cache. If the database can't be read, the last active cost centre codes keep serving for up to a day.

Better Auth has its own limits in `packages/auth/src/auth.ts`, separate from this limiter. Its route hands it the same visitor as a single-value `x-forwarded-for`, which keys those limits and is stored as the session IP. Its `trustedProxies` option is not used: it skips every Cloudflare hop, so a client calling from inside Cloudflare could put a forged entry in charge.
