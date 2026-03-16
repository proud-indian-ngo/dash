# Project Structure Reference

All paths are relative to project root.

## Command Map

| Command | Purpose |
|---|---|
| `bun run check:types` | TypeScript type check |
| `bun run check` | Linter (ultracite/Biome) |
| `bun run fix` | Auto-fix linter issues (ultracite/Biome) |
| `bun run check:unused` | Find unused exports (knip) |
| `bun run test:unit` | Run unit tests (Vitest) |
| `bun run db:generate` | Generate Drizzle types |
| `bun run db:push` | Push schema changes to database |
| `bun run db:migrate` | Run pending migrations |
| `bun run zero:generate` | Regenerate Zero schema |
| `bun run whatsapp:start` | Start WhatsApp gateway container |
| `bun run whatsapp:stop` | Stop WhatsApp gateway container |
| `cd packages/e2e && bash run-e2e.sh` | Run E2E tests (full stack) |
| `cd packages/e2e && bash run-e2e.sh tests/foo.spec.ts` | Run specific test files |
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | Run E2E tests via Turborepo |
| `bun run test:e2e:ui` | Run E2E tests in Playwright UI mode |
| `bun run analyze` | Bundle analysis (web app) |
| `bun run ruler:apply` | Apply Ruler config |

## Fast Lookup Map

### Root Config

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | CI pipeline (type check, lint, unit tests) |
| `README.md` | Project overview |
| `package.json` | Root scripts/workspaces |
| `turbo.json` | Task orchestration |
| `packages/db/docker-compose.yml` | PostgreSQL, test DB, and WhatsApp services |
| `biome.jsonc` | Biome linter config (via ultracite) |
| `.env.sample` | Env var template |
| `lefthook.yml` | Git hooks (pre-commit, commitlint) |

### Web App Core

| File | Purpose |
|---|---|
| `apps/web/src/router.tsx` | App entry / router config |
| `apps/web/src/routes/__root.tsx` | Root layout |
| `apps/web/src/routes/_app.tsx` | Authenticated layout (sidebar, breadcrumbs, Courier inbox) |
| `apps/web/src/routes/_auth.tsx` | Unauthenticated layout |
| `apps/web/src/middleware/auth.ts` | Auth middleware |
| `apps/web/src/context/app-context.tsx` | App context provider (authenticated user) |
| `apps/web/src/components/zero-init.tsx` | Zero client initialization |
| `apps/web/vitest.config.ts` | Unit test config for web app |

### Routes

| Route file | Purpose |
|---|---|
| `routes/_app/index.tsx` | Dashboard |
| `routes/_app/users.tsx` | User management |
| `routes/_app/reimbursements/route.tsx` | Reimbursements layout |
| `routes/_app/reimbursements/index.tsx` | Reimbursements list |
| `routes/_app/reimbursements/new.tsx` | Create reimbursement |
| `routes/_app/reimbursements/$id.tsx` | View/edit reimbursement |
| `routes/_app/advance-payments/route.tsx` | Advance payments layout |
| `routes/_app/advance-payments/index.tsx` | Advance payments list |
| `routes/_app/advance-payments/new.tsx` | Create advance payment |
| `routes/_app/advance-payments/$id.tsx` | View/edit advance payment |
| `routes/_app/teams/route.tsx` | Teams layout |
| `routes/_app/teams/index.tsx` | Teams list |
| `routes/_app/teams/$id.tsx` | Team detail |
| `routes/_app/events/route.tsx` | Events layout |
| `routes/_app/events/index.tsx` | Public events list |
| `routes/_app/events/$id.tsx` | Event detail (updates, photos, members) |
| `routes/_app/export.tsx` | CSV data export |
| `routes/_auth/login.tsx` | Login |
| `routes/_auth/forgot-password.tsx` | Forgot password |
| `routes/_auth/reset-password.tsx` | Reset password |
| `routes/_auth/verify-email.tsx` | Email verification |
| `routes/api/auth/$.ts` | Auth API handler |
| `routes/api/zero/query.ts` | Zero query endpoint |
| `routes/api/zero/mutate.ts` | Zero mutate endpoint |
| `routes/api/avatar.ts` | Avatar generation |
| `routes/api/health.ts` | Health check endpoint |
| `routes/api/log/ingest.ts` | Client-side log ingestion |
| `routes/api/immich/thumbnail.$id.ts` | Immich photo thumbnail proxy |
| `routes/api/attachments/download.ts` | Attachment download |

