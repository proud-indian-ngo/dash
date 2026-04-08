# Architecture

## Monorepo Overview

Turborepo monorepo with Bun as package manager.

| Package | Purpose |
|---|---|
| `apps/web` | Full-stack app — React + TanStack Start (SSR, file-based routing) |
| `packages/auth` | Better Auth config, admin seed script |
| `packages/db` | Drizzle ORM schema, migrations, Docker Compose (Postgres, WhatsApp) |
| `packages/email` | React Email templates + Nodemailer transport |
| `packages/env` | Zod-validated env contracts (`server.ts`, `web.ts`) via t3-env |
| `packages/config` | Shared TypeScript & tooling config |
| `packages/design-system` | shadcn/ui + reui components, theme provider |
| `packages/notifications` | Courier multi-channel notifications (inbox, email, WhatsApp) |
| `packages/observability` | `withTaskLog`, `withFireAndForgetLog` helpers |
| `packages/whatsapp` | Self-hosted WhatsApp gateway client (go-whatsapp-web-multidevice) |
| `packages/zero` | Rocicorp Zero — schema, queries, mutators, permissions |
| `packages/e2e` | Playwright E2E tests |

## Data Layer (Zero + Drizzle)

### ID Generation

All entity primary keys use **UUIDv7** via the `uuidv7` npm package. IDs are generated application-side (not database-side) before insert. UUIDv7 embeds a millisecond timestamp, producing time-ordered values that cluster in B-tree indexes — reducing page splits and fragmentation compared to random UUIDv4. Never use `crypto.randomUUID()` or PostgreSQL's `gen_random_uuid()`.

### Schema Generation

Drizzle is the source of truth for the database schema. Zero's client-side schema is **generated** from Drizzle:

```
packages/db/src/schema/*.ts  →  drizzle-zero generate  →  packages/zero/src/schema.ts (auto-generated)
```

Command: `bun run zero:generate` (runs `drizzle-zero generate -f -s ../db/src/schema/index.ts -o src/schema.ts`).

### Mutators (Client + Server)

Mutators are defined once in `packages/zero/src/mutators/` using `defineMutator()` from `@rocicorp/zero`. Each mutator receives `{ tx, ctx, args }`:

- **`tx`** — transaction handle for reads (`tx.run(zql...)`) and writes (`tx.mutate.<table>.insert/update/delete`)
- **`ctx`** — typed context (`Context` from `packages/zero/src/context.ts`) containing `userId`, `role`, and optional `asyncTasks[]`
- **`args`** — Zod-validated input

The same mutator code runs in two places:

| Environment | Behavior |
|---|---|
| **Client** (browser) | Optimistic — applies changes to local SQLite replica immediately. `ctx.asyncTasks` is undefined. |
| **Server** (`/api/zero/mutate`) | Authoritative — runs against Postgres via `zeroDrizzle` adapter. `ctx.asyncTasks` is populated by the route handler; mutators push notification/WhatsApp tasks onto it. After commit, the handler runs all async tasks via `withTaskLog`. |

Mutators are split by domain (e.g., `bank-account.ts`, `reimbursement.ts`, `team.ts`) and aggregated in `packages/zero/src/mutators.ts`.

### Queries

Queries are defined in `packages/zero/src/queries/` using `defineQueries()`. On the client, queries run against the local SQLite replica for instant reads. On the server, the `/api/zero/query` endpoint resolves them against Postgres.

### Permissions

`packages/zero/src/permissions.ts` exports assertion functions (`assertIsLoggedIn`, `assertIsAdmin`) that throw on failure. These are called at the top of server-side mutator execution. On the client, they are no-ops (optimistic path trusts the UI).

### Connection Pool

Server-side PostgreSQL access uses two connection pools, both cached on `globalThis` to survive Vite SSR hot reloads (without this, each HMR cycle leaks a new pool, eventually exhausting `max_connections`):

