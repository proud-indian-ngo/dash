# pi-dash repository instructions

pi-dash is a TypeScript monorepo for a volunteer and admin management dashboard. The web app uses TanStack Start, PostgreSQL, Drizzle, and Rocicorp Zero for real-time data; repository packages own authentication, environment validation, jobs, notifications, email, WhatsApp, observability, design system components, and Playwright E2E tests.

This file is the source for generated `AGENTS.md` and `CLAUDE.md`. Apply changes with `bun run ruler:apply`; do not edit generated copies directly.

## Architecture and entry points

| Area | Owns | Entry points |
|---|---|---|
| Web app | Routes, server functions, UI, hooks, middleware | `apps/web/src/router.tsx`, `apps/web/src/routes/`, `apps/web/src/functions/` |
| Database | Drizzle schema, migrations, PostgreSQL and local services | `packages/db/src/schema/`, `packages/db/docker-compose.yml` |
| Zero | Synced schema, queries, mutators | `packages/zero/` |
| Auth and permissions | Better Auth configuration and permission resolution | `packages/auth/`, `packages/db/src/permissions.ts` |
| Public events feed | Unauthenticated upcoming-events API for proudindian.ngo and its website sign-up links | `apps/web/src/routes/api/public/events.ts`, `packages/shared/src/public-events.ts`, `packages/shared/src/public-events-openapi.ts` (OpenAPI, served at `/api/public/openapi.json`), `packages/db/src/queries/public-events.ts`, `packages/shared/src/event-redirect.ts`, `packages/auth/src/register-interest.ts`, `apps/web/src/routes/_auth/verify-email.tsx` |
| Social API | Bearer-token API for the social-artifacts pipeline: events, photos with signed links, stats, posted log, WhatsApp digest, pause settings and posting rules, run reports; the Social page (`social.manage`) lists runs and posts, drops queued posts and holds the pause switches and posting rules | `apps/web/src/routes/api/social/v1/`, `apps/web/src/lib/social-api/`, `apps/web/src/lib/social-api-auth.ts`, `packages/shared/src/social-api.ts`, `packages/db/src/queries/social-api.ts`, `scripts/social-token.ts` (`bun run social:token`), `apps/web/src/functions/social-api-tokens.ts` and `apps/web/src/components/settings/sections/api-tokens-section.tsx` (Settings → API Tokens), `apps/web/src/components/teams/events/event-social-recap.tsx` (lead recap form), `apps/web/src/routes/_app/social.tsx` and `apps/web/src/components/social/` (Social page) |
| Donors and vendors | Party identity synced through Zero; contact, ID and bank details server-only with encrypted identifiers; donor directory and audited reveal; vendors are parties whose `vendor` row is the synced supplier profile, with private details and the audited bank-account reveal through server functions; contributions and other income recorded manually on the Income page as staging records (no receipts or postings yet), imported from CSV files (upload, map columns, review, import; give.do preset with GiveIndia as intermediary; raw rows server-only and expired by a retention job; dedupe by external identity only), or ingested from Razorpay Payment Page webhooks through the same review flow, with refunds recorded against contributions, settlements (payouts to the bank and the lines they covered, `finance.view` only), bank statement lines imported from CSV and matched to settlements, contributions and give.do payouts, and debits matched to approved reimbursements and vendor payments or marked as bank charges, tax payments or needing a claim (`statement_allocation`, finance layer 3-3b; `/income/bank`, `finance.view` only; `packages/db/src/schema/statement-line.ts`, `packages/db/src/queries/bank-debits.ts`, `apps/web/src/lib/bank-statement/`, `apps/web/src/functions/bank-statements.ts`), a 6-hourly reconcile and a past-payments import from Settings; the donations return (Form 113) readiness page and export at `/income/return`; give.do payout XLSX import at `/income/payout/import` (both `donors.manage` and `finance.manage`) and the finance-only Reached bank filter | `packages/db/src/schema/party.ts`, `packages/db/src/schema/private/`, `packages/db/src/encryption.ts`, `packages/db/src/queries/party-private.ts`, `packages/db/src/queries/vendor-party.ts`, `packages/db/src/seed-vendors.ts`, `apps/web/src/functions/parties.ts`, `apps/web/src/functions/vendors.ts`, `apps/web/src/routes/_app/donors/`, `apps/web/src/components/donors/`, `apps/web/src/components/vendors/`; income: `packages/db/src/schema/income.ts`, `packages/shared/src/income.ts`, `packages/zero/src/mutators/income.ts`, `packages/zero/src/queries/income.ts`, `packages/db/src/queries/income.ts`, `apps/web/src/functions/income.ts`, `apps/web/src/routes/_app/income/`, `apps/web/src/components/income/`; imports: `packages/db/src/schema/import-batch.ts`, `packages/db/src/schema/private/imports.ts`, `packages/db/src/queries/income-import.ts`, `packages/db/src/import-retention.ts`, `packages/jobs/src/handlers/expire-import-rows.ts`, `apps/web/src/lib/income-import/`, `apps/web/src/functions/income-import.ts`, `apps/web/src/components/income/import/`; Razorpay Payment Page ingestion: `apps/web/src/routes/api/razorpay/webhook.ts`, `apps/web/src/lib/razorpay/`, `packages/db/src/queries/razorpay-import.ts`, `apps/web/src/functions/razorpay-settings.ts`, `packages/db/src/queries/razorpay-refunds.ts`, `packages/db/src/refund-rules.ts`, `packages/db/src/schema/gateway-settlement.ts`, `packages/db/src/queries/razorpay-settlements.ts`, `packages/shared/src/settlements.ts`, `packages/zero/src/queries/gateway-settlement.ts`, `apps/web/src/components/income/settlements/`, `apps/web/src/components/settings/sections/razorpay-section.tsx` and `razorpay-sync-card.tsx` (Settings → Integrations); give.do payouts: `apps/web/src/lib/give-do-payout/`, `apps/web/src/functions/give-do-payouts.ts`, `packages/db/src/queries/give-do-payouts.ts`; donations return: `packages/shared/src/donations-return.ts` (inclusion rules, codes and columns, one place), `packages/db/src/queries/donations-return.ts`, `apps/web/src/functions/donations-return.ts`, `apps/web/src/lib/donations-return-export.ts`, `apps/web/src/routes/_app/income/return.tsx`, `apps/web/src/components/settings/sections/donations-return-section.tsx` |
| Donation receipts (finance Phase 3) | Receipts for direct gifts only (gateways receipt their own), gap-free per-year numbering via a locked counter row, frozen server-only snapshot, void keeps the number, on-demand PDF, manual email job, `donors.receipt` | `packages/shared/src/receipts.ts`, `packages/db/src/schema/contribution-receipt.ts`, `packages/db/src/queries/contribution-receipts.ts`, `packages/pdf/src/donation-receipt.tsx`, `apps/web/src/functions/contribution-receipts.ts`, `apps/web/src/routes/api/receipts/`, `apps/web/src/components/income/receipts/` |
| Books (finance Phase 3) | Posting engine (idempotent, per-source lock, closed-year refusal, reversal only), append-only `posting`, `ledger_entry`, `account_movement`, `movement_allocation` (DB triggers refuse UPDATE/DELETE/TRUNCATE; `ensureLedgerTriggers` for push-built DBs), opening-balance document, year close and reopen, income posting (rules in `ledger/income-rules.ts`, `ledger_source_state`, `ledger-post-source` and `ledger-post-pending` jobs, Post pending), finance-admin book-keeping permissions (`finance.post_opening`, `finance.close_year`, `finance.reopen_year`, `finance.adjust`, `finance.post_pending`) and the Books page | `packages/db/src/ledger/`, `packages/db/src/schema/ledger.ts`, `packages/shared/src/ledger.ts`, `packages/zero/src/queries/ledger.ts`, `apps/web/src/functions/books.ts`, `apps/web/src/lib/books/server.ts`, `apps/web/src/routes/_app/finance/books/`, `apps/web/src/components/books/` |
| Expense "Charged to" | Which work a reimbursement or vendor payment served (event, programme or project, organisation); `expenseProgrammeOf` derives every request programme | `packages/shared/src/expense-charge.ts`, `packages/zero/src/mutators/expense-charge.ts`, `apps/web/src/components/expenses/`, `apps/web/src/lib/request-programme.ts` |
| Audit ledger | Immutable action schema and permission in DB; capture, API, and viewer in web | `packages/db/src/schema/audit-log.ts`, `apps/web/src/lib/audit.ts`, `apps/web/src/routes/api/audit-log.ts`, `apps/web/src/routes/_app/audit-log.tsx` |
| Jobs and notifications | pg-boss handlers and multi-channel delivery; email and WhatsApp held for 5 minutes per recipient and topic and sent as one digest (inbox stays instant; `sendImmediately` topics skip it); email through Resend with product-styled templates, batch bulk sends, signed one-click unsubscribe, and bounce/complaint suppression that admins clear from the user sheet; WhatsApp to people through Meta's Cloud API as approved templates (each sender passes `whatsappTemplate`; GoWA keeps groups, polls and scheduled messages), with a send log, a webhook for statuses and the auto-reply, and group invites instead of adds | `packages/jobs/`, `packages/notifications/`, `packages/email/`, `apps/web/src/routes/api/email/`, `apps/web/src/routes/unsubscribe.tsx`, `packages/db/src/schema/private/email-suppression.ts`, `packages/notifications/src/batching.ts`, `packages/db/src/schema/private/held-notification.ts`, `packages/whatsapp/src/templates.ts`, `packages/whatsapp/src/notify.ts`, `packages/whatsapp/src/cloud.ts`, `packages/db/src/schema/private/whatsapp-message.ts`, `apps/web/src/routes/api/whatsapp/cloud/webhook.ts`, `scripts/whatsapp-templates.ts` (`bun run whatsapp:templates`) |
| Environment | Server and web environment contracts | `packages/env/`, `.env.sample` |
| Design system | Shared shadcn/ui and reui components | `packages/design-system/` |
| E2E | Playwright fixtures, seeds, specs, and orchestration | `packages/e2e/` |