All route paths above are prefixed with `apps/web/src/`.

### Components

| Directory | Contents |
|---|---|
| `components/layout/` | app-sidebar, nav-main, nav-user, team-switcher, breadcrumbs |
| `components/data-table/` | data-table-wrapper (generic DataTableWithFilters) |
| `components/users/` | users-table, user-form, password-form, ban-user-form, delete-user-dialog |
| `components/reimbursements/` | reimbursements-table, reimbursement-form, reimbursement-detail, reimbursement-stats |
| `components/advance-payments/` | advance-payments-table, advance-payment-form, advance-payment-detail, advance-payment-stats |
| `components/teams/` | teams-table, team-detail, team-form-dialog, add-member-dialog |
| `components/shared/` | user-avatar, user-picker, confirm-dialog |
| `components/editor/` | plate-editor (rich-text with image upload), plate-renderer (read-only) |
| `components/events/` | public-events-table |
| `components/teams/events/` | events-table, event-form-dialog, event-detail, event-updates, event-photos, add-event-member-dialog, show-interest-dialog, interest-requests |
| `components/settings/` | settings-dialog, sections/ (profile, account, banking, expense-categories, whatsapp-groups, notifications) |
| `components/form/` | form-layout, form-modal, form-actions, form-context, custom-field, input-field, date-field, phone-field, phone-field-lazy, textarea-field, checkbox-field, select-field, add-url-row, line-items-editor, attachments-section, reject-dialog |
| `components/login/` | login-form, forgot-password-form, reset-password-form |
| `components/stats/` | stats-cards (dashboard stats) |
| `components/` (root) | loader, default-catch-boundary, default-not-found, theme-toggle, zero-init, dev-tools |

All component paths above are prefixed with `apps/web/src/`.

### Hooks

| File | Purpose |
|---|---|
| `hooks/use-active-path.ts` | Current nav view from pathname |
| `hooks/use-attachment-actions.ts` | Attachment upload/delete actions |
| `hooks/use-confirm-action.ts` | Confirm→loading→execute→close pattern for destructive actions |
| `hooks/use-dialog-manager.ts` | Discriminated-union state for managing multiple dialogs |
| `hooks/use-local-storage.ts` | Generic localStorage with JSON serialization |
| `hooks/use-table-state.ts` | Table state (pagination, sorting, filters, column persistence) |
| `hooks/use-stable-query-result.ts` | Stabilize Zero query results across re-renders |
| `hooks/use-unread-notification-count.ts` | Unread Courier notification count |

All hook paths above are prefixed with `apps/web/src/`.

### Server Functions

| File | Purpose |
|---|---|
| `functions/get-session.ts` | Authenticated user session |
| `functions/user-admin.ts` | Admin CRUD: create, update, setPassword, delete, setBan |
| `functions/attachments.ts` | R2 presigned upload URL, delete asset |
| `functions/courier-token.ts` | Generate Courier JWT for client-side inbox |
| `functions/export-csv.ts` | CSV data export server function |
| `functions/immich-upload.ts` | Immich photo upload server function |
| `functions/notification-preferences.ts` | Get/update user notification topic preferences |

All function paths above are prefixed with `apps/web/src/`.

### Lib

| File | Purpose |
|---|---|
| `lib/api-auth.ts` | API route auth helpers |
| `lib/auth-client.ts` | Better-auth client with admin plugin |
| `lib/avatar.ts` | Avatar URL builder (DiceBear) |
| `lib/validators.ts` | Shared Zod schemas |
| `lib/form-schemas.ts` | Form-level Zod schemas |
| `lib/table-utils.ts` | Table state utilities |
| `lib/errors.ts` | Error handling utilities |
| `lib/logger.ts` | evlog init (imported at server startup) |
| `lib/attachment-links.ts` | Generic attachment URL helpers (shared by reimbursements & advance payments) |
| `lib/stats.ts` | Shared stat computation helpers |
| `lib/status-badge.ts` | Status → badge variant mapping |
| `lib/submission-mappers.ts` | Map Zero rows to form/display models |
| `lib/nav-items.ts` | Nav items by user role |
| `lib/route-guards.ts` | Route protection utilities |
| `lib/db-enums.ts` | Database enum type mappings |
| `lib/team-utils.ts` | Team-related utilities |
| `lib/immich.ts` | Immich photo service integration |
| `lib/s3.ts` | S3/R2 client utilities |
| `lib/rate-limit.ts` | Rate limiting helpers |
| `lib/csv-export.ts` | CSV export utilities |
| `lib/client-logger.ts` | Client-side logging |

