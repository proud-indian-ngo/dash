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
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | Run E2E tests via Turborepo |
| `bun run test:e2e:ui` | Run E2E tests in Playwright UI mode |
| `bun run ruler:apply` | Apply Ruler config |

## Fast Lookup Map

### Root Config

| File | Purpose |
|---|---|
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
| `routes/_auth/login.tsx` | Login |
| `routes/_auth/forgot-password.tsx` | Forgot password |
| `routes/_auth/reset-password.tsx` | Reset password |
| `routes/_auth/verify-email.tsx` | Email verification |
| `routes/api/auth/$.ts` | Auth API handler |
| `routes/api/zero/query.ts` | Zero query endpoint |
| `routes/api/zero/mutate.ts` | Zero mutate endpoint |
| `routes/api/avatar.ts` | Avatar generation |
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
| `components/settings/` | settings-dialog, sections/ (profile, account, banking, expense-categories, notifications) |
| `components/form/` | form-layout, form-modal, form-actions, form-context, custom-field, input-field, date-field, phone-field, textarea-field, checkbox-field, select-field, add-url-row, line-items-editor, attachments-section, reject-dialog |
| `components/login/` | login-form, forgot-password-form, reset-password-form |
| `components/stats/` | stats-cards (dashboard stats) |
| `components/` (root) | loader, default-catch-boundary, default-not-found, theme-toggle, zero-init, dev-tools |

All component paths above are prefixed with `apps/web/src/`.

### Hooks

| File | Purpose |
|---|---|
| `hooks/use-active-path.ts` | Current nav view from pathname |
| `hooks/use-local-storage.ts` | Generic localStorage with JSON serialization |
| `hooks/use-nav-items.ts` | Nav items by user role |
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
| `lib/attachment-links.ts` | Generic attachment URL helpers (shared by reimbursements & advance payments) |
| `lib/stats.ts` | Shared stat computation helpers |
| `lib/status-badge.ts` | Status → badge variant mapping |
| `lib/submission-mappers.ts` | Map Zero rows to form/display models |

All lib paths above are prefixed with `apps/web/src/`.

### Packages

| Package | Key paths |
|---|---|
| `packages/auth/` | `src/index.ts` (auth config), seed-admin script |
| `packages/db/` | `src/schema/` (Drizzle tables), `src/migrations/`, `docker-compose.yml` (postgres, postgres-test, whatsapp) |
| `packages/email/` | `src/mailer.ts` (Nodemailer transport), `src/templates/` (verification-email, reset-password-email) |
| `packages/env/` | `src/server.ts` (server env), `src/web.ts` (client env) |
| `packages/config/` | Shared TypeScript & tooling config |
| `packages/design-system/` | `components/ui/` (shadcn), `components/reui/` (custom: data-grid, badge, alert), `hooks/`, `lib/` (theme-provider, utils) |
| `packages/notifications/` | `src/client.ts` (Courier client), `src/send/` (reimbursement, advance-payment, user, submission), `src/topics.ts`, `src/preferences.ts`, `src/whatsapp.ts`, `src/jwt.ts`, `src/helpers.ts` |
| `packages/zero/` | `src/queries/` (user, bank-account, expense-category, reimbursement, advance-payment, team), `src/mutators/` (bank-account, expense-category, reimbursement, advance-payment, team, submission-helpers), `src/shared-schemas.ts`, `src/validation.ts`, `src/permissions.ts`, `src/context.ts`, `vitest.config.ts` |
| `packages/e2e/` | `tests/` (feature specs), `fixtures/` (auth emails), `helpers/` (seed scripts), `global-setup.ts`, `run-e2e.sh` |

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

## Notifications

- **Package**: `packages/notifications/` — Courier-based multi-channel notifications.
- **Client**: `src/client.ts` initializes CourierClient from `COURIER_API_KEY`.
- **Sending**: Notification functions in `src/send/` (reimbursement, advance-payment, user, submission). Triggered server-side from Zero mutators via `ctx.asyncTasks?.push()`.
- **Topics**: Defined in `src/topics.ts` (GENERAL, ACCOUNT). User preferences managed via `src/preferences.ts`.
- **WhatsApp**: Optional integration in `src/whatsapp.ts`; requires `WHATSAPP_API_URL` env var to be set.
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
- **Location**: All E2E tests live in `packages/e2e/tests/` organized by feature (e.g., `auth/`, `users/`, `reimbursements/`, `advance-payments/`, `roles/`, `dashboard/`, `sidebar/`).
- **Running tests**: `cd packages/e2e && bash run-e2e.sh` — spins up a test DB (port 5433), seeds data, starts zero-cache, runs Playwright, then cleans up.
- **Projects**: Three Playwright projects — `admin` (authenticated as admin), `volunteer` (authenticated as volunteer), `unauthenticated` (no auth, for login/forgot-password tests).
- **Auth state**: Global setup (`packages/e2e/global-setup.ts`) logs in both test users and saves storage state to `packages/e2e/.auth/`. Feature tests reuse these sessions.
- **Fixtures**: Import `test` and `expect` from `packages/e2e/fixtures/test.ts` for custom fixtures (`adminEmail`, `volunteerEmail`). Use plain `@playwright/test` for unauthenticated tests.
- **Seeding**: `packages/e2e/helpers/seed-test-user.ts` creates test users, expense categories, and bank accounts. Extend this file when new seed data is needed.
- **Selectors**: Use accessibility-first selectors (`getByRole`, `getByLabel`, `getByText`). Avoid CSS class selectors.
- **Env**: Test credentials live in `packages/e2e/.env.test`. Do not commit real credentials.
- DO: Add E2E tests for new major features covering the happy path and key error states.
- DO: Place tests in the appropriate feature subdirectory under `packages/e2e/tests/`.
- DO: Test both admin and volunteer perspectives when the feature is role-gated.
- DO NOT: Write E2E tests for trivial UI changes or refactors.

## Key Patterns

### DataTableWrapper

Generic `DataTableWithFilters<TData>` in `apps/web/src/components/data-table/data-table-wrapper.tsx`. Feature tables (users-table, reimbursements-table) are thin wrappers that pass columns, data, and filter config.

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