## Setup and focused verification

```bash
bun install
cp .env.sample .env
bun run db:start
bun run zero:generate
bun run dev
```

The local app and Zero require Dockerized PostgreSQL. Core local variables are `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ZERO_UPSTREAM_DB`, `ZERO_MUTATE_URL`, `ZERO_QUERY_URL`, and `VITE_ZERO_URL`. Keep secret values in `.env`; only names and sample values belong in `.env.sample`.

| Changed surface | Focused checks |
|---|---|
| TypeScript in any package | `bun run check:types` |
| Lint or formatting | `bun run check` |
| Unit-testable behavior | `bun run test:unit` |
| Workspace exports or dependency graph | `bun run check:unused` |
| Drizzle schema | `bun run db:generate`; inspect the generated migration; run `bun run db:migrate` when local application is needed |
| Zero schema source | `bun run zero:generate` |
| `packages/e2e/**` or major user flow | `bun run test:e2e`; use `bun run test:e2e:ui` for local debugging |
| One E2E spec | `cd packages/e2e && bash run-e2e.sh tests/<spec>.spec.ts` |
| Generated agent instructions | `bun run ruler:apply` |

Treat this table as the canonical command map for task planning. Do not reopen root or package manifests, `.env.sample`, or generated instructions solely to confirm facts listed here; inspect them only when modifying their contents or when task-specific detail is missing.

