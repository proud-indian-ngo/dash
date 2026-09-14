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

Route loaders use `preloadRouteQuery` from `apps/web/src/lib/route-preload.ts`, passing the optional Zero instance, query and loader abort signal. It uses `zero.preload()` to sync ahead of navigation without materializing JS objects, retains cached data for five minutes, and releases its reference on completion, abort or a 30-second timeout. It does nothing during SSR when Zero is absent. Mounted query hooks own separate references, so releasing a preload does not unsubscribe the page.

Router preloading uses intent (hover/focus) in development, production and E2E. Broad query results are intentional for instant local filtering and warm navigation; visible row count alone does not establish overfetching. Zero deduplicates overlapping rows, but every active query still has lifecycle and execution costs. Route preloads must not retain references indefinitely.

Kalakriti Students and Entries preload their existing page queries on route intent. Students warms the directory, visible Centers and Edition metadata; Entries warms visible Entries and available divisions. Merely displaying their sidebar links does not request these datasets. Center-dependent form options still load from the mounted page, once its authorized Center selection is known.

Kalakriti access guards deduplicate only concurrent browser requests by authenticated session, lookup kind and year. Settled results are not cached, and server rendering bypasses shared state. Server-side authentication and query permissions remain authoritative.

## Query Performance Verification

Run `bun run zero:analyze` with `ZERO_CACHE_URL` and the appropriate authentication environment. The default `ZERO_ANALYZE_PROFILE=events` preserves the event query suite and optional `ZERO_ANALYZE_EVENT_ID`. Set `ZERO_ANALYZE_PROFILE=kalakriti` and `ZERO_ANALYZE_EDITION_ID` to profile Entries, available divisions, the Students directory and Food memberships/students for a specific edition. The script runs named queries sequentially and prints timings, row counts and plans without requesting record contents. Authentication uses `COOKIE` or `ZERO_AUTH_TOKEN`; production inspection also requires `ZERO_ADMIN_PASSWORD`. Do not place their values in reports.

Food membership queries short-circuit global-admin access before evaluating Center-scoped authorization alternatives. They still require an existing Edition, retain active registrations or effective meal history, and apply the same filters to related operations, assignments and Guardian Centers. Scoped readers continue through the full authorization predicates.

Kalakriti assignment relationships use the non-partial `(membership_id, edition_id, id)` index added in migration 0084. It supports per-membership filtering and stable ordering in Zero’s replica; the responsibility-specific partial unique indexes do not cover that access path. On the 600-assignment local fixture, this reduced assignment scans from 180,300 to 600 without changing synced results. Migration 0085 adds Center/responsibility and Competition/responsibility access paths for restricted permission lookups. These reduced assignment scans substantially in the scoped fixture, with unchanged read counts and no material local latency improvement; their benefit is reduced SQLite work rather than a demonstrated page-load speedup.

Entries retain the full root dataset and Entry Center labels, but no longer join each member Student to its Center. Entry consumers do not read that nested relation; the registration picker obtains Student Center labels from its separate Student query. On the 3,000-Entry fixture, removing the unused relation reduced reads from 39,000 to 36,000 while retaining 9,103 synced rows.

Compare server hydration separately from end-to-end hydration, and distinguish active subscriptions from inactive queries retained by TTL. Use identical data, account and navigation sequences for before/after comparisons. Profile restricted roles separately because permission predicates can produce different plans. Add indexes or reduce query graphs only when measured plans justify doing so. See [Zero's query guidance](https://zero.rocicorp.dev/docs/queries) and [analyzer documentation](https://zero.rocicorp.dev/docs/debug/analyze-query-cli).

Event detail enables aggregate feedback subscriptions only for feedback managers. Ordinary participants fetch their own feedback through the existing server function, so they do not run an aggregate query that can only return an empty result. Query-side authorization remains authoritative.

Kalakriti readiness syncs Divisions through the Edition's direct `competitionDivisions` relation. Its lifecycle checks consume that flat list, so readiness does not also expand each Competition's Divisions. Clone-source and Competition-page queries retain their nested Divisions because their consumers use them.

The Student detail sheet uses `kalakritiEntry.visibleByCenter` with a participation projection: members, Division age category and Competition data. It shares root authorization with the full Entries queries, which retain their broader relationships. Center-wide Entry roots and the main Students/Entries local datasets remain intact.

The same sheet uses `kalakritiStudent.visibleByCenter` for transport status only. That projection retains all authorized Center Student roots and transport operations; displayed identity and age category come from the existing directory row. Directory, picker and compliance queries retain their broader data.

The registration Student picker (`visibleForEntries`) retains all authorized Students with their assigned age category, Center and transport operations. It does not expand Entry memberships or derived age categories: eligibility uses the separately loaded Entries and assigned age category. Directory and compliance projections remain broader.

Migration `0089_bouncy_mandarin.sql` indexes Entry members by `(student_id, edition_id, id)` for the directory's per-Student expansion. Local analyzer plans use it to filter and return ID order without a temporary sort. It preserves the existing student-only index and query relationships.

Food membership expansions authorize each assignment or Guardian link through `whereExists("center", foodCenter)`. Their related Center expansion uses that same link without repeating the authorization predicate. Removing Center authority removes the parent link and its Center from the result.

Migration `0090_lovely_domino.sql` adds `(competition_category_id, responsibility, id)` on assignments for category-authority lookups. It complements the membership-leading category uniqueness constraint. The local Eligibility benchmark demonstrated fewer assignment scans with unchanged results, not a material latency improvement.

## Connection Errors

Global monitor: `ZeroConnectionMonitor` in `apps/web/src/routes/_app.tsx` via `useConnectionState()`. Individual queries = no error handling. On `error`: debounced toast. On `needs-auth` (401/403): redirect `/login` with current path.

Logout: `zero.delete()` (best-effort) before `authClient.signOut()` → clears IndexedDB cache.

## View Transitions

Route navs use View Transitions API (`defaultViewTransition: true` in `apps/web/src/router.tsx`). Animations: `packages/design-system/styles.css`, `::view-transition-old(root)` / `::view-transition-new(root)`, 150ms expo-out fade. Disabled under `prefers-reduced-motion: reduce`. Firefox etc fall back to instant nav.


The notification history index in migration 0088 follows `(user_id, archived, created_at DESC, id ASC)`. It supports the inbox/badge query's owner filter, active-only predicate and newest-50 ordering without changing the query or its cached results. The 10,000-row experiment reduced scans from 7,500 to 50; total hydration did not consistently improve. Existing indexes remain in place.


Event expense queries (`reimbursement.byEvent` and `vendorPayment.byEvent`) use a summary projection: line items and submitter, plus vendor for Vendor Payments. Event metrics and the Expenses tab share these queries. They retain Event and owner filters but omit unused detail relationships; full financial list and detail queries remain broader.

Team detail preloads only the Team query. Its existing event-history subscription starts when the authorized Team component renders, so a denied Team does not warm an unused public-event history. Query shapes and Zero's consumer-owned caching are unchanged.
