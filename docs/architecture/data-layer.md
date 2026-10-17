# Data layer: Zero and Drizzle

> **Load when**: Zero mutators or queries, Drizzle schema, sync, connection pools, SSR loaders and route preloads, IndexedDB, `ZeroProvider`, optimistic updates, money columns, jsonb.
> **Related**: `auth.md`, `authorization.md`, `jobs.md`, `.agents/skills/query-performance/SKILL.md`, `docs/query-performance-audit.md`

## IDs

Every primary key is a UUIDv7 from the `uuidv7` package, generated in the app before insert. They are time-ordered and B-tree friendly. Never use `crypto.randomUUID()` or `gen_random_uuid()`.

## Schema

Drizzle is the source of truth. `bun run zero:generate` generates the Zero schema from the barrel:

```
packages/db/src/schema/index.ts  →  drizzle-zero generate  →  packages/zero/src/schema.ts
```

- Tables that must never reach the browser are left out of the barrel: `social_api_token` and everything under `packages/db/src/schema/private/`.
- `private/` tables also live in the Postgres schema `private`, which zero-cache's publication (scoped to `public`) never replicates. drizzle-kit migrates them through `schemaFilter` in `drizzle.config.ts`.
- Example: the synced `vendor` row carries only name, GSTIN and approval status; contact, PAN and bank details load through server functions (`vendor-payments.md`).
- Every new table gets idempotent seed records in `scripts/seed.ts`. Transient queue and log tables (held notifications, email batch snapshots, the WhatsApp send log) are exempt.

### jsonb

Import `jsonb` from `packages/db/src/schema/jsonb.ts`, never from `drizzle-orm/pg-core`. With the Bun SQL driver, Drizzle's built-in column JSON-encodes the value and Bun encodes it again, so objects land as jsonb strings. Drizzle reads hide this, but Zero syncs the raw column and clients get a string. The local type sends `$1::text::jsonb`. In raw SQL, bind JSON as `${JSON.stringify(value)}::text::jsonb`, not `::jsonb`.

### Money

- Integer paise in `bigint` columns named `*_paise` (Drizzle `bigint(..., { mode: "number" })`, TS fields `*Paise`). Read and synced as `number`.
- Validate inputs with `paiseSchema` or `positivePaiseSchema` from `@pi-dash/shared/money` (reject fractions and values outside the safe-integer range).
- Forms take rupee text and convert with `rupeesToPaise` (exact string arithmetic, at most two decimals). Display with `formatPaise`. Total with `sumPaise`, which throws outside the safe range.
- PostgreSQL returns `sum()` over `bigint` as a numeric string; convert with `Number` and check it (see `sumToPaise` in the financial export).
- Never divide by 100 to compute. Divide only to compare with a rupee value a person typed, as the table amount filters do.

## Mutators

Defined in `packages/zero/src/mutators/` with `defineMutator()`, split by domain and aggregated in `packages/zero/src/mutators.ts`. Each receives:

- `tx`: reads (`tx.run(zql...)`) and writes (`tx.mutate.<table>.insert/update/delete`);
- `ctx`: `Context` from `packages/zero/src/context.ts` (`userId`, `role`, `permissions`, optional `asyncTasks`);
- `args`: Zod-validated input.

The same code runs twice:

| Where | Behaviour |
|---|---|
| Client | Optimistic, against the local replica. `ctx.asyncTasks` is undefined |
| Server (`/api/zero/mutate`) | Authoritative, against Postgres through `zeroDrizzle`. The handler supplies `ctx.asyncTasks`; mutators push notification and WhatsApp tasks, which run after commit through `withTaskLog` |

Because mutators ship to the client, server-only packages (`@pi-dash/jobs`, `@pi-dash/notifications`, `@pi-dash/db`, `@pi-dash/env/server`, `drizzle-orm`, `bun`) are loaded with dynamic `import()` behind the `tx.location === "server"` check. A static import would leak them into the client bundle.

Permission helpers (`assertIsLoggedIn`, `assertHasPermission`, `assertHasPermissionOrTeamLead`, `can`) live in `packages/zero/src/permissions.ts`; see `authorization.md`. Checks that need rows the client may not hold (for example, that a referenced donor, account or fund is active) run only on the server pass.

## Queries

Defined in `packages/zero/src/queries/` with `defineQueries()`. The client reads its local replica instantly; the server resolves through `/api/zero/query`. Query-side authorization is authoritative.

## Sync

1. Postgres runs with `wal_level=logical` (Docker Compose).
2. `zero-cache` tails the WAL through `ZERO_UPSTREAM_DB` (unpooled).
3. Clients connect to `zero-cache` over WebSocket (`VITE_ZERO_URL`) and keep a local replica for instant reads and optimistic writes.
4. Server mutations: client → `zero-cache` → `/api/zero/mutate` → Postgres → WAL → `zero-cache` → all clients.

`ZeroProvider` is set up in `apps/web/src/components/zero-init.tsx` with the schema, mutators, user context (`userId`, `role`, `permissions`) and `storageKey="pi-dash"`, which namespaces IndexedDB.

## Connection pools

Both pools are cached on `globalThis` so Vite SSR HMR does not leak a pool per reload and exhaust `max_connections`.

| Pool | Where | Settings | Used by |
|---|---|---|---|
| Drizzle | `packages/db/src/index.ts` | Bun SQL, `max: 20`, `application_name=pi-dash` | Drizzle and Better Auth |
| pg-boss | `packages/jobs/src/boss.ts` | `pg`, `max: 10`, `application_name=pi-dash-jobs` | Job queue; `startWorker` guard prevents duplicate workers on HMR |

zero-cache connects separately through `ZERO_UPSTREAM_DB`.