- **Drizzle pool** (`packages/db/src/index.ts`): Bun SQL, `max: 20`, `application_name: "pi-dash"`. Used by Drizzle ORM queries and Better Auth (via Drizzle adapter).
- **pg-boss pool** (`packages/jobs/src/boss.ts`): `pg` module, `max: 10`, `application_name: "pi-dash-jobs"`. Used for job queue operations. A `startWorker` guard prevents duplicate instances on HMR.
- **Zero Cache**: connects separately via `ZERO_UPSTREAM_DB` (unpooled, for logical replication) — not part of either pool.

### Data Sync

Zero handles real-time sync via PostgreSQL logical replication:

1. PostgreSQL runs with `wal_level=logical` (configured in Docker Compose)
2. `zero-cache` process connects to Postgres via `ZERO_UPSTREAM_DB` and tails the WAL
3. Client connects to `zero-cache` via WebSocket (`VITE_ZERO_URL`)
4. Client maintains a local SQLite replica — reads are instant, writes are optimistic
5. Server-side mutations flow: client → `zero-cache` → `/api/zero/mutate` → Postgres → WAL → `zero-cache` → all clients

The Zero client is initialized in `apps/web/src/components/zero-init.tsx` via `<ZeroProvider>`, which receives the schema, mutators, user context (userId + role), and `storageKey="pi-dash"` to namespace IndexedDB storage.

Route loaders use `context.zero?.preload()` (not `run()`) to sync data ahead of navigation without materializing results into JS objects. The `?.` is required because Zero doesn't exist server-side during SSR — loaders run on the server for initial page load.

Connection errors are monitored globally by `ZeroConnectionMonitor` in `apps/web/src/routes/_app.tsx` using `useConnectionState()`. Individual queries do not handle errors. On `error` state, the monitor shows a debounced toast. On `needs-auth` state (401/403 from Zero endpoints), it redirects to `/login` with the current path as a redirect parameter.

On logout, `zero.delete()` is called (best-effort) before `authClient.signOut()` to clear the user's IndexedDB cache.

### View Transitions

Route navigations use the View Transitions API (`defaultViewTransition: true` in `apps/web/src/router.tsx`). Transition animations are defined in `packages/design-system/styles.css` via `::view-transition-old(root)` and `::view-transition-new(root)` rules using a 150ms expo-out fade. All view transition animations are disabled under `prefers-reduced-motion: reduce`. Browsers without View Transitions API support (e.g., Firefox) fall back to instant navigation with no breakage.

## Auth Flow

### Setup

Better Auth (`packages/auth/src/index.ts`) with:

- **Drizzle adapter** — sessions, accounts, verification tokens stored in Postgres
- **Admin plugin** — roles (`admin`, `volunteer`), ban/unban, impersonate
- **Email/password** — sign-up disabled by design (admin creates accounts); email verification required
- **Rate limiting** — per-endpoint limits (sign-in: 10/min, sign-up: 5/min)
- **Session** — 7-day expiry, daily refresh

### Session Lifecycle

1. Admin creates user → verification email sent → user sets password
2. User signs in → session cookie set (cross-subdomain via `COOKIE_DOMAIN` if configured)
3. `_app` layout `beforeLoad` calls `getAuth()` (combined session + permissions server function) via `getCachedAuth()` — cached client-side for 5 minutes with promise dedup to prevent redundant calls from viewport preloading
4. Server functions and API routes call `requireSession(request)` to validate
5. Zero mutate/query endpoints extract session → build `{ userId, role }` context

### Zero Auth Integration

Zero cache forwards cookies to the app's mutate/query endpoints (`ZERO_MUTATE_FORWARD_COOKIES=true`). The app validates the session cookie and builds the Zero context — no separate JWT for Zero auth.

## Authorization

### Permission Model

Permissions are code-defined in `packages/db/src/permissions.ts` and synced to the `permission` table via `syncPermissions()`. This runs automatically on server boot via the Nitro plugin at `apps/web/server/plugins/sync-permissions.ts`. Roles are stored in the `role` table. The `rolePermission` join table maps roles to permissions.

