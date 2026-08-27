# Auth

> **Load when**: Better Auth, session cookie, sign-in flow, `getAuth`, `getCachedAuth`, `requireSession`, admin user creation, cross-subdomain cookies, `beforeLoad` route guards, `assertPermission`, impersonation, OTP/reset-token flow.
> **Related**: `authorization.md`, `data-layer.md`, `caching.md`

## Setup

Better Auth (`packages/auth/src/index.ts`):

- **Drizzle adapter** — sessions, accounts, verification tokens in Postgres. Better Auth 1.7 keys each account by `(issuer, accountId)`; credential rows use `local:credential`.
- **Admin plugin** — roles (`admin`, `volunteer`), ban/unban, impersonate
- **Email/password** — public volunteer signup at `/register` (optional `?eventId=` and `?group=` query params); email verification required
- **Rate limiting** — sign-in 10/min, sign-up 5/min
- **Session** — 7-day expiry, daily refresh

## Volunteer signup

`/_auth/register` creates the user immediately through Better Auth `signUp.email`, then redirects to `/login` for email verification.

Optional independent search params:

- `?group=campus-west` — persisted on `user.registrationGroup` (URL query stays `group`)
- `?eventId=<uuid>` — after signup, the after-signup hook enrolls the new user on that event when it exists, is not cancelled, and has not started. Enroll failures are logged and never block account creation.
- both together, or neither (`/register` unchanged)

Invalid values are dropped; the page still loads. Group-only links never touch events. Event enroll writes `team_event_member` directly (no team membership required). A Kalakriti-linked event also creates or reactivates an **unassigned** volunteer Edition membership. Signup never fails because enroll skipped or conflicted; enroll runs fire-and-forget after a persisted user row is confirmed.

Unauthenticated signup stays outside the central audit ledger. Do not put group text in `audit_log`.

## Session Lifecycle

1. Volunteer signs up at `/register` (or an admin creates the account) → verification email sent → user verifies and signs in.
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
- **Audit**: direct authenticated state-changing commands write to the persistent `audit_log` ledger. Each entry snapshots the acting user's ID, name, and role plus the impersonator's ID and name when `impersonated_by` is present, so later user deletion cannot erase attribution. The ledger stores sanitized IDs and field names rather than request payloads, secrets, or error messages.
- **Scope**: full user permissions. Impersonator cannot escalate beyond target's role.

Before adding impersonation UI, decide which actions are blocked during impersonation (for example, changing the target's password) and define the session-end flow. Keep all resulting commands inside the existing audit boundaries.
