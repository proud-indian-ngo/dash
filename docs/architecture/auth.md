# Auth

> **Load when**: Better Auth, session cookie, sign-in flow, `getAuth`, `getCachedAuth`, `requireSession`, admin user creation, cross-subdomain cookies, `beforeLoad` route guards, `assertPermission`, impersonation, OTP/reset-token flow.
> **Related**: `authorization.md`, `data-layer.md`, `caching.md`

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

## Route Guards (`beforeLoad`)

TanStack Router routes enforce auth + permissions via `beforeLoad`. Two patterns:

**Top-level session gate** (`apps/web/src/routes/_app.tsx`):

```ts
beforeLoad: async ({ location }) => {
  const { session, permissions } = await getCachedAuth();
  if (!session) {
    throw redirect({ to: "/login", search: { redirect: location.pathname } });
  }
  return { permissions, session };
},
```

- `getCachedAuth()` hits client-side 5-min cache (see `caching.md`).
- Returns `{ permissions, session }` into `context` — child routes consume this via `{ context }`.
- `staleTime: Infinity` on `_app` — re-enters `beforeLoad` only when invalidated.

**Per-route permission gate** (e.g. `_app/analytics.tsx`, `_app/users.tsx`, 16 routes total):

```ts
beforeLoad: ({ context }) => assertPermission(context, "analytics.view"),
```

`assertPermission()` throws on missing perm → router catches → 403 page.

**Search-param binding** — reset/OTP routes unpack `location.search` in `beforeLoad` to validate tokens before render. Pattern: `beforeLoad: ({ search }) => { /* validate token */ }` with Zod-parsed `search` schema on the route.

## Admin Impersonation

Better Auth's admin plugin supports impersonation via `session.impersonated_by` column (`packages/db/src/schema/auth.ts`, migration `0002_furry_vermin.sql`).

- **Capability present**: DB column + Better Auth admin plugin wiring.
- **No UI entry point currently**. Trigger would be a server fn calling the admin plugin's impersonate API, setting `impersonated_by = <admin-user-id>` on the new session.
- **Audit**: any action during an impersonated session has a non-null `impersonated_by`. Evlog context should include this field if impersonation is ever wired up — don't let admin actions appear as the impersonated user in logs without audit trail.
- **Scope**: full user permissions. Impersonator cannot escalate beyond target's role.

Before adding UI: decide audit log policy, which actions are blocked during impersonation (e.g., changing target's password), and session-end flow.
