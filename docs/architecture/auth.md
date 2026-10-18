# Authentication

> **Load when**: Better Auth, sessions, sign-in, volunteer sign-up, `/register` links, email verification redirects, `getAuth`, `requireSession`, the `_app` session gate, Zero auth, impersonation, user admin (`/users`), Settings > Roles, orientation.
> **Related**: `authorization.md` (permissions and route guards), `data-layer.md`, `caching.md`

## Setup

Better Auth is configured in `packages/auth/src/auth.ts`.

- Password accounts use provider `credential`.
- Custom roles are not registered with the admin plugin (`authorization.md`).
- Email verification is required. Public volunteer sign-up is at `/register`.

## Session flow

1. A volunteer signs up (or an admin creates the account), verifies email and signs in.
2. The `_app` layout's `beforeLoad` calls `getCachedAuth()`, which returns session and permissions together and caches them on the client (`caching.md`). With no session it redirects to `/login` with the full current location. If the permissions can't be read it throws to the error screen, whose retry asks again; it never treats the user as having none. `_app` has an infinite `staleTime`, so `beforeLoad` reruns only when invalidated.
3. Server functions and API routes call `requireSession(request)` (`apps/web/src/lib/api-auth.ts`).
4. zero-cache forwards cookies to `/api/zero/mutate` and `/api/zero/query`. The app validates the session cookie and builds the Zero context. There is no separate JWT.

## Volunteer sign-up

### Age

Self-registration is 18+. A Better Auth `before` hook (`packages/auth/src/sign-up-age.ts`) enforces it on `/sign-up/email`, with one day of slack so it never rejects a date the form accepted. Admin-created accounts and profile `dob` edits are exempt.

### Link parameters

Each is optional and independent. Invalid values are dropped and the page still loads.

| Param | Effect |
|---|---|
| `?group=` | Stored on `user.registrationGroup`. Never touches events |
| `?eventId=<uuid>` | Enrols the new user on the event after sign-up, if it is open and has not started |
| `?interestEventId=<uuid>[&occDate=]` | Website sign-up links. Files event interest after verification |

`?eventId=` enrolment:

- Writes `team_event_member` directly; no team membership needed.
- For a Kalakriti-linked event it also adds a volunteer Edition membership and promotes only `unoriented_volunteer` to `volunteer`. Guardian and external identities are excluded.
- Promotion revokes sessions in the same transaction, then invalidates role caches and enqueues jobs after commit.
- Enrolment runs fire-and-forget after the user row is confirmed and never fails sign-up.

`?interestEventId=`:

- Nothing is written at sign-up. The redirect travels through the verification email.
- `/verify-email` files a pending `event_interest` (`packages/auth/src/register-interest.ts`) on the account's first verification only, then notifies team leads. A series occurrence is materialised (`recurring-events.md`).
- Private, Kalakriti, cancelled or started sessions are skipped. It never enrols; a team lead approves as usual.

### Event redirects

- `@pi-dash/shared/event-redirect` is the single validator for sign-up redirects.
- On an unverified sign-in Better Auth re-sends verification. The login form sends the redirect in the `x-auth-event-redirect` header, because a `callbackURL` would make the client redirect plugin reload the page.

### Audit

Unauthenticated sign-up stays outside the audit ledger. Never put group text in `audit_log`.

## Impersonation

- The admin plugin stores the impersonator in `session.impersonated_by`. There is no UI entry point.
- The impersonator gets exactly the target's permissions.
- Audit entries snapshot the actor and impersonator, so deleting a user does not erase attribution.
- Before adding a UI, decide which actions to block while impersonating (such as changing the target's password) and how the session ends. Keep resulting commands inside the audit boundaries.

## Users and access

### User admin

`/users` and its private server-read list need `users.manage`. The list refreshes after mutations, on focus, and while visible because private fields no longer receive Zero updates. `users.view` widens the public directory and permits contact hover details; people can also read their own details. Each user-admin write checks its own permission and is audited.

Private picker reads use their operation's permission: `messages.schedule` for WhatsApp recipients, `finance.manage` for programme leads, and the existing edition-scoped roster authority for Kalakriti registration groups. Roster metadata refreshes as membership changes, on focus and every 30 seconds while visible; background failures leave the loaded roster usable with a retry notice. Avatar fallbacks resolve email and gender on the server and proxy image bytes for authenticated callers; redirects would expose Gravatar email hashes and DiceBear gender parameters. Only approved image hosts and raster content types are accepted, without following redirects. None of these fields enter the shared Zero user projection ([data layer](data-layer.md#schema)).

- A role change revokes the user's sessions and invalidates both roles' permission caches.
- Users with the technical `external_user` role are refused by every action, and no action can assign that role.
- Delete is refused while `userHasExpensesInBooks` finds a standing posting for an expense the user raised or recorded. Those rows cascade with the user, and the next posting run would reverse money that really left the bank, so ban the account instead.
- `users.edit` holders can clear email suppression with **Resume email** ([bounces and complaints](notifications.md#bounces-and-complaints)).

### Roles

Settings > Roles needs `settings.roles`. Admin-tier and technical roles can't be edited. System roles can't be deleted, nor can a role that still has users. Reserved permissions can't be assigned. Checks and the role order are in [authorization](authorization.md).

### Orientation

New sign-ups get `unoriented_volunteer`, seeded with `UNORIENTED_VOLUNTEER_PERMISSIONS`. They join the orientation WhatsApp group, and the team member picker leaves them out.

An admin with `users.edit` orients a volunteer by changing their role to `volunteer`. The orientation job then moves them from the orientation group to the all-volunteers group. Kalakriti enrolment, or a Kalakriti responsibility, also promotes `unoriented_volunteer` to `volunteer` ([volunteer roster and orientation](kalakriti-registration.md#volunteer-roster-and-orientation)). Nothing demotes automatically.