All lib paths above are prefixed with `apps/web/src/`.

### Packages

| Package | Key paths |
|---|---|
| `packages/auth/` | `src/index.ts` (auth config), seed-admin script |
| `packages/db/` | `src/schema/` (Drizzle tables), `src/migrations/`, `docker-compose.yml` (postgres, postgres-test, postgres-migration, whatsapp), `scripts/migrate-legacy-data.ts` |
| `packages/email/` | `src/mailer.ts` (Nodemailer transport), `src/templates/` (verification-email, reset-password-email) |
| `packages/env/` | `src/server.ts` (server env), `src/web.ts` (client env) |
| `packages/config/` | Shared TypeScript & tooling config |
| `packages/design-system/` | `components/ui/` (shadcn), `components/reui/` (custom: data-grid, badge, alert), `hooks/`, `lib/` (theme-provider, utils) |
| `packages/notifications/` | `src/client.ts` (Courier client), `src/send/` (reimbursement, advance-payment, user, submission, team, team-event, event-interest), `src/send-message.ts` (core send/bulk send), `src/topics.ts`, `src/preferences.ts`, `src/jwt.ts`, `src/helpers.ts` |
| `packages/observability/` | `src/index.ts` — `withTaskLog()` (retry + evlog for mutator async tasks), `withFireAndForgetLog()` (fire-and-forget with logging) |
| `packages/whatsapp/` | `src/client.ts` (API helpers), `src/groups.ts` (group creation, member management), `src/messaging.ts` (send messages), `src/phone.ts` (number formatting), `src/preferences.ts`, `src/status.ts` |
| `packages/zero/` | `src/queries/` (user, bank-account, expense-category, reimbursement, advance-payment, team, team-event, event-photo, event-update, event-interest, app-config, whatsapp-group), `src/mutators/` (bank-account, expense-category, reimbursement, advance-payment, team, team-event, event-interest, event-photo, event-update, app-config, whatsapp-group, submission-helpers), `src/lib/recurrence.ts`, `src/shared-schemas.ts`, `src/validation.ts`, `src/permissions.ts`, `src/context.ts`, `vitest.config.ts` |
| `packages/e2e/` | `tests/` (feature specs: auth, authorization, users, roles, reimbursements, advance-payments, teams, events, dashboard, sidebar, settings), `pages/` (Page Object Model: list-page, request-form-page, approval-detail-page, reimbursement-page, advance-payment-page), `fixtures/` (auth fixtures with console error monitoring), `helpers/` (seed scripts), `global-setup.ts`, `run-e2e.sh` |

## DB Schema Tables

| Table | Schema file |
|---|---|
| `user` | `packages/db/src/schema/auth.ts` |
| `session` | `packages/db/src/schema/auth.ts` |
| `account` | `packages/db/src/schema/auth.ts` |
| `verification` | `packages/db/src/schema/auth.ts` |
| `bankAccount` | `packages/db/src/schema/bank-account.ts` |
| `expenseCategory` | `packages/db/src/schema/expense-category.ts` |
| (shared enums: city, attachment_type, history_action) | `packages/db/src/schema/shared.ts` |
| `reimbursement` | `packages/db/src/schema/reimbursement.ts` |
| `reimbursementLineItem` | `packages/db/src/schema/reimbursement.ts` |
| `reimbursementAttachment` | `packages/db/src/schema/reimbursement.ts` |
| `reimbursementHistory` | `packages/db/src/schema/reimbursement.ts` |
| `advancePayment` | `packages/db/src/schema/advance-payment.ts` |
| `advancePaymentLineItem` | `packages/db/src/schema/advance-payment.ts` |
| `advancePaymentAttachment` | `packages/db/src/schema/advance-payment.ts` |
| `advancePaymentHistory` | `packages/db/src/schema/advance-payment.ts` |
| `team` | `packages/db/src/schema/team.ts` |
| `teamMember` | `packages/db/src/schema/team.ts` |
| `teamEvent` | `packages/db/src/schema/team-event.ts` |
| `teamEventMember` | `packages/db/src/schema/team-event.ts` |
| `eventInterest` | `packages/db/src/schema/event-interest.ts` |
| `eventPhoto` | `packages/db/src/schema/event-photo.ts` |
| `eventImmichAlbum` | `packages/db/src/schema/event-photo.ts` |
| `eventUpdate` | `packages/db/src/schema/event-update.ts` |
| `appConfig` | `packages/db/src/schema/app-config.ts` |
| `whatsappGroup` | `packages/db/src/schema/whatsapp-group.ts` |

