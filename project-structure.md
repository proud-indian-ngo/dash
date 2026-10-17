# Project structure

The repository map. Paths are relative to the repository root. Commands, boundaries and the doc routing table are in the agent guide (`.ruler/agent-guide.md`, generated into `AGENTS.md` and `CLAUDE.md`); subsystem detail is in [docs/architecture/](docs/architecture/index.md).

## Top level

| Path | Holds |
|---|---|
| `apps/web/` | The full-stack TanStack Start app |
| `packages/` | Shared workspaces (below) |
| `scripts/` | Seed, worktree, Social token, WhatsApp template and dev scripts |
| `docs/architecture/` | Architecture chapters |
| `.ruler/agent-guide.md` | Source of `AGENTS.md` and `CLAUDE.md` |
| `.github/workflows/ci.yml` | CI: type check, lint, unit tests |
| `lefthook.yml` | Pre-commit checks and commitlint |
| `oxlint.config.ts`, `oxfmt.config.ts` | Lint and format config |
| `turbo.json` | Task orchestration |
| `Dockerfile`, `docker-compose.prod.yml` | Production build and services |
| `CONTEXT.md` | Kalakriti glossary |

## Packages

| Package | Key paths |
|---|---|
| `auth` | `src/index.ts` (Better Auth config), `src/seed-admin.ts`, `src/register-event*.ts` and `src/register-interest*.ts` (sign-up links), `src/verification-redirect.ts` |
| `config` | Shared TypeScript and tooling config |
| `db` | `src/schema/` (Drizzle tables; `src/schema/private/` for server-only data), `src/migrations/`, `src/permissions.ts` (permission registry), `src/queries/`, `src/ledger/` (posting engine), `src/encryption.ts`, `docker-compose.yml`, `scripts/` (migrate, backfill, legacy import) |
| `design-system` | `components/ui/` (shadcn), `components/reui/` (data grid, badge, alert, filters), `styles.css` (tokens) |
| `e2e` | `tests/`, `pages/` (page objects), `fixtures/`, `helpers/` (seeds and probes), `global-setup.ts`, `run-e2e.sh` |
| `editor` | Plate editor and renderer |
| `email` | `src/mailer.ts` (Resend), `src/webhook.ts` (bounces and complaints), `src/templates/` |
| `env` | `src/server.ts` and `src/web.ts` environment contracts |
| `jobs` | `src/boss.ts`, `src/enqueue.ts` (`@pi-dash/jobs/enqueue` is the lean entry for mutators), `src/handlers/`, `src/schedules.ts` |
| `notifications` | `src/send/` (one sender per domain), `src/send-message.ts`, `src/batching.ts`, `src/digest.ts`, `src/topics.ts`, `src/preferences.ts` |
| `observability` | `withTaskLog()` and `withFireAndForgetLog()` |
| `pdf` | Cash vouchers, donation receipts, Kalakriti ID cards (`@react-pdf/renderer`) |
| `shared` | Client-safe constants, types and rules |
| `whatsapp` | `src/client.ts` and `src/groups.ts` (GoWA), `src/cloud.ts` and `src/templates.ts` (Cloud API), `src/notify.ts` |
| `zero` | `src/queries/`, `src/mutators/` (aggregated in `src/queries.ts` and `src/mutators.ts`), generated `src/schema.ts` |

## Web app

All paths in this section are under `apps/web/`.

| Path | Holds |
|---|---|
| `src/router.tsx` | Router entry |
| `src/routes/` | File-based routes (below) |
| `src/functions/` | Server functions (`createServerFn`) |
| `src/components/` | Feature folders (one per area), `shared/`, `form/`, `data-table/`, `layout/` |
| `src/hooks/` | Shared hooks such as `use-table-state`, `use-confirm-action`, `use-dialog-manager` |
| `src/lib/` | Utilities, server helpers and feature libraries (`razorpay/`, `bank-statement/`, `income-import/`, `books/`, `social-api/`) |
| `src/middleware/auth.ts` | Auth middleware |
| `src/context/app-context.tsx` | Signed-in user, permissions and nav groups |
| `server/plugins/` | Nitro plugins: logger, jobs worker, permission sync, asset cache |
| `server/middleware/` | Request logger, security headers, `missing-asset.ts` (no-store 404 for chunks from another deploy) |

### Routes

| Group | Notable paths |
|---|---|
| `__root.tsx` | Root layout and chunk-load error handling |
| `_auth/` | `login`, `register` (`?eventId=`, `?interestEventId=`), `forgot-password`, `reset-password`, `verify-email` |
| `_app/` (signed in) | `index` (dashboard), `users`, `reimbursements/`, `vendor-payments/`, `vendors/`, `teams/`, `events/`, `donors/`, `analytics`, `export`, `jobs`, `audit-log`, `social`, `scheduled-messages`, `whatsapp-groups/$groupId.join` |
| `_app/income/` | Income tabs (`?tab=`), `import`, `imports.$batchId`, `return` (donations return), `bank/` (statements), `payout/import` (give.do) |
| `_app/finance/books/` | Books page, `opening`, `audited` |
| `_app/settings/` | Personal pages (profile, account, notifications, bank accounts) and organisation pages, each guarded in `beforeLoad`; `roles/` |
| `_app/kalakriti/` | `new`, then `$year/` with dashboard, centers, competitions, students, volunteers, guardians, guests, judges, food, transport, inventory, awards, audit and settings |
| `kalakriti/$year/schedule` | Public competition schedule |
| `unsubscribe.tsx` | Public page behind email unsubscribe links |
| `api/` | `auth`, `zero/{query,mutate}`, `attachments`, `media`, `immich`, `jobs`, `audit-log`, `log/ingest`, `health`, `version`, `public/events` (and `openapi.json`), `social/v1`, `kalakriti/$year/*`, `receipts`, `razorpay/webhook`, `email/{webhook,unsubscribe}`, `whatsapp/cloud/webhook` |