```
role  →  rolePermission  →  permission (code-defined, DB-synced)
```

### Role Hierarchy

Roles are stored in the `role` table. Built-in system roles (highest to lowest privilege):

1. **admin** — all permissions, system role
2. **Custom roles** (e.g. `team_lead`) — configurable permissions via role management UI
3. **volunteer** — baseline permissions for oriented volunteers
4. **unoriented_volunteer** — minimal permissions, default for new users who haven't completed orientation

The default role for new users and null-role fallbacks is `unoriented_volunteer`. Better Auth's admin plugin only knows `admin` vs `volunteer` — custom roles are stored in `user.role` and mapped via `toBetterAuthRole()`.

### Resolution

`resolvePermissions()` in `packages/db/src/queries/resolve-permissions.ts` fetches a user's effective permissions from their assigned role. Results are cached in-memory for 60 seconds. Call `invalidatePermissionCache()` after role or permission changes to bust the cache.

### Enforcement Layers

| Layer | Mechanism |
|---|---|
| Zero mutators (server) | `assertHasPermission(ctx, "permission.id")` — throws if user lacks the permission |
| Zero mutators (team-scoped) | `assertHasPermissionOrTeamLead()` — allows team leads to perform team-scoped operations without the global permission |
| Zero queries | `can(ctx, "permission.id")` — boolean check for conditional query filtering |
| Route guards | `assertPermission(session, "permission.id")` — server-side route protection |
| Server functions | `resolvePermissions(userId)` — direct permission resolution for complex checks |
| UI | `hasPermission("permission.id")` via `AppContext` — controls visibility of UI elements |

### Better Auth Compatibility

`toBetterAuthRole()` maps custom roles to `admin` or `volunteer` for Better Auth's admin plugin, which expects one of those two values. Custom roles with admin-level permissions map to `admin`; all others map to `volunteer`.

## Recurring Events (RRULE)

### Data Model

Recurring events use an RFC 5545 RRULE-based model. The `teamEvent` table has three columns for recurrence:

| Column | Type | Purpose |
|---|---|---|
| `recurrenceRule` | `jsonb` | `{ rrule: string, exdates?: string[] }` on the series parent; null for standalone events and exceptions |
| `seriesId` | `text` | FK to the series parent; null for standalone events and series parents themselves |
| `originalDate` | `text` | ISO date (YYYY-MM-DD) identifying which occurrence this exception replaces |

A **series parent** has `recurrenceRule` set and `seriesId: null`. An **exception** (materialized occurrence) has `seriesId` set and `originalDate` set. A **standalone event** has all three null.

### Client-Side Expansion

Virtual occurrences are expanded client-side using `expandSeries()` from `@pi-dash/zero/rrule-utils`. The expansion takes a date range and produces `VirtualOccurrence[]` — no DB rows exist for these. Only when a user modifies a specific occurrence (edit, cancel, add member) does it "materialize" into an exception row via the `materialize` mutator.

Zero queries filter `seriesId IS NULL` so only series parents and standalone events are synced. Exceptions are fetched via the `exceptions` relation on the series parent.

### Edit/Cancel Scope

Edit and cancel operations on recurring events use Google Calendar-style scope selection ("This event" / "This and following" / "All events"):

| Mode | Edit behavior | Cancel behavior |
|---|---|---|
| `this` | Creates/updates exception row | Creates cancelled exception (exdate) |
| `following` | Truncates original series UNTIL, creates new series | Truncates original series UNTIL, cancels exceptions on/after date |
| `all` | Updates series parent directly | Cancels series parent + all exceptions |

Mutators: `teamEvent.updateSeries`, `teamEvent.cancelSeries`, `teamEvent.materialize`.

### RRULE Utilities

`packages/zero/src/lib/rrule-utils.ts` (exported as `@pi-dash/zero/rrule-utils`) provides:

- `expandSeries()` — expand RRULE into virtual occurrences within a date range
- `rruleToFormState()` / `formStateToRRule()` — convert between RRULE strings and UI form state
- `rruleToLabel()` — human-readable RRULE description
- `toISODate()` — date formatting helper