## Notifications

- **Package**: `packages/notifications/` — Courier-based multi-channel notifications.
- **Client**: `src/client.ts` initializes CourierClient from `COURIER_API_KEY`.
- **Sending**: Notification functions in `src/send/` (reimbursement, advance-payment, user, submission, team, team-event, event-interest). Triggered server-side from Zero mutators via `ctx.asyncTasks?.push()`.
- **Core**: `src/send-message.ts` provides `sendMessage()` and `sendBulkMessage()` with inbox, email, and WhatsApp channels + idempotency keys.
- **Topics**: Defined in `src/topics.ts` (GENERAL, ACCOUNT, EVENTS). User preferences managed via `src/preferences.ts`.
- **WhatsApp**: Separate `packages/whatsapp/` package handles gateway client, groups, and messaging; requires `WHATSAPP_API_URL` env var to be set.
- **JWT**: `src/jwt.ts` generates Courier JWTs for client-side inbox.
- **Helpers**: `src/helpers.ts` provides `getAdminUserIds`, `getUserName`, `syncCourierUser`.
- DO: Add new notification types in `packages/notifications/src/send/`.
- DO: Register new env vars in `packages/env/src/server.ts`.
- DO NOT: Call Courier directly from web app code — use the notifications package.

## Unit Testing

- **Framework**: Vitest with configs in `apps/web/vitest.config.ts` and `packages/zero/vitest.config.ts`.
- **Running**: `bun run test:unit` — runs unit tests across all packages via Turborepo.
- **What to test**: Business logic, validation schemas, utility functions, stat computations. Not UI components.
- **Location**: Co-locate test files next to source (e.g., `foo.test.ts` beside `foo.ts`).
- **Existing tests**: Form schemas, stats helpers, validators, attachment links, submission mappers, permissions, shared schemas.

## E2E Testing

- **When to write E2E tests**: Write E2E tests when adding a major feature (new route/page, new CRUD workflow, new role-gated capability). Minor UI tweaks and refactors do not require E2E tests.
- **Location**: All E2E tests live in `packages/e2e/tests/` organized by feature (e.g., `auth/`, `authorization/`, `users/`, `reimbursements/`, `advance-payments/`, `teams/`, `events/`, `roles/`, `dashboard/`, `sidebar/`).
- **Running tests**: `cd packages/e2e && bash run-e2e.sh` — spins up a test DB (port 5433), seeds data, starts zero-cache, runs Playwright, then cleans up. Pass test file paths as args for targeted runs (e.g., `bash run-e2e.sh tests/reimbursements/reimbursement-delete.spec.ts`).
- **Timeout**: Global timeout is 45s. Use `test.slow()` (triples to 135s) for multi-step CRUD tests.
- **Projects**: Three Playwright projects — `admin` (authenticated as admin), `volunteer` (authenticated as volunteer), `unauthenticated` (no auth, for login/forgot-password tests).
- **Auth state**: Global setup (`packages/e2e/global-setup.ts`) logs in both test users and saves storage state to `packages/e2e/.auth/`. Feature tests reuse these sessions.
- **Fixtures**: Import `test` and `expect` from `packages/e2e/fixtures/test.ts` for custom fixtures (`adminEmail`, `volunteerEmail`, `consoleErrors`). The `consoleErrors` fixture auto-captures uncaught browser errors as test annotations (visible in the Playwright HTML report). Use plain `@playwright/test` for unauthenticated tests.
- **Page Object Model**: Shared page objects live in `packages/e2e/pages/`. Use `ReimbursementPage` and `AdvancePaymentPage` for feature tests — they compose `ListPage`, `RequestFormPage`, and `ApprovalDetailPage`. New feature test suites should follow this pattern.
- **API authorization tests**: `tests/authorization/api-authorization.spec.ts` tests that admin-only Zero mutations are rejected for volunteer users via direct API calls to `/api/zero/mutate`.
- **Seeding**: `packages/e2e/helpers/seed-test-user.ts` creates test users, expense categories, and bank accounts. Extend this file when new seed data is needed.
- **Selectors**: Use accessibility-first selectors (`getByRole`, `getByLabel`, `getByText`). Use `aria-current="date"` via `getByRole("button", { current: "date" })` for calendar today buttons. Avoid CSS class selectors.
- **Env**: Test credentials live in `packages/e2e/.env.test`. Do not commit real credentials.
- DO: Add E2E tests for new major features covering the happy path and key error states.
- DO: Place tests in the appropriate feature subdirectory under `packages/e2e/tests/`.
- DO: Use page objects from `packages/e2e/pages/` for reimbursement, advance-payment, and user tests.
- DO: Test both admin and volunteer perspectives when the feature is role-gated.
- DO NOT: Write E2E tests for trivial UI changes or refactors.
- DO NOT: Place API authorization tests in `tests/auth/` — use `tests/authorization/` to avoid the volunteer project's `testIgnore: /auth\//` filter.

