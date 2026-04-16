# Auth

> **Load when**: Better Auth, session cookie, sign-in flow, `getAuth`, `getCachedAuth`, `requireSession`, admin user creation, cross-subdomain cookies.
> **Related**: `authorization.md`, `data-layer.md`

## Setup

Better Auth (`packages/auth/src/index.ts`):

- **Drizzle adapter** — sessions, accounts, verification tokens in Postgres
- **Admin plugin** — roles (`admin`, `volunteer`), ban/unban, impersonate
- **Email/password** — sign-up **disabled** by design (admin creates accounts); email verification required
- **Rate limiting** — sign-in 10/min, sign-up 5/min
- **Session** — 7-day expiry, daily refresh

## Session Lifecycle

1. Admin creates user → verification email sent → user sets password.
2. User signs in → session cookie set (cross-subdomain via `COOKIE_DOMAIN` if configured).
3. `_app` layout `beforeLoad` → `getAuth()` (combined session + permissions server fn) via `getCachedAuth()` — cached client-side 5 min with promise dedup. Prevents redundant calls from viewport preloading.
4. Server functions + API routes call `requireSession(request)` to validate.
5. Zero mutate/query endpoints extract session → build `{ userId, role }` context.

## Zero Auth Integration

Zero cache forwards cookies to app's mutate/query endpoints (`ZERO_MUTATE_FORWARD_COOKIES=true`). App validates session cookie → builds Zero context. **No separate JWT** for Zero auth.