## Vendor Payment Lifecycle

Vendor payments follow a two-phase approval flow: payment approval, then invoice approval.

### Status State Machine

```
pending → approved → partially_paid → paid → invoice_pending → completed
  │                      │               │          │
  └→ rejected            └→ paid ────────┘          └→ paid (rejection reverts)
```

| Status | Meaning |
|---|---|
| `pending` | Submitted, awaiting admin approval |
| `approved` | Admin approved, payments can be recorded |
| `rejected` | Admin rejected (terminal unless resubmitted) |
| `partially_paid` | Some transactions approved, total < line items |
| `paid` | All transactions approved, total >= line items |
| `invoice_pending` | Invoice uploaded, awaiting admin approval |
| `completed` | Invoice approved (terminal) |

### Phase 1: Payment

1. Volunteer (or admin) creates VP with title, vendor, line items, and quotation attachments
2. Admin approves or rejects the VP
3. Transactions are recorded against the VP. If the creator is an admin, transactions are auto-approved. Otherwise, they require separate approval.
4. `recalculateParentStatus()` transitions the VP through `approved` → `partially_paid` → `paid` based on approved transaction totals vs line item totals

### Phase 2: Invoice

5. Once status is `paid`, the owner (or admin) uploads an invoice (number, date, attachments with `purpose: "invoice"`)
6. Status moves to `invoice_pending`
7. Admin approves → `completed`, or rejects → reverts to `paid` with `invoiceRejectionReason` set
8. On rejection, the owner can resubmit the invoice (calls `submitInvoice` again)

### Attachment Purposes

Vendor payment attachments have a `purpose` field: `"quotation"` (uploaded at creation) or `"invoice"` (uploaded post-payment). The create/update mutators only touch `purpose: "quotation"` attachments; invoice mutators only touch `purpose: "invoice"` attachments.

## Notifications

### Architecture

```
Server function / Zero mutator / auth hook
    → enqueue("notify-*" | "sync-*" | "whatsapp-*", payload)
        → packages/jobs/src/handlers/       # pg-boss picks up job
            → packages/notifications/src/   # notifications
            → packages/whatsapp/src/        # WhatsApp group ops
            → Courier API                   # user profile sync
```

All async side-effects (notifications, Courier sync, WhatsApp group management, Immich photo sync, R2 object cleanup) go through pg-boss `enqueue()` from `@pi-dash/jobs/enqueue` — never call these functions directly from server functions, auth hooks, or mutators. pg-boss provides persistence, retry (3 attempts with backoff), dead-letter queue, and visibility in the jobs dashboard.

**Subpath exports**: `@pi-dash/jobs/enqueue` is a lean entry point containing only typed payload interfaces and the `enqueue()` function — no handler dependencies. This keeps the client bundle free of server-only code when mutators dynamically import it. `@pi-dash/jobs` (barrel) re-exports everything including `boss.ts` and is only used in server-only code.

**Exceptions**: `notifyUserDeleted` must run synchronously before user deletion (Courier needs the user to exist).

Enqueue calls for side-effects should be wrapped in `withFireAndForgetLog` so that a pg-boss failure doesn't block the primary operation.

### Channels

| Channel | Provider | Config |
|---|---|---|
| In-app inbox | Courier | `COURIER_API_KEY`; client-side JWT from `functions/courier-token.ts` |
| Email | Courier | Routed through Courier's email channel |
| WhatsApp | Self-hosted gateway | `WHATSAPP_API_URL`; per-user opt-in via phone number + preference check |

### Topics & Preferences

Notification topics defined in `packages/notifications/src/topics.ts`. Each topic has per-channel toggles (email + WhatsApp) stored in the `notification_topic_preference` table (composite PK: `user_id` + `topic_id`). Default: both channels enabled (no row = enabled).