## Key Patterns

### DataTableWrapper

Generic `DataTableWithFilters<TData>` in `apps/web/src/components/data-table/data-table-wrapper.tsx`. Feature tables (users-table, reimbursements-table) are thin wrappers that pass columns, data, and filter config.

### Adding a New Table

Every feature table follows the same structure. Use existing tables (reimbursements-table, advance-payments-table, events/public-events-table) as reference.

1. **Row type**: Define `export type FooRow = ZeroModel & { ...relations }` at the top of the table component file.
2. **Search function**: Module-level `function searchFoo(row: FooRow, query: string): boolean` — check relevant text fields against `query.trim().toLowerCase()`.
3. **Skeletons**: Module-level `const SKELETON_*` for each column, using `<Skeleton className="h-5 w-NN" />`.
4. **Props interface**: Accept `data`, `isLoading?`, plus any feature-specific props (callbacks, related data). Keep the route file as a thin shell.
5. **Columns**: `useMemo<ColumnDef<FooRow>[]>` inside the component. Each column should use `DataGridColumnHeader` with `visibility` prop, and include `meta: { headerTitle, skeleton }`.
6. **Actions column**: `id: "actions"`, `enableHiding: false`, `enableResizing: false`, `enableSorting: false`, `enableColumnOrdering: false`, `size: 52`, `minSize: 52`.
7. **DataTableWrapper**: Always include the full `tableLayout`:
   ```tsx
   tableLayout={{
     columnsResizable: true,
     columnsDraggable: true,
     columnsVisibility: true,
     columnsPinnable: true,
   }}
   ```
   Use `defaultColumnPinning` to pin non-reorderable columns (e.g., expand on left, actions/interest on right).
8. **Route file**: Thin shell — imports the table component, runs Zero queries in `loader`, passes data + callbacks as props.
9. **Delete confirmation**: Localize in a `RowActions` component inside the table file using `useConfirmAction` + `ConfirmDialog`. No dialog state at the table level.

### Form Fields

TanStack Form fields in `apps/web/src/components/form/`. Each field component accepts a `form` prop and `name`, handles validation display. Use `form-layout` + `form-actions` for consistent structure.

### Zero Queries

Split by domain in `packages/zero/src/queries/`. Each file exports a queries object. Aggregated in `packages/zero/src/queries.ts`. Query patterns: `.one()` for current user, `.all()` for lists, `.related()` for joins.

### Zero Mutators

Split by domain in `packages/zero/src/mutators/`. Each file exports a mutators object. Aggregated in `packages/zero/src/mutators.ts`. Mutators handle auth checks, cascade operations (line items, attachments), audit history, and trigger notifications via `ctx.asyncTasks`.

### Auth Guard

Routes under `_app` layout are authenticated. Auth middleware at `apps/web/src/middleware/auth.ts`. Server functions use session-based auth checks.

### Design System Imports

```ts
import { Button } from "@pi-dash/design-system/components/ui/button"
import { DataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid"
```

### Server Functions

Use `createServerFn` from TanStack Start. Located in `apps/web/src/functions/`. Auth-guarded via session checks.

### File Upload Flow

1. Client calls `getPresignedUploadUrl` server function → gets signed S3 PUT URL
2. Client uploads directly to R2 via presigned URL
3. Object key stored in attachment record
4. Download via `routes/api/attachments/download.ts` endpoint