## Connection errors and logout

- `ZeroConnectionMonitor` in `apps/web/src/routes/_app.tsx` watches `useConnectionState()`. Individual queries do no error handling.
- `error`: debounced toast. `needs-auth`: redirect to `/login` with the current path.
- Logout calls `zero.delete()` (best effort) before `authClient.signOut()` to clear IndexedDB.

## Route preloads

- Loaders call `preloadRouteQuery` (`apps/web/src/lib/route-preload.ts`) with the optional Zero instance, query and abort signal. It uses `zero.preload()` without materialising objects, keeps cached data for five minutes, and releases its reference on completion, abort or a 30-second timeout. It does nothing during SSR without Zero.
- Mounted query hooks hold their own references, so releasing a preload does not unsubscribe the page.
- Router preloading is intent-based (hover, focus) in every environment. Showing a sidebar link starts no query.
- Broad query results are deliberate: they enable instant local filtering and warm navigation. Visible row count alone does not prove overfetching, but route preloads must never retain references indefinitely.
- Kalakriti access guards dedupe only concurrent browser requests by session, lookup kind and year. Settled results are not cached and SSR bypasses the shared state.

## Query shapes

Rules for changing relationships, preloads and indexes are in `.agents/skills/query-performance/SKILL.md`; measurements and rejected hypotheses are in `docs/query-performance-audit.md`. Current deliberate shapes:

### Events and teams

- Team detail preloads only the Team query. Its event-history subscription starts when the authorised Team component renders.
- Event detail subscribes to aggregate feedback only for feedback managers. Participants fetch their own feedback through a server function.
- `reimbursement.byEvent` and `vendorPayment.byEvent` are summary projections (line items, submitter, plus vendor for vendor payments) shared by event metrics and the Expenses tab.
- Reimbursement and vendor payment `all` and `byId` nest the event's `programme` (requests store none of their own); `byCurrentUser` omits it.
- `teamEvent.byTeam` loads each event's `programme` and `partners`, and each edited occurrence's own, for the events table and edit prefill.
- The notification inbox query is served by the `(user_id, archived, created_at DESC, id ASC)` index.

### Income

- All income queries share one root guard, `canSeeIncome` (`packages/zero/src/queries/income.ts`): `donors.view`, `finance.view`, `donors.manage` or `finance.manage`. Party directory queries use the same four so manage-only roles can pick givers.
- `contribution.list` relates party, programme, org account, fund and `importBatch`, newest first, bounded at 5,000 rows so this year's stat chips always see the whole year. Its `project` relation joins only for `finance.view`, because project rows carry sponsor and budget terms.
- `contribution.byParty` returns one donor's bare rows for the donor sheet.
- The record form reads `orgAccount.active` and `fund.active` (names only; bank details never sync) and loads projects only for `finance.view`.
- `importBatch.list` and `importBatch.byId` sync batch settings and counts. Import rows, external identities and collection events are in the `private` schema and read only through `apps/web/src/functions/income-import.ts`.

### Kalakriti

- Students and Entries preload their page queries on route intent. Students warms the directory, visible Centers and Edition metadata; Entries warms visible Entries and available divisions. Center-dependent form options load once the page knows the authorised Center selection.
- Entries keep the full root dataset and Entry Center labels but do not join each member Student to its Center; the registration picker gets Student Center labels from its own query.
- Readiness reads Divisions through the Edition's flat `competitionDivisions` relation. Clone-source and Competition-page queries keep nested Divisions because they use them.
- The Student detail sheet uses `kalakritiEntry.visibleByCenter` (members, Division age category, Competition) for participation and `kalakritiStudent.visibleByCenter` for transport status only. Both share root authorisation with the broader queries.
- The registration Student picker (`visibleForEntries`) keeps all authorised Students with assigned age category, Center and transport operations, without Entry memberships or derived age categories.
- Food membership queries short-circuit global admins before Center-scoped predicates, still require an existing Edition, and keep active registrations or effective meal history. Assignment and Guardian links authorise through `whereExists("center", foodCenter)`; the related Center expansion reuses that link.

Indexes that serve these paths:

| Table | Index | Serves |
|---|---|---|
| Assignments | `(membership_id, edition_id, id)` | Per-membership filter and order (the partial unique indexes do not) |
| Assignments | Center/responsibility, Competition/responsibility, `(competition_category_id, responsibility, id)` | Restricted permission and category-authority lookups |
| Entry members | `(student_id, edition_id, id)` | Directory's per-Student expansion |
| Operations | `(student_id, edition_id, type, id)` | Entries' per-Student operation expansion |
| Entries | `(edition_id, created_at DESC, id ASC)` | Edition filter with newest-first order |

## Measuring

Run `bun run zero:analyze` (`packages/zero/scripts/analyze.ts`) with `ZERO_CACHE_URL` and `COOKIE` or `ZERO_AUTH_TOKEN`; production also needs `ZERO_ADMIN_PASSWORD`. Never put these values in reports.

- `ZERO_ANALYZE_PROFILE=events` (default, optional `ZERO_ANALYZE_EVENT_ID`) or `kalakriti` with `ZERO_ANALYZE_EDITION_ID` (Entries, available divisions, Students directory, Food).
- It runs named queries in sequence and prints timings, row counts and plans, never record contents.
- Compare server hydration separately from total hydration, and active subscriptions separately from TTL-retained queries. Use identical data, account and navigation for before and after, and profile restricted roles separately. Add indexes or trim graphs only when measured plans justify it. See Zero's [query guidance](https://zero.rocicorp.dev/docs/queries) and [analyzer docs](https://zero.rocicorp.dev/docs/debug/analyze-query-cli).