There is no single documented full-repository gate. **Done when** the task goal is met, changed files are listed, relevant checks passed or have a concrete unavailable reason, there are no generated-file edits, stale references, or unexplained diffs, and major features have E2E coverage.

Lefthook runs type checking, lint, unit tests, and unused-export checks in parallel before commits. Staged JS/TS files get `ultracite fix`; `package.json`, `bun.lock`, and biome config trigger a full-repo `bun run check`. Commitlint enforces conventional commits.

## Generated and protected files

- Edit `.ruler/agent-guide.md`, then run `bun run ruler:apply`; do not edit `AGENTS.md` or `CLAUDE.md` directly.
- Do not edit `routeTree.gen.ts`, `packages/zero/src/schema.ts`, `packages/db/src/migrations/**`, `packages/design-system/lib/utils.ts`, or `packages/design-system/hooks/use-mobile.ts` directly.
- In `packages/design-system/components/**`, keep edits to class-level styling (radius, type size, colour tokens) that matches the shadcn `base-nova` style; behaviour changes belong in app wrappers under `apps/web/src/components/shared`.
- Change route sources to regenerate the route tree. Change the Drizzle schema, then run `bun run zero:generate` for the Zero schema.
- Add new design-system components with `bun run ui:add <component>` (style `base-nova`, configured in `packages/design-system/components.json`).
- When adding a new `packages/*` workspace, add its package manifest to the Dockerfile copy layer before `bun install`.

## Direct architecture routing