**Storage model**: Local DB is source of truth. Email preferences sync one-way to Courier via the `sync-courier-preference` pg-boss job (enqueued from the Zero mutator's async task). The job reverts the DB on Courier failure only if the preference hasn't been changed since the job was enqueued. WhatsApp preferences are checked at send-time from the local DB (`isWhatsAppTopicEnabled`), not via Courier.

**UI**: Users manage preferences via settings (`NotificationsSection`). Admins can edit any user's preferences (`UserNotificationsForm`). Both use Zero queries/mutators — no server functions.

**Mutators**: `notificationPreference.upsert` (self) and `notificationPreference.adminUpsert` (admin, requires `users.edit`). Required topics cannot be disabled (server-side guard).

## File Uploads

### Cloudflare R2 (Attachments)

1. Client requests presigned URL via `getPresignedUploadUrl` server function
2. Client uploads directly to R2 via presigned PUT
3. Object key stored in DB (attachment record)
4. Download proxied through `/api/attachments/download`

R2 subfolders: `attachments`, `avatars`, `photos`, `updates`.

### Immich (Event Photos)

Optional integration for photo album management (`IMMICH_API_KEY` + `VITE_IMMICH_URL`).

1. Member uploads photo → stored as event photo record with R2 key
2. Lead/admin approves → `immich-sync-photo` pg-boss job enqueued (with `singletonKey: photoId` to prevent duplicate processing)
3. Job: resolves/creates Immich album for event → downloads from R2 → uploads to Immich → persists `immichAssetId` immediately → adds to album → clears R2 key → deletes R2 object (best-effort)
4. Photo deletion enqueues `immich-delete-asset` and/or `delete-r2-object` jobs as needed
5. Thumbnails/originals proxied through `/api/immich/thumbnail.$id` and `/api/immich/original.$id`

Implementation: mutator at `packages/zero/src/mutators/event-photo.ts`, handlers at `packages/jobs/src/handlers/immich-sync-photo.ts`, `immich-delete-asset.ts`, `delete-r2-object.ts`. Shared R2 client at `packages/jobs/src/handlers/r2.ts`.

## Cash Vouchers

Cash vouchers are generated for reimbursement line items ≤ ₹1000. Users opt in per line item; vouchers auto-generate on reimbursement approval.

**Async job**: pg-boss job `generate-cash-voucher` (payload: `{ lineItemId, voucherId }`)

1. Receives reimbursement line item ID + voucher ID from enqueue call
2. `packages/pdf/src/voucher.ts` builds PDF using @react-pdf/renderer
3. PDF streamed → R2 upload via shared R2 client (`packages/jobs/src/handlers/r2.ts`)
4. On success, attachment record linked to voucher via transaction (`attachmentId` + `voucherId`)
5. Uses `singletonKey: voucherId` for deduplication — safe to regenerate without duplication
6. Atomic transaction ensures attachment linking succeeds only if upload succeeds

**Config**: `VOUCHER_ORG_*` env vars (name, address, phone, email, registration). Logo/signature PNG assets at `packages/pdf/assets/`.

## Observability

### Server-Side Logging (evlog)

All server-side logging uses evlog wide events — never `console.error`.

| Helper | Location | Purpose |
|---|---|---|
| `createRequestLogger()` | `evlog` | Creates a wide-event logger; use `log.set()` for context, `log.error()` for errors, `log.emit()` to flush |
| `withTaskLog()` | `packages/observability` | Wraps async tasks with retry (p-retry, 3 attempts) + evlog |
| `withFireAndForgetLog()` | `packages/observability` | Fire-and-forget with evlog (no retry, no re-throw) |

Logger initialized at `apps/web/src/lib/logger.ts`, imported by `entry-server.ts`.

### Client-Side Logging

Client logger initialized in `apps/web/src/lib/client-logger.ts`. Errors shipped to `/api/log/ingest`. Client catch blocks use `log.error()` from `evlog` — never `console.error`.

### Mutation Results

`handleMutationResult()` from `apps/web/src/lib/mutation-result.ts` handles Zero mutation server results — logs via evlog + shows toast on error.