### Notification Flow

1. Zero mutator performs data change (e.g., approve reimbursement)
2. Mutator pushes async task via `ctx.asyncTasks?.push()` on server
3. `routes/api/zero/mutate.ts` awaits async tasks after mutation completes
4. Notification function in `packages/notifications/src/send/` sends via Courier
5. Client-side inbox powered by Courier JWT from `functions/courier-token.ts`

### Structured Logging (evlog)

All server-side error logging uses evlog wide events instead of `console.error`. Pattern:

```ts
import { createRequestLogger } from "evlog";

const log = createRequestLogger();
log.set({ mutator: "createTeam", teamId, teamName });
try {
  // ... work ...
} catch (error) {
  log.error(error instanceof Error ? error : String(error), { step: "notify" });
  throw error;
} finally {
  log.emit();
}
```

- Logger initialized in `apps/web/src/lib/logger.ts`, imported by `entry-server.ts`.
- `createRequestLogger()` only accepts `{ method?, path?, requestId? }`. Use `log.set()` for custom context.
- All mutator async tasks in `packages/zero/src/mutators/` wrap bodies in try/catch/finally with evlog.
- Fire-and-forget catches in `apps/web/src/functions/` use inline `createRequestLogger()` → `set()` → `error()` → `emit()`.

## Documentation References (Context7)

Use `mcp__context7__query-docs` with these library IDs to fetch up-to-date documentation.

| Library | Context7 Library ID |
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
| Biome | `/biomejs/biome` |
| Turborepo | `/vercel/turborepo` |
| React Email | `/resend/react-email` |
| Nodemailer | `/nodemailer/nodemailer` |
| nuqs | `/47ng/nuqs` |
| dnd-kit | `/clauderic/dnd-kit` |
| t3-env | `/t3-oss/t3-env` |

## Legacy Data Migration

One-time migration from old Proud Indian platform (Laravel/MySQL) to pi-dash (Postgres).

**Script:** `packages/db/scripts/migrate-legacy-data.ts`
**SQL dump:** `proudindian.sql` (project root, not committed)

### Setup

```bash
# 1. Start migration DB
docker compose --env-file .env -f packages/db/docker-compose.yml up -d postgres-migration

# 2. Push schema to migration DB
cd packages/db && DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" bun x drizzle-kit push
```

### Run (DB only, no file copy)

```bash
DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" \
ADMIN_EMAIL="somu@proudindian.ngo" \
bun run packages/db/scripts/migrate-legacy-data.ts
```

### Run (with R2 file copy)

```bash
DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" \
ADMIN_EMAIL="somu@proudindian.ngo" \
OLD_R2_ACCOUNT_ID="..." \
OLD_R2_ACCESS_KEY="..." \
OLD_R2_SECRET_ACCESS_KEY="..." \
OLD_R2_BUCKET_NAME="..." \
NEW_R2_ACCOUNT_ID="..." \
NEW_R2_ACCESS_KEY="..." \
NEW_R2_SECRET_ACCESS_KEY="..." \
NEW_R2_BUCKET_NAME="..." \
NEW_R2_KEY_PREFIX="..." \
bun run packages/db/scripts/migrate-legacy-data.ts
```

### Verify with web UI

```bash
# Start Zero cache against migration DB
cd packages/zero && \
  PATH="$PWD/node_modules/.bin:$PATH" \
  ZERO_UPSTREAM_DB="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" \
  ZERO_REPLICA_FILE="/tmp/pi-dash-migration.db" \
  zero-cache-dev

# In another terminal — start web app against migration DB
DATABASE_URL="postgres://postgres:db@1234@localhost:5434/pi-dash-migration" bun run dev:web
```

### Cleanup

```bash
docker compose --env-file .env -f packages/db/docker-compose.yml down postgres-migration
docker volume rm pi-dash_pi-dash_postgres_migration_data
```

### Env vars

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ADMIN_EMAIL` | no | Email to preserve during purge (skips deleting this user) |
| `OLD_R2_*` | no | Old R2 credentials (account ID, access key, secret, bucket) |
| `NEW_R2_*` | no | New R2 credentials + `NEW_R2_KEY_PREFIX` |

When R2 vars are omitted, file records are created with old object keys but no files are copied. The script is safe to re-run — it purges existing data first.
