# Project structure

The repository map. Paths are relative to the repository root. Commands, boundaries and the doc routing table are in the agent guide (`.ruler/agent-guide.md`, generated into `AGENTS.md` and `CLAUDE.md`); subsystem detail is in [docs/architecture/](docs/architecture/index.md).

`apps/web/` is the full-stack TanStack Start app. Server functions live in `src/functions/`, routes in `src/routes/`, and Nitro plugins and middleware in `server/`.

## Packages

| Package | Purpose |
|---|---|
| `auth` | Better Auth config, admin seeding and sign-up links |
| `config` | Shared TypeScript and tooling config |
| `db` | Drizzle schema (`src/schema/private/` for server-only data), migrations, the permission registry, the ledger posting engine and data scripts |
| `design-system` | shadcn and reui components and the design tokens |
| `e2e` | Playwright specs, page objects, fixtures and seeds |
| `editor` | Plate editor and renderer |
| `email` | Resend mailer, bounce webhook and React Email templates |
| `env` | Server and web environment contracts |
| `jobs` | pg-boss worker, handlers and schedules. `@pi-dash/jobs/enqueue` is the lean entry for mutators |
| `notifications` | One sender per domain, batching, digests, topics and preferences |
| `observability` | `withTaskLog()` and `withFireAndForgetLog()` |
| `pdf` | Cash vouchers, donation receipts, Kalakriti ID cards |
| `shared` | Client-safe constants, types and rules |
| `whatsapp` | GoWA gateway and WhatsApp Cloud API clients |
| `zero` | Zero queries, mutators and the generated schema |

## Key patterns

### Adding a new table

Copy an existing table such as `components/reimbursements/` or `components/events/public-events-table.tsx`. The `create-data-table` skill has the full checklist.

1. Export `FooRow` (Zero row plus relations) from the table file. Put the search function and `SKELETON_*` constants at module level.
2. Build columns as a plain `DataGridColumnDef<FooRow>[]` array; the React Compiler memoises it. Each uses `DataGridColumnHeader` with `visibility` and `meta: { headerTitle, skeleton }`.
3. The actions column has `id: "actions"`, hiding, resizing, sorting and ordering disabled, and `size` and `minSize` of 52.
4. Pass the full `tableLayout` (`columnsResizable`, `columnsDraggable`, `columnsVisibility`, `columnsPinnable`) to `DataTableWrapper`, and pin fixed columns with `defaultColumnPinning`.
5. Filters: pass unfiltered `data` with `filter={{ fields, getValue }}`, defined next to the table. Filter state lives in the `filters` URL param. Server-paginated tables (jobs, audit log, Kalakriti audit) set `applyLocally: false`, omit `getValue` and map `is` rules onto their API params.
6. Keep the route file a thin shell that runs Zero queries and passes data and callbacks.
7. Put delete confirmation in a `RowActions` component with `useConfirmAction` and `ConfirmDialog`.

### Imports

- Design-system components: `@pi-dash/design-system/components/ui/...` or `/reui/...`, never `src/` paths.
- Constants the client needs go in `@pi-dash/shared`, imported by file path.
- Server functions (`createServerFn`), API routes (`routes/api/`) and server-only packages use static imports: TanStack Start already keeps them out of the client bundle. Dynamic `import()` belongs in Zero mutators ([data layer](docs/architecture/data-layer.md#mutators)) and in `React.lazy` for heavy UI.
- The React Compiler is on, so new code needs no hand-written `useMemo`/`useCallback`. Keep the existing ones where a third-party component or a shared hook needs a stable reference.

### Structured logging

Server code logs with evlog wide events, never `console.error`.

```ts
const log = createRequestLogger();
log.set({ mutator: "createTeam", teamId });
try {
  // work
} catch (error) {
  log.error(error instanceof Error ? error : String(error), { step: "notify" });
  throw error;
} finally {
  log.emit();
}
```

- `apps/web/server/plugins/logger.ts` initialises the logger.
- `createRequestLogger()` accepts only `{ method?, path?, requestId? }`; add context with `log.set()`.
- Client code uses `log.error({ component, action, error })` from evlog, shipped to `/api/log/ingest` (`src/lib/client-logger.ts`).
- Zero mutation results go through `handleMutationResult()` in `src/lib/mutation-result.ts`.

Detail: [observability](docs/architecture/observability.md) and the `add-logging` skill.

### Unit tests

`bun run test:unit` runs every workspace's `test:unit` script through Turborepo. The runner differs by workspace; see its `package.json`. In `web`, `apps/web/test-unit.sh` covers only `src/lib`, `components`, `routes`, `functions` and `hooks`.

Tests sit next to the code as `foo.test.ts` (or `.test.tsx`).

`*.db.test.ts` files run against a real, local, migrated and seeded database, each test in a rolled-back transaction. Each file names its opt-in `*_TEST_DATABASE_URL` variable at the top. Tests skip unless it points at localhost; the web give.do payout test also needs it to equal `DATABASE_URL`. CI sets none of them, so they skip there. A worktree with `--isolated-db` is the safe target.

Never put tests in `packages/db/src/schema/`. `drizzle-kit push` loads every file there, and CI's E2E schema push fails.

`scripts/*.test.ts` belong to no workspace, so `test:unit` skips them. Run them with `bun test scripts/`.

## Legacy data import

`packages/db/scripts/migrate-legacy-data.ts` was the one-time import from the old Laravel/MySQL platform. It reads `proudindian.sql` (not committed), purges existing data first and is safe to re-run. Run it against the `postgres-migration` service, never the dev database:

```bash
docker compose --env-file .env -f packages/db/docker-compose.yml up -d postgres-migration
cd packages/db && DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" bun x drizzle-kit push
DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" ADMIN_EMAIL="..." \
  bun run packages/db/scripts/migrate-legacy-data.ts
```

`ADMIN_EMAIL` keeps that user during the purge. Set `OLD_R2_*` and `NEW_R2_*` (account ID, access key, secret, bucket, plus `NEW_R2_KEY_PREFIX`) to copy files; without them, file rows keep the old keys. Remove the service afterwards with `docker compose ... down postgres-migration`.

## Library docs (Context7)

| Library | Context7 ID |
|---|---|
| React | `/websites/react_dev` |
| TanStack Start | `/websites/tanstack_start_framework_react` |
| TanStack Router | `/tanstack/router` |
| TanStack Form | `/tanstack/form` |
| TanStack Table | `/websites/tanstack_table` |
| Rocicorp Zero | `/llmstxt/zero_rocicorp_dev_llms_txt` |
| Drizzle ORM | `/drizzle-team/drizzle-orm-docs` |
| drizzle-zero | `/briefhq/drizzle-zero` |
| Better Auth | `/better-auth/better-auth` |
| Zod | `/colinhacks/zod` |
| Tailwind CSS v4 | `/websites/tailwindcss` |
| shadcn/ui | `/shadcn/ui` |
| Vitest | `/vitest-dev/vitest` |
| Playwright | `/microsoft/playwright` |
| Cloudflare R2 | `/llmstxt/developers_cloudflare_r2_llms-full_txt` |
| evlog | `/hugorcd/evlog` |
| Turborepo | `/vercel/turborepo` |
| React Email | `/resend/react-email` |
| Resend | `/resend/resend-node` |
| nuqs | `/47ng/nuqs` |
| dnd-kit | `/clauderic/dnd-kit` |
| t3-env | `/t3-oss/t3-env` |