Read the named chapter directly when its detailed behavior is needed; do not read `docs/architecture/index.md` first. For ownership, entry points, commands, and protected paths already stated here, use this file without reopening the chapter or project map.

| Task touches | Read |
|---|---|
| Zero, Drizzle, sync, SSR loaders, optimistic updates | `docs/architecture/data-layer.md` |
| Better Auth, sessions, sign-in | `docs/architecture/auth.md` |
| Permissions, roles, authorization checks | `docs/architecture/authorization.md` |
| Recurring events and RRULE | `docs/architecture/recurring-events.md` |
| Social API, bearer tokens, signed photo links, posted log, social digest, Social page, pause switches, posting rules, run reports | `docs/architecture/social-api.md` |
| Finance redesign: expense "Charged to", programmes, projects, funds, ledger entries, posting engine, income and expense posting rules, main bank account and waiting to post, books, opening balances, year close, audited figures (year-end true-up, depreciation, provisions written back), book-keeping permissions, account heads, contributions, CSV imports, give.do payout XLSX, Reached bank filter, Razorpay ingestion, reconcile, backfill, refunds and settlements and external identities, bank statement lines and matching, bank debit matching and bank charges, donors, donation receipts and numbering, Form 113/114 (formerly 10BD/10BE), donations return readiness and export, CA handoff workbook (XLSX), tax certificate opt-out, FC-4, budgets, approval policy, advance settlement, in-kind, retention classes | `docs/architecture/finance-and-programmes.md` |
| Finance Phase 0 ledger cutover: cutover date, opening balances from the audited FY 2025-26 statements, fixed deposit account, backfill, plain-language posting rules, CA questions, CA handoff workbook columns | `docs/architecture/finance-ledger-cutover.md` |
| Vendor payments and invoice approval, vendor details and bank-account reveal | `docs/architecture/vendor-payments.md` |
| pg-boss, notifications, notification batching and digests, email templates, unsubscribe, bounces, WhatsApp delivery | `docs/architecture/notifications.md`, `docs/architecture/jobs.md` |
| R2 uploads, attachments, Immich | `docs/architecture/file-uploads.md` |
| Cash-voucher, payee signature or Kalakriti ID-card PDF generation | `docs/architecture/cash-vouchers.md`, `docs/architecture/pdf.md` |
| Logging and request/task events | `docs/architecture/observability.md` |
| Visual design, colours, fonts, brand styling, restyling screens | `docs/architecture/design-language.md` |
| Plate editor | `docs/architecture/editor.md` |
| Shared client/server constants | `docs/architecture/shared.md` |
| Workspaces, Turborepo, Docker package layout | `docs/architecture/monorepo.md` |
| Environment, secrets, worktree ports | `docs/architecture/env-and-secrets.md` |
| Auth cache, permission cache, rate limiting | `docs/architecture/caching.md` |
| Playwright, seeds, auth state, E2E isolation | `docs/architecture/e2e-testing.md` |
| Kalakriti Edition access, registration, entry music files and backfill, judge scorecards, competition results, Awards recipient and group prize handovers and undo, Center standings and finalization, inventory items and stock history, lifecycle, schedule, audit, exports, Volunteer and Guardian yearly IDs, non-login Guest/Judge rosters, Events Lead Judge management and history-protected deletion, judge Competition assignments, detail-sheet JSON QR codes, administrator all-person ID-card PDF downloads, the Transport directory and per-vehicle pickup times, row-click Center detail sheets and deep links, Center editing and Guardian/Liaison assignment modals, lifecycle-independent Center name/location/Google Maps fields, Student/Center transport status columns, Food roster, meal statistics and meal undo, Volunteer check-in, the Center-union Students directory, the unified Competition/Entries workspace, atomic per-Division scheduling, Settings configuration tabs and Present/Attended status, role-aware sidebar scanning (transport, volunteer check-in, meals, attendance, inventory dispatch/return), phase-aware role dashboards, scoped work-page summaries and filtered work links, Go-live readiness or event-day operations | `docs/architecture/kalakriti-registration.md` |

Skip architecture docs for copy, lint-only changes, dependency bumps, isolated tests, typo fixes, and unrelated dev-tool configuration. Start from the owning code and open a chapter only when the code exposes an unfamiliar boundary.

## Load-bearing implementation rules

### Query performance

Before adding or changing Zero query relationships, route preloads, access-request coordination, or database queries/indexes, read `.agents/skills/query-performance/SKILL.md` for preventive implementation rules and focused verification.

