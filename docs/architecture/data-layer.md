# Data Layer — Zero + Drizzle

> **Load when**: Zero mutators/queries, Drizzle schema, sync behavior, connection pool, SSR loaders, IndexedDB, `ZeroProvider`, real-time sync flow, optimistic updates.
> **Related**: `auth.md`, `authorization.md`, `jobs.md`

## IDs

All entity PKs = **UUIDv7** via `uuidv7` npm package. Generated app-side before insert. UUIDv7 embeds millisecond timestamp → time-ordered, B-tree-friendly. Never `crypto.randomUUID()` or `gen_random_uuid()`.

## Schema Generation

Drizzle = source of truth. Zero client-side schema **generated**:

```
packages/db/src/schema/*.ts  →  drizzle-zero generate  →  packages/zero/src/schema.ts
```

Command: `bun run zero:generate` (`drizzle-zero generate -f -s ../db/src/schema/index.ts -o src/schema.ts`).

## Mutators

Defined once in `packages/zero/src/mutators/` via `defineMutator()`. Each gets `{ tx, ctx, args }`:

- **`tx`** — read (`tx.run(zql...)`) + write (`tx.mutate.<table>.insert/update/delete`)
- **`ctx`** — typed `Context` (`packages/zero/src/context.ts`): `userId`, `role`, optional `asyncTasks[]`
- **`args`** — Zod-validated input

Same code, two environments:

| Env | Behavior |
|---|---|
| **Client** (browser) | Optimistic — applies to local SQLite replica. `ctx.asyncTasks` undefined. |
| **Server** (`/api/zero/mutate`) | Authoritative — Postgres via `zeroDrizzle`. Route handler populates `ctx.asyncTasks`; mutators push notification/WhatsApp tasks. Post-commit: handler runs tasks via `withTaskLog`. |

Split by domain (`bank-account.ts`, `reimbursement.ts`, `team.ts`). Aggregated in `packages/zero/src/mutators.ts`.

## Queries

Defined in `packages/zero/src/queries/` via `defineQueries()`. Client: local SQLite replica, instant reads. Server: `/api/zero/query` → Postgres.

## Permissions (mutator-level)

`packages/zero/src/permissions.ts` exports assertion fns (`assertIsLoggedIn`, `assertIsAdmin`) — throw on fail. Called at top of server-side mutator exec. Client-side: no-ops (optimistic trusts UI). Deeper: see `authorization.md`.

## Connection Pool

Two pools, both cached on `globalThis` — survive Vite SSR HMR (without this, each reload leaks a pool → `max_connections` exhausted):

- **Drizzle pool** (`packages/db/src/index.ts`): Bun SQL, `max: 20`, `application_name: "pi-dash"`. Drizzle ORM + Better Auth (via Drizzle adapter).
- **pg-boss pool** (`packages/jobs/src/boss.ts`): `pg` module, `max: 10`, `application_name: "pi-dash-jobs"`. Job queue. `startWorker` guard = no duplicate instances on HMR.
- **Zero Cache**: separate, via `ZERO_UPSTREAM_DB` (unpooled, logical replication). Not part of either pool.

## Data Sync

Zero = real-time sync via Postgres logical replication:

1. Postgres runs `wal_level=logical` (Docker Compose).
2. `zero-cache` process connects via `ZERO_UPSTREAM_DB`, tails WAL.
3. Client → `zero-cache` via WebSocket (`VITE_ZERO_URL`).
4. Client maintains local SQLite replica → instant reads, optimistic writes.
5. Server mutations: client → `zero-cache` → `/api/zero/mutate` → Postgres → WAL → `zero-cache` → all clients.

Zero client init: `apps/web/src/components/zero-init.tsx` via `<ZeroProvider>`. Receives schema, mutators, user context (userId + role), `storageKey="pi-dash"` (namespaces IndexedDB).

## SSR Loaders

Route loaders use `context.zero?.preload()` (not `run()`) — syncs ahead of nav without materializing JS objects. `?.` required: Zero doesn't exist server-side during SSR.

## Connection Errors

Global monitor: `ZeroConnectionMonitor` in `apps/web/src/routes/_app.tsx` via `useConnectionState()`. Individual queries = no error handling. On `error`: debounced toast. On `needs-auth` (401/403): redirect `/login` with current path.

Logout: `zero.delete()` (best-effort) before `authClient.signOut()` → clears IndexedDB cache.

## View Transitions

Route navs use View Transitions API (`defaultViewTransition: true` in `apps/web/src/router.tsx`). Animations: `packages/design-system/styles.css`, `::view-transition-old(root)` / `::view-transition-new(root)`, 150ms expo-out fade. Disabled under `prefers-reduced-motion: reduce`. Firefox etc fall back to instant nav.
