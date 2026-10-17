# Authentication

> **Load when**: Better Auth, sessions and cookies, sign-in, volunteer sign-up, `/register` links, email verification redirects, `getAuth`, `getCachedAuth`, `requireSession`, the `_app` session gate, Zero auth, impersonation, reset-password and OTP routes, user admin (`/users`), Settings > Roles, orientation.
> **Related**: `authorization.md` (permissions and route permission guards), `data-layer.md`, `caching.md`

## Setup

Better Auth is configured in `packages/auth/src/auth.ts`:

- Drizzle adapter: sessions, accounts and verification tokens in Postgres. Accounts are unique on `(providerId, accountId)`; password accounts use provider `credential`.
- Admin plugin: `adminRoles` are `super_admin`, `admin`, `finance_admin`; default role `unoriented_volunteer`. Ban, unban and impersonation come from it. Custom roles are not registered there (`authorization.md`).
- Email and password with required email verification. Public volunteer sign-up at `/register`.
- Rate limits per minute: sign-in 10, sign-up 5, forgot and reset password 5, verify email 10; 100 otherwise.
- Sessions last 7 days and refresh daily. With `COOKIE_DOMAIN` set the cookie spans subdomains.

## Session flow

1. A volunteer signs up (or an admin creates the account), verifies email and signs in.
2. The `_app` layout's `beforeLoad` calls `getCachedAuth()`, which wraps the `getAuth` server function (session and permissions together). It caches on the client for 5 minutes with promise dedup, so viewport preloading does not refetch (`caching.md`). With no session it redirects to `/login` with the full current location. It returns `{ permissions, session }` into route context. `_app` has `staleTime: Infinity`, so `beforeLoad` reruns only when invalidated.
3. Server functions and API routes call `requireSession(request)` (`apps/web/src/lib/api-auth.ts`).
4. zero-cache forwards cookies to `/api/zero/mutate` and `/api/zero/query` (`ZERO_MUTATE_FORWARD_COOKIES`, `ZERO_QUERY_FORWARD_COOKIES`). The app validates the session cookie and builds the Zero context. There is no separate JWT.

Reset-password and similar token routes validate their Zod-parsed search params in `beforeLoad` before render.

## Volunteer sign-up

`/_auth/register` calls `signUp.email`, which creates the user at once, then redirects to `/login` for verification.

### Age

Self-registration is 18+. The date picker stops at `latestVolunteerDob`. The Better Auth `before` hook (`packages/auth/src/sign-up-age.ts`) rejects `/sign-up/email` with 400 when `dob` is missing, before 1900, or under `MIN_VOLUNTEER_AGE`. It compares UTC calendar dates with one day of slack so it never rejects a date the form accepted. Admin-created accounts and profile `dob` edits are exempt.

### Link parameters

Each is optional and independent. Invalid values are dropped and the page still loads.

| Param | Effect |
|---|---|
| `?group=campus-west` | Stored on `user.registrationGroup`. Never touches events |
| `?eventId=<uuid>` | Enrols the new user on the event after sign-up, if it exists, is not cancelled and has not started |
| `?interestEventId=<uuid>[&occDate=YYYY-MM-DD]` | Website sign-up links (`signUpUrl` from `/api/public/events`). Files event interest after verification |

`?eventId=` enrolment:

- Writes `team_event_member` directly; no team membership needed.
- For a Kalakriti-linked event it also creates or reactivates an unassigned volunteer Edition membership and promotes only `unoriented_volunteer` to `volunteer`. It locks and rechecks the Edition, event, user and membership first; Guardian and external identities are excluded.
- Promotion revokes sessions in the same transaction, then invalidates role caches and enqueues role-change and orientation WhatsApp jobs after commit.
- The default unoriented sign-up job runs after enrolment, only if the stored role is still unoriented.
- Enrolment runs fire-and-forget after the user row is confirmed. Skips, conflicts and failures are logged and never fail sign-up.

`?interestEventId=`:

- The register page shows a banner naming the session (`getPublicSessionSummary`, public non-Kalakriti events only).
- Nothing is written at sign-up. The form passes `/events/<id>[?occDate=]&interest=1` as `callbackURL`; the verification email carries it as `redirect`.
- `/verify-email` files a pending `event_interest` (`fileVerifiedSignUpInterest`, `packages/auth/src/register-interest.ts`) on the account's first verification only, then notifies team leads. For a series the `occDate` session is checked against the RRULE and materialised (`recurring-events.md`).
- Private, Kalakriti, cancelled or started sessions are skipped and logged. It never enrols; a team lead approves as usual.