### Permissions

- Use `assertHasPermission(ctx, "permission.id")` for authorization, `can(ctx, "id")` for conditional server checks, and `hasPermission("id")` from AppContext on the client.
- For protected TanStack routes, enforce the permission in `beforeLoad` with `assertPermission(context, "permission.id")` and gate the matching UI action with `hasPermission`. Test `Route.options.beforeLoad` directly with denied and allowed contexts; do not extract a wrapper solely to make the guard testable.
- Add permissions in `packages/db/src/permissions.ts`. Do not delete or rename IDs without migrating `rolePermission` rows.
- Separate `{entity}.view` from `{entity}.manage` when admin pages expose sensitive data.

### Jobs and mutations

- Use `enqueue()` from `@pi-dash/jobs` for asynchronous side effects. Do not call notification or WhatsApp handlers directly from server functions, auth hooks, or mutators; account deletion is the synchronous exception because it captures enabled email delivery before deletion and sends only after deletion succeeds.
- Wrap side-effect enqueues with `withFireAndForgetLog()`. Await enqueue only when enqueueing is the primary operation.
- Use `handleMutationResult()` for Zero mutation server results.
- Use `uuidv7()` for IDs. Do not use `Date.now()` in notification idempotency keys; pass the deterministic mutator timestamp.

### Audit ledger

- Route direct authenticated state-changing commands through the central Zero mutation audit boundary or `runSessionAuditedAction`. Preserve the explicit exclusions for reads, navigation, exports, presigned-upload URL issuance, unauthenticated auth flows, webhooks, scheduled jobs, and downstream background effects.
- Store stable action IDs, sanitized entity identifiers, changed field names, and bounded counts only. Never put raw payloads, secrets, contact details, free text, file data, URLs, object keys, request IP/user-agent, or error messages in `audit_log` metadata.
- Revealing an encrypted identifier (`party.identifier.reveal`) is audited on purpose even though it is a read.
- Enforce `audit_log.view` independently in the page guard and `/api/audit-log`. Finalized ledger rows have no product update or delete path; only pending non-transactional attempts may finalize once.

### Visual design

- pi-dash uses the **product** design language from `@proudindian/design` (brand guide appendices A1–A2), never the playful website and marketing language. Read `docs/architecture/design-language.md` before styling or restyling screens.
- Never use `.pi-*` classes, `@proudindian/design` React components or `PiRoot`, doodles, paper backgrounds, ink offset shadows, Bricolage 800 or marigold in pi-dash, and import only `theme.css` and `fonts.css` from the package.

### Imports and React boundaries

- Import design-system components through `@pi-dash/design-system/components/ui/...` or `/reui/...`, never through `src/` paths.
- Start every app page with `PageHeader` from `@/components/shared/page-header`; put the page's primary action in its `actions`, not in the table toolbar, and secondary or destructive page actions in `PageHeaderMenu`.
- Use `ResponsiveActionMenu` from `@/components/shared/responsive-action-menu` for web row and page action menus; every action needs an `icon` (a Hugeicons icon), and destructive actions are sorted last. Start detail sheets with `DetailSheetHeader` from `@/components/shared/detail-sheet-header`, with the record's actions in its header. Keep action permissions and confirmations at the call site. Theme, filter, column, and editor selection controls retain their specialized menu primitives.
- Use `Sheet` from `@/components/shared/responsive-sheet` for detail sidesheets. Desktop stays a right-side sheet; below 768px it uses the Base UI Drawer mobile-navigation pattern.
- Put client-accessible constants in `@pi-dash/shared`.
- Keep static imports in server functions, API routes, and server-only packages. Do not use dynamic imports in `createServerFn` or `routes/api/`.
- Keep `useMemo` and `useCallback` where third-party components or shared hook return values require stable references.

## Documentation and delivery

- Update `README.md` and this source guide for major features.
- Update `project-structure.md` when routes, environment variables, paths, or structural patterns change.
- Update the matching architecture chapter when a subsystem boundary changes.
- Update `DEPLOYMENT.md` when production environment variables, services, or build steps change.
- New database tables require idempotent seed records in `scripts/seed.ts`; transient queue and log tables (held notifications, email batch snapshots, the WhatsApp send log) are exempt.

For worktrees, use `bun run worktree:setup <ID>` and `bun run worktree:teardown`; use `--isolated-db` when the task needs isolated PostgreSQL state.
