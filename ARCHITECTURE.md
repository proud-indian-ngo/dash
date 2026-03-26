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

### Data Sync

Zero handles real-time sync via PostgreSQL logical replication:

1. PostgreSQL runs with `wal_level=logical` (configured in Docker Compose)
2. `zero-cache` process connects to Postgres via `ZERO_UPSTREAM_DB` and tails the WAL
3. Client connects to `zero-cache` via WebSocket (`VITE_ZERO_URL`)
4. Client maintains a local SQLite replica — reads are instant, writes are optimistic
5. Server-side mutations flow: client → `zero-cache` → `/api/zero/mutate` → Postgres → WAL → `zero-cache` → all clients

The Zero client is initialized in `apps/web/src/components/zero-init.tsx` via `<ZeroProvider>`, which receives the schema, mutators, and user context (userId + role).

Connection errors are monitored globally by `ZeroConnectionMonitor` in `apps/web/src/routes/_app.tsx` using `useConnectionState()`. Individual queries do not handle errors — the monitor shows a debounced toast on `error` or `needs-auth` state transitions.

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
3. `_app` layout requires authentication — middleware at `apps/web/src/middleware/auth.ts`
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

## Notifications

### Architecture

```
Zero mutator (server) → ctx.asyncTasks.push({ fn, meta })
    → /api/zero/mutate handler awaits tasks after commit
        → withTaskLog (retry + evlog)
            → packages/notifications/src/send/*.ts
                → sendMessage / sendBulkMessage
                    → Courier (inbox + email) + WhatsApp (optional)
```

### Channels

| Channel | Provider | Config |
|---|---|---|
| In-app inbox | Courier | `COURIER_API_KEY`; client-side JWT from `functions/courier-token.ts` |
| Email | Courier | Routed through Courier's email channel |
| WhatsApp | Self-hosted gateway | `WHATSAPP_API_URL`; per-user opt-in via phone number + preference check |

### Topics & Preferences

Notification topics defined in `packages/notifications/src/topics.ts` (GENERAL, ACCOUNT, EVENTS). Users manage per-topic preferences via settings dialog. `sendMessage` respects topic subscription preferences.

## File Uploads

### Cloudflare R2 (Attachments)

1. Client requests presigned URL via `getPresignedUploadUrl` server function
2. Client uploads directly to R2 via presigned PUT
3. Object key stored in DB (attachment record)
4. Download proxied through `/api/attachments/download`

R2 subfolders: `attachments`, `avatars`, `photos`, `updates`.

### Immich (Event Photos)

Optional integration for photo album management (`IMMICH_API_KEY` + `VITE_IMMICH_URL`).

1. Member uploads photo → stored as event photo record
2. Lead/admin approves → server uploads to Immich, creates/reuses album per event
3. Thumbnails/originals proxied through `/api/immich/thumbnail.$id` and `/api/immich/original.$id`

Implementation: `apps/web/src/lib/immich.ts`, `apps/web/src/functions/immich-upload.ts`.

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