### Event redirects

- `@pi-dash/shared/event-redirect` is the single validator: only `/events/<uuid>` with `occDate` and `interest=1`.
- A signed-in visitor on `/register?interestEventId=` goes straight to `/events/<id>[?occDate=]`. Invite `?eventId=` links go to `/`.
- The register page's Login link, the post-sign-up `/login`, the verification email and "Resend verification" all carry the redirect. Login drops the `interest` marker before navigating.
- On an unverified sign-in Better Auth re-sends verification. The login form sends the redirect in the `x-auth-event-redirect` header (`EVENT_REDIRECT_HEADER`), because a `callbackURL` would make the client redirect plugin reload the page. `sendVerificationEmail` reads `callbackURL` first, then the header, through the same validator.

### Audit

Unauthenticated sign-up stays outside the audit ledger. Never put group text in `audit_log`.

## Impersonation

- The admin plugin stores the impersonator in `session.impersonated_by` (`packages/db/src/schema/auth.ts`). There is no UI entry point.
- The impersonator gets exactly the target's permissions.
- Audit entries snapshot the actor's ID, name and role, plus the impersonator's ID and name when present (`apps/web/src/lib/audit.ts`), so deleting a user does not erase attribution.
- Before adding a UI, decide which actions to block while impersonating (such as changing the target's password) and how the session ends. Keep resulting commands inside the audit boundaries.

## Users and access

### User admin

`/users` (`routes/_app/users.tsx`, `components/users/`) needs `users.manage` to open. `users.view` only widens Zero user queries for pickers. The server functions live in `apps/web/src/functions/user-admin.ts`; each checks its own permission and runs inside `runSessionAuditedAction`.

| Action | Permission | Notes |
|---|---|---|
| Create | `users.create` | Better Auth `createUser`, then the real role is written to `user.role`. Enqueues the welcome notification, and the orientation WhatsApp job for an unoriented user |
| Edit | `users.edit` | Profile fields, registration group and role. A role change revokes the user's sessions, invalidates both roles' permission caches and enqueues `notify-role-changed` |
| Ban or unban | `users.ban` | Optional reason and future expiry. You can't ban yourself. Each enqueues a notification |
| Set password | `users.set_password` | Enqueues `notify-password-reset` |
| Delete | `users.delete` | You can't delete yourself |

Users with the technical `external_user` role are refused by every action, and no action can assign that role (`apps/web/src/lib/technical-role-policy.ts`).

Delete is refused while `userHasExpensesInBooks` (`packages/db/src/ledger/expense-posting.ts`) finds a standing posting for a reimbursement, vendor payment or vendor payment transaction the user raised or recorded. Those rows cascade with the user, and the next posting run would reverse money that really left the bank, so ban the account instead. A permitted delete enqueues removal from every WhatsApp group, removes the user, then sends the deletion email captured beforehand.

The user sheet shows email suppression after a bounce or complaint. `users.edit` holders can clear it with **Resume email** ([bounces and complaints](notifications.md#bounces-and-complaints)).

### Roles

Settings > Roles (`routes/_app/settings/roles/`, `components/roles/`, `apps/web/src/functions/role-admin.ts`) needs `settings.roles`. It creates custom roles and sets each role's permissions. Admin-tier and technical roles can't be edited. System roles can't be deleted, nor can a role that still has users. Reserved permissions can't be assigned. Every change invalidates the permission cache. Checks and the role order are in [authorization](authorization.md).

### Orientation

New sign-ups get `unoriented_volunteer`, which grants only `events.view_own` and `bank_accounts.manage_own`. They join the orientation WhatsApp group, and the team member picker leaves them out (the event member picker drops only inactive users).

An admin with `users.edit` orients a volunteer by changing their role to `volunteer` on `/users`. The orientation job then adds them to the all-volunteers group and removes them from the orientation group. Kalakriti enrolment, or a Kalakriti responsibility, also promotes `unoriented_volunteer` to `volunteer` ([volunteer roster and orientation](kalakriti-registration.md#volunteer-roster-and-orientation)). Nothing demotes automatically.