External Kalakriti accounts have the `external_user` role. They land on their active Edition, are hidden from central volunteer pickers and user management, and cannot read organisation-wide Zero data.

## Key patterns

### Adding a new table

Copy an existing table such as `components/reimbursements/` or `components/events/public-events-table.tsx`. The `create-data-table` skill has the full checklist.

1. Export `FooRow` (Zero row plus relations) from the table file. Put the search function and `SKELETON_*` constants at module level.
2. Build columns in `useMemo<ColumnDef<FooRow>[]>`. Each uses `DataGridColumnHeader` with `visibility` and `meta: { headerTitle, skeleton }`.
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

### Navigation groups

`buildNavGroups()` in `src/lib/nav-items.ts` builds the sidebar groups from the user's permissions. `NavMainGrouped` in `src/components/layout/nav-main.tsx` renders them.

### Post-login redirect

The login page takes `?redirect=/path`. It is used only when it starts with `/` and not `//`. The `_app` guard sends signed-out users to `/login?redirect=<current>`.

### Auth guard

Routes under `_app` require a session. Protected routes also check their permission in `beforeLoad` ([authorization](docs/architecture/authorization.md)).

### Design tokens

`packages/design-system/styles.css` maps the shadcn variables onto `@proudindian/design` tokens. Rules are in [design language](docs/architecture/design-language.md).

| Token | Use |
|---|---|
| `--primary` | Primary buttons and solid controls (brand blue) |
| `--sidebar-accent` | Active or selected item; sky is never a fill behind body text |
| `--brand` | Decorative accent only: indicators, dots, thin rules |
| `--success`, `--warning`, `--destructive` | Status colours; marigold is never a status colour |
| `--radius` | `rounded-lg` controls and menus, `rounded-xl` cards and dialogs, `rounded-md` badges |
| `text-sm` (13px), `text-xs` (12px) | Body and secondary text |
| `font-sans` (Geist) | Body and UI text |
| `font-display` (Bricolage Grotesque) | Page titles and stat values, `font-semibold tracking-tight` (weight 600) |
| `font-mono` (Paper Mono) | IDs, codes, amounts and dates |

### File upload flow

1. The client asks a surface-specific signer for an upload URL. Attachment, approval, photo and scheduled-message uploads get a temp key for the current user; avatars and editor media have their own signers.
2. The client uploads straight to R2.
3. The owning Zero mutator validates the temp object and copies it to a durable key before committing the row. A raw key is never authorization.
4. Deleting the temp and replaced objects is queued after commit.
5. Reads go through `routes/api/attachments/download.ts` or `routes/api/media/*`.

Detail: [file uploads](docs/architecture/file-uploads.md).

### Notification flow

1. A Zero mutator changes data and pushes a task with `ctx.asyncTasks?.push()`.
2. `routes/api/zero/mutate.ts` runs those tasks as logged fire-and-forget work after commit.
3. A sender in `packages/notifications/src/send/` writes the inbox row and sends or holds email and WhatsApp. New senders need a `digest` row.
4. Zero syncs the inbox to the client.

Detail: [notifications](docs/architecture/notifications.md).

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

`bun run test:unit` runs every workspace's `test:unit` script through Turborepo, uncached; `test:unit:affected` runs only changed workspaces. CI runs the full set in the `checks` job.

| Runner | Workspaces |
|---|---|
| Vitest (`bun --bun vitest run`) | `auth`, `db`, `email`, `env`, `notifications`, `observability`, `shared`, `whatsapp` |
| `bun test --isolate` | `jobs`, `zero` (`pdf` uses plain `bun test src`) |
| `bun test` in chunks (`apps/web/test-unit.sh`) | `web`, covering only `src/lib`, `components`, `routes`, `functions` and `hooks` |
| Named `bun test` files plus a shell test | `e2e` |

Tests sit next to the code as `foo.test.ts` (or `.test.tsx`). `zero` also uses `__tests__/` folders under `src/mutators` and `src/lib`.

`*.db.test.ts` files run against a real, local, migrated and seeded database, each test in a rolled-back transaction. Each file names its opt-in variable at the top: `LEDGER_TEST_DATABASE_URL` for the books, or `CHARGED_TO_`, `SETTLEMENT_`, `GIVE_DO_PAYOUT_` or `RECEIPT_TEST_DATABASE_URL`. Tests skip unless it points at localhost; the web give.do payout test also needs it to equal `DATABASE_URL`. CI sets none of them, so they skip there. A worktree with `--isolated-db` is the safe target.

Never put tests in `packages/db/src/schema/`. `drizzle-kit push` loads every file there, and CI's E2E schema push fails.

`scripts/*.test.ts` belong to no workspace, so `test:unit` skips them. Run them with `bun test scripts/`.

E2E tests are in [E2E testing](docs/architecture/e2e-testing.md).

### Kalakriti results

Schema in `packages/db/src/schema/kalakriti-results.ts`, Live-only audited commands in `packages/zero/src/mutators/kalakriti-result.ts`, ranking and role policy in `packages/shared/src/kalakriti-results.ts`, standings and details in `apps/web/src/functions/kalakriti-results.ts`.

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
