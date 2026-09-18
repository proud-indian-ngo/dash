# Project Structure Reference

All paths are relative to project root.

## Command Map

| Command | Purpose |
|---|---|
| `bun run check:types` | TypeScript type check |
| `bun run check` | Linter (ultracite/Biome) |
| `bun run fix` | Auto-fix linter issues (ultracite/Biome) |
| `bun run check:unused` | Find unused exports (knip) |
| `bun run test:unit` | Run unit tests (Vitest and E2E shell checks) |
| `bun run db:generate` | Generate Drizzle types |
| `bun run db:push` | Push schema changes to database |
| `bun run db:migrate` | Run pending migrations |
| `bun run r2:migrate-media-urls -- --legacy-cdn-url=<url>` | Dry-run legacy avatar/editor media backfill; add `--apply` only after reviewing the report |
| `bun run zero:generate` | Regenerate Zero schema |
| `bun run zero:analyze` | Analyze named Zero queries; `ZERO_ANALYZE_PROFILE=events` (default) or `kalakriti` with required `ZERO_ANALYZE_EDITION_ID`; authenticate via environment |
| `bun run whatsapp:start` | Start WhatsApp gateway container |
| `bun run whatsapp:stop` | Stop WhatsApp gateway container |
| `bun run dev:webhook-proxy` | Start WhatsApp webhook proxy (required for local webhook testing — Vite dev server can't handle chunked POST from Go) |
| `cd packages/e2e && bash run-e2e.sh` | Run E2E tests (full stack) |
| `cd packages/e2e && bash run-e2e.sh tests/foo.spec.ts` | Run specific test files |
| `cd packages/e2e && E2E_SERVER=dev bash run-e2e.sh tests/foo.spec.ts` | Run E2E against Vite dev instead of the default production build |
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | Run E2E tests via Turborepo |
| `bun run test:e2e:ui` | Run E2E tests in Playwright UI mode |
| `bun run analyze` | Bundle analysis (web app) |
| `bun run ruler:apply` | Apply Ruler config |
| `bun run worktree:setup <ID>` | Set up worktree with port isolation (ID 1-9) |
| `bun run worktree:setup <ID> --isolated-db` | Set up worktree with isolated Postgres |
| `bun run worktree:teardown` | Clean up worktree resources |
| `bash scripts/worktree-smoke-test.sh` | End-to-end worktree validation |
| `bash scripts/cloud-setup.sh` | Cloud environment setup (PG upgrade, schema push, seed) |
| `bun run seed` | Seed all dev data — idempotent, covers all models |

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
| `apps/web/src/routes/_app.tsx` | Authenticated layout (sidebar, breadcrumbs) |
| `apps/web/src/routes/_auth.tsx` | Unauthenticated guard (pass-through outlet) |
| `apps/web/src/middleware/auth.ts` | Auth middleware |
| `apps/web/src/context/app-context.tsx` | App context provider (authenticated user) |
| `apps/web/src/components/zero-init.tsx` | Zero client initialization |
| `apps/web/vitest.config.ts` | Unit test config for web app |
| `apps/web/src/components/data-table/data-table-wrapper.tsx`, `apps/web/src/components/data-table/{column-fill,use-column-fill}.ts` | Shared table rendering and viewport-aware last-unpinned-column fill, separate from persisted preferred widths |
| `apps/web/vite.config.ts`, `apps/web/src/lib/dev/react-compiler-preset.ts` | Vite build configuration; keeps imperative ReUI sizing renderers outside React Compiler so resized widths and pin offsets stay current |

### Routes

| Route file | Purpose |
|---|---|
| `routes/_app/index.tsx` | Dashboard |
| `routes/_app/users.tsx` | User management |
| `routes/_app/reimbursements/route.tsx` | Reimbursements layout |
| `routes/_app/reimbursements/index.tsx` | Reimbursements list (combined reimbursements + advance payments) |
| `routes/_app/reimbursements/new.tsx` | Create reimbursement |
| `routes/_app/reimbursements/$id.tsx` | View/edit reimbursement (resolves type from ID) |
| `routes/_app/teams/route.tsx` | Teams layout |
| `routes/_app/teams/index.tsx` | Teams list |
| `routes/_app/teams/$id.tsx` | Team detail |
| `routes/_app/events/route.tsx` | Events layout |
| `routes/_app/events/index.tsx` | Public events list |
| `routes/_app/events/$id.tsx` | Event detail (updates, photos, members) |
| `routes/_app/kalakriti/route.tsx` | Kalakriti layout (`kalakriti.view` permission guard) |
| `routes/_app/kalakriti/index.tsx` | Latest accessible Edition redirect and no-access fallback |
| `routes/_app/kalakriti/$year/route.tsx` | Edition-scoped container and exact-year access guard |
| `routes/_app/kalakriti/$year/index.tsx` | Phase-aware role dashboard, Edition header, registration breakdowns and standings |
| `components/kalakriti/role-dashboard.tsx`, `components/kalakriti/use-dashboard-snapshot.ts` | Scoped action sections and retained server-summary refresh |
| `functions/kalakriti-dashboard-summary.ts`, `lib/server/kalakriti-dashboard-summary.ts` | Authenticated role aggregates and registration projections |
| `components/kalakriti/*-stats.tsx`, `people-page-summary.tsx`, `competition-readiness-summary.tsx`, `entry-session-summary.tsx` | Scoped work-page metrics, exception filters, and completion visuals |
| `lib/kalakriti-competition-page-metrics.ts` | Shared active Competition and scheduled Session counting rules |
| `lib/kalakriti-dashboard-filter.ts` | Validated dashboard destination tokens translated to visible table filters |
| `components/kalakriti/{volunteer,guardian,student}-detail-sheet.tsx` | Table-owned person details, Guardian/Student Center details, Student competition entries, and identifier QR codes for every authorized viewer |
| `components/kalakriti/person-qr-panel.tsx` | Client-rendered JSON QR containing the database record `id` and subject `type` (`student`, `guardian`, or `volunteer`) |
| `components/kalakriti/{food-table,food-stats,food-meal-undo}.tsx`, `components/kalakriti/food-roster-snapshot.ts`, `lib/kalakriti-food-policy.ts` | Eligible-only Food roster with retained authoritative snapshots, column filters, whole-authorized-roster meal totals, guarded meal undo, and shared page/navigation read policy |
| `components/kalakriti/scan-dialog.tsx` | Stable sidebar modal with four role-derived scanning activities and pending-write guards |
| `components/kalakriti/edition-lifecycle-card.tsx`, `packages/zero/src/kalakriti-go-live-readiness.ts` (repository root for package path) | Registration transitions and confirmed, credential-free Go-live readiness |
| `components/kalakriti/center-scan-dialog.tsx` | Transport panel: continuous QR/manual marking, roster progress, pinned Center stages, and confirmed finalization |
| `components/kalakriti/operation-scan-panel.tsx` | Live-only volunteer check-in, meals, and scoped Competition attendance with explicit scan contexts |
| `lib/kalakriti-scan-recording.ts` | Stable nontransport operation arguments and retry keys across activity changes |
| `components/kalakriti/event-day-qr-scanner.tsx` | Client-only camera decoder with startup failure handling and camera cleanup |
| `lib/kalakriti-qr-decoder.ts` | Stable lazy decoder entry for camera loading and E2E interception in development and production builds |
| `components/kalakriti/use-transport-status-snapshot.ts` | Keeps Student/Center transport labels tied to complete, scoped query snapshots without hiding the base table |
| `routes/_app/kalakriti/$year/transport.tsx` | Scoped Transport directory and table-owned vehicle editing/deletion; Center sheets retain read-only transport |
| `routes/_app/kalakriti/$year/inventory.tsx` | Edition Inventory Items and Transactions tabs, with role and archived-Edition access guards |
| `components/kalakriti/inventory-{items-table,item-dialog,movement-dialog}.tsx` | Item catalog, optional photo, and stock movement forms with item history |
| `components/kalakriti/inventory-scan-panel.tsx` | Volunteer QR/yearly-ID capture, scanned profile, assigned Competition/role choices, searchable item multiselect, and atomic dispatch/return batches |
| `lib/kalakriti-inventory-assignment-options.ts` | Deduplicated active Competition and role choices from the scanned Volunteer’s assignments |
| `lib/kalakriti-inventory-{policy,upload}.ts` | Inventory route/navigation policy and protected item-photo upload helpers |
| `packages/zero/src/{queries,mutators}/kalakriti-inventory.ts`, `packages/zero/src/kalakriti-inventory-schema.ts` (repository root) | Scoped catalog/history/picker reads and validated, serialized stock commands |
| `packages/shared/src/kalakriti-inventory.ts` (repository root) | Shared movement types, inventory responsibilities, and photo size limit |
| `components/kalakriti/transport-table.tsx` | One row per vehicle, unassigned Center placeholders, location/Maps links, pickup times, and retained scan-derived status |
| `lib/kalakriti-transport-policy.ts` | Transport route/navigation readership and management capabilities |
| `components/kalakriti/center-transport-section.tsx` | Read-only Center vehicle details and derived Center-stage status |
| `components/kalakriti/center-edit-dialog.tsx` | Shared Center editor: lifecycle-independent basic details, guarded registration controls, and Guardian/Liaison assignments |
| `components/kalakriti/center-edit-assignments.tsx` | Editor-only scoped assignment queries and central-volunteer picker loading |
| `components/kalakriti/center-transport-form-dialog.tsx` | Scoped vehicle creation/editing form; archived Editions remain read-only |
| `components/kalakriti/entry-music-dialog.tsx` | Staged additions and per-file removals for up to two Entry music files, including after registration closes |
| `components/kalakriti/entry-music-field.tsx` | Multi-select/drop audio uploads with per-file status, removal, and partial-failure retries |
| `components/kalakriti/entry-music-upload.ts` | Audio MIME resolution, bounded upload claims, and temporary-object discard helpers |
| `components/kalakriti/entry-music-playback-dialog.tsx` | Table-owned per-file audio playback and protected download, available independently of music-edit permission |
| `packages/zero/src/mutators/kalakriti-entry-music-cleanup.ts` (repository root) | Removes child music rows and queues reference-checked cleanup when an Entry or Student is deleted |
| `lib/dev/api-media-dev-middleware.ts` | Vite-only API media request normalization so Nitro routes native image/audio/video requests to their protected handlers |
| `routes/api/kalakriti/$year/people/lookup.ts` | Session- and Edition-admin-protected person lookup by database or yearly ID |
| `packages/shared/src/kalakriti-person-qr.ts` (repository root) | Strict bounded parser for detail-sheet JSON person identifiers |
| `packages/zero/src/mutators/kalakriti-operation.ts` (repository root) | Live-only recording, scoped operator authorization, retry idempotency, and manual yearly-ID resolution |
| `routes/_app/kalakriti/$year/centers/index.tsx` | Edition Center list and registration controls |
| `routes/_app/kalakriti/$year/centers/index.tsx` | Centers directory with a scoped `centerId` search parameter for row-click sheets and notification deep links |
| `components/kalakriti/center-detail-sheet.tsx` | Center fields, registration/compliance, scoped Guardian/Liaison lists, and lazily loaded read-only transport; actions open table-owned modals |
| `routes/_app/kalakriti/$year/competitions/route.tsx` | Unified Competition workspace guard: Entry readers retain scoped access; configuration controls use existing manager/lifecycle rules |
| `routes/_app/kalakriti/$year/competitions/index.tsx` | One row per age-specific Competition, scoped Entries, schedule, create/edit/cancel and inline Entries selection |
| `routes/_app/kalakriti/$year/competitions/sessions/$id.tsx` | Redirect to the Competition workspace with the age-specific Competition selected |
| `routes/_app/kalakriti/$year/settings/` | Role-gated Edition details/participation rules, Competition Categories, Venues, and Eligibility tabs |
| `routes/_app/kalakriti/$year/competitions/{catalog,categories,venues,schedule}.tsx`, `eligibility.tsx` | Redirects to the consolidated Competition workspace and Settings |
| `routes/_app/kalakriti/$year/guardians.tsx` | Edition Guardian access management |
| `routes/_app/kalakriti/$year/{guests,judges}.tsx` | Non-login attendee rosters, detail-sheet QR/status display, and many-to-many judge Competition assignments |
| `packages/zero/src/{mutators,queries}/kalakriti-attendee.ts` (repository root) | Edition-bound attendee commands and administrator/lead-scoped roster reads |
| `routes/_app/kalakriti/$year/students.tsx` | Authorized-Center-union Student directory with a Center column/filter, explicit-Center registration, and actual-row-Center edit/detail/delete guards |
| `routes/_app/kalakriti/$year/entries.tsx`, `entries/` | Legacy Entries redirects to the Competition workspace and inline Entries selection, preserving Center search parameters |
| `routes/_app/kalakriti/$year/food.tsx` | Scoped Student/Volunteer/Guardian/Guest/Judge Food roster with eligibility and served history |
| `functions/kalakriti-food.ts`, `components/kalakriti/use-food-attendees.ts` | Authenticated no-contact Guest/Judge Food projection, five-second/focus refresh, and snapshot readiness |
| `routes/_app/kalakriti/$year/audit.tsx` | Edition-wide administrator and assignment-scoped Lead audit trail with stable pagination |
| `routes/_app/kalakriti/new.tsx` | Create an Edition and protected linked event (`kalakriti.admin` guard) |
| `routes/kalakriti/$year/schedule.tsx` | Public Competition schedule for open, locked, live, and archived Editions with signup, volunteer-interest, and Edition dashboard calls to action |
| `routes/_app/vendor-payments/route.tsx` | Vendor payments layout (requests permission guard) |
| `routes/_app/vendor-payments/index.tsx` | Vendor payments list with DataTableWrapper |
| `routes/_app/vendor-payments/new.tsx` | New vendor payment form |
| `routes/_app/vendor-payments/$id.tsx` | Vendor payment detail + transactions |
| `routes/_app/vendors/route.tsx` | Vendors layout (`assertPermission("vendors.view_all")` guard) |
| `routes/_app/vendors/index.tsx` | Vendors list |
| `routes/_app/settings/roles/route.tsx` | Roles layout |
| `routes/_app/settings/roles/index.tsx` | Roles list |
| `routes/_app/settings/roles/$roleId.tsx` | Role detail (permissions) |
| `routes/_app/scheduled-messages.tsx` | Scheduled WhatsApp messages (`messages.schedule` permission guard) |
| `routes/_app/analytics.tsx` | Analytics dashboard with charts (`requests.view_all` permission guard) |
| `routes/_app/jobs.tsx` | Background jobs dashboard (`jobs.manage` permission guard) |
| `routes/_app/audit-log.tsx` | Immutable user-action audit viewer (`audit_log.view` permission guard) |
| `routes/_app/export.tsx` | CSV data export (reimbursements, advance payments, vendor payments) |
| `routes/_auth/login.tsx` | Login |
| `routes/_auth/register.tsx` | Registration (`?eventId=` / `?group=` optional) |
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
| `routes/api/immich/original.$id.ts` | Immich photo original image proxy |
| `routes/api/media/event-photo.$id.ts` | Authorized event-photo signed redirect |
| `routes/api/kalakriti/$year/schedule.ts` | Public lifecycle-filtered Kalakriti schedule API with an explicit public data allowlist |
| `routes/api/kalakriti/$year/audit.ts` | Authenticated Edition/domain-scoped Kalakriti audit API with privacy-safe metadata |
| `routes/api/kalakriti/$year/registration-export.ts` | Authenticated assignment-scoped Student and Competition Entry CSV archive download |
| `routes/api/media/avatar.$userId.ts` | Authorized avatar signed redirect matched to the current persisted image |
| `routes/api/media/event-update.ts` | Authorized event editor-media signed redirect matched to persisted Plate content |
| `routes/api/jobs/index.ts` | Jobs list/create API (GET/POST, `jobs.manage` permission) |
| `routes/api/jobs/stats.ts` | Queue size stats API |
| `routes/api/jobs/$id.ts` | Job detail API |
| `routes/api/jobs/$id/cancel.ts` | Cancel job API |
| `routes/api/jobs/$id/retry.ts` | Retry failed job API |
| `routes/api/audit-log.ts` | Permissioned audit ledger query API (server pagination and filters) |
| `routes/api/attachments/download.ts` | Authorized attachment download proxy |

All route paths above are prefixed with `apps/web/src/`.

External Kalakriti accounts use the technical `external_user` role. They land
on their active Edition, are excluded from central volunteer pickers and admin
user management, and cannot query organization-wide Zero data. The linked
pi-dash event remains read-only outside the Kalakriti module.

### Components

| Directory | Contents |
|---|---|
| `components/layout/` | app-sidebar, nav-main, nav-user, team-switcher, breadcrumbs |
| `components/data-table/` | data-table-wrapper, ReUI Filters adapter (`compile-filter-query`, `use-data-table-filters`, `filter-fields`, `filter-date-editor`, `use-migrate-legacy-filter-params`) |
| `components/audit/` | audit-log table, row detail sheet, and API response types |
| `components/users/` | users-table, user-form, password-form, ban-user-form |
| `components/reimbursements/` | reimbursements-table, reimbursement-form, reimbursement-detail, reimbursement-stats (unified reimbursements + advance payments) |
| `components/teams/` | teams-table, team-detail, team-form-dialog, add-member-dialog |
| `components/shared/` | user-avatar, user-picker, confirm-dialog, responsive-dialog, responsive-sheet (desktop side sheet and mobile drawer navigation), responsive-action-menu (desktop dropdown and mobile action sheet) |
| `components/editor/` | plate-editor (rich-text with image upload), plate-renderer (read-only) |
| `components/events/` | public-events-table |
| `components/kalakriti/` | Edition configuration, assignments, Guardian access, Competition schedule, Student and Entry registration, scoped dashboards and ZIP exports, and scoped audit tables |
| `components/teams/events/` | events-table, events-table-helpers (RRULE expansion, display row building), event-form-dialog, event-detail, event-details-card, event-attendance-section, event-updates, event-photos, add-event-member-dialog, show-interest-dialog, interest-requests, recurrence-builder (RRULE form UI), edit-scope-dialog (this/following/all scope selection), event-actions-menu |
| `components/settings/` | settings-dialog, sections/ (profile, account, banking, expense-categories, whatsapp-groups, notifications) |
| `components/form/` | form-layout, form-modal, form-actions, form-context, custom-field, input-field, date-field, phone-field, phone-field-lazy, textarea-field, checkbox-field, select-field, add-url-row, line-items-editor, attachments-section, reject-dialog, approve-dialog |
| `components/login/` | auth-layout (split-panel shell), auth-info-panel (info panels for signup/login), login-form, register-form, forgot-password-form, reset-password-form |
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
| `hooks/use-unread-notification-count.ts` | Unread notification count (Zero query) |

All hook paths above are prefixed with `apps/web/src/`.

### Server Functions

| File | Purpose |
|---|---|
| `functions/get-auth.ts` | Combined session + permissions (single round-trip) |
| `functions/get-session.ts` | Authenticated user session |
| `functions/get-permissions.ts` | Resolve permissions for current user's role |
| `functions/user-admin.ts` | Admin CRUD: create, update, setPassword, delete, setBan |
| `functions/attachments.ts` | Surface-specific temp attachment signing (including owner/approver invoice scope) plus dedicated avatar and event editor-media upload/delete functions |
| `functions/event-feedback.ts` | Get authenticated user's feedback for an event (`getMyEventFeedback`) |
| `functions/export-csv.ts` | CSV data export server function |
| `functions/immich-upload.ts` | Immich photo upload server function |
| `functions/role-admin.ts` | Role CRUD and permission assignment server functions |
| `functions/admin-actions.ts` | Audited maintenance and job triggers |
| `functions/event-poll.ts` | Audited event RSVP poll command |

All function paths above are prefixed with `apps/web/src/`.

### Lib

| File | Purpose |
|---|---|
| `lib/api-auth.ts` | API route auth helpers |
| `lib/audit.ts` | Audit actor snapshots, sanitized mutation summaries, and audited-action runners |
| `lib/auth-client.ts` | Better-auth client with admin plugin |
| `lib/avatar.ts` | Avatar URL builder (DiceBear) |
| `lib/validators.ts` | Shared Zod schemas |
| `lib/form-schemas.ts` | Form-level Zod schemas |
| `lib/table-utils.ts` | Table state utilities |
| `lib/errors.ts` | Error handling utilities |
| `lib/logger.ts` | evlog init (imported at server startup) |
| `lib/attachment-links.ts` | Generic attachment URL helpers |
| `lib/reimbursement-types.ts` | Union types, type guards, and normalizer for unified reimbursements module |
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
| `lib/kalakriti-registration-export.ts` | Allowlisted Kalakriti registration CSV and ZIP archive generation |
| `lib/kalakriti-registration-scope-policy.ts` | Canonical assignment-to-registration-scope policy for dashboards and exports |
| `lib/client-logger.ts` | Client-side logging |

All lib paths above are prefixed with `apps/web/src/`.

### Packages

| Package | Key paths |
|---|---|
| `packages/auth/` | `src/index.ts` (auth config), `src/seed-admin.ts` (lightweight admin-only seed) |
| `packages/db/` | `src/kalakriti-orientation.ts` (transactional conditional role promotion and session revocation), `src/schema/` (Drizzle tables), `src/migrations/`, `src/permissions.ts` (code-defined permission registry), `src/queries/resolve-permissions.ts` (resolve user permissions with cache), `src/sync-permissions.ts` (sync permission registry to DB), `docker-compose.yml` (postgres, postgres-test, postgres-migration, whatsapp), `scripts/migrate-legacy-data.ts` |
| `packages/email/` | `src/mailer.ts` (Nodemailer transport), `src/templates/` (verification-email, reset-password-email) |
| `packages/env/` | `src/server.ts` (server env), `src/web.ts` (client env) |
| `packages/config/` | Shared TypeScript & tooling config |
| `packages/shared/` | Client-safe constants and types shared across packages (e.g., `cityValues`, `attachmentTypeValues`, `historyActionValues`, `event-reminders` presets/formatting, `rrule-expand` series expansion) — no heavy dependencies |
| `packages/design-system/` | `components/ui/` (shadcn), `components/reui/` (custom: data-grid, badge, alert), `hooks/`, `lib/` (theme-provider, utils) |
| `packages/notifications/` | `src/send/` (reimbursement, advance-payment, vendor-payment, vendor-payment-transaction, user, submission, team, team-event, event-interest, event-update, event-photo, event-feedback, Kalakriti registration, and Kalakriti schedule), `src/send-message.ts` (core send/bulk send), `src/inbox.ts` (DB insert), `src/email.ts` (nodemailer send), `src/topics.ts` (10 topics + `TOPIC_CATALOG`), `src/preferences.ts` (channel preference lookup), `src/helpers.ts` |
| `packages/jobs/` | pg-boss job queue — `src/boss.ts` (singleton), `src/producer.ts` (explicit-target CLI producer without handlers or schedules), `src/enqueue.ts` (typed `enqueue()` + payload types), `src/handlers/` (job handlers), `src/handlers/r2.ts` (shared R2 S3 client), `src/schedules.ts` (cron schedules), `src/handlers/create-handler.ts` (handler factory), `src/lib/` (shared utils: `reminder-sentinel.ts`, `materialize-occurrences.ts`, `rrule-expand.ts` re-export, `weekly-digest-utils.ts`). `send-scheduled-whatsapp` uses a dedicated dead letter queue (`dead-letter-scheduled-whatsapp`) to avoid hijacking the shared `dead-letter` queue. **Cron schedules**: `process-event-reminders` (every 15 min), `process-post-event-reminders` (hourly), `send-weekly-events-digest` (Monday 7 AM IST), plus existing schedules. **Subpath exports**: `@pi-dash/jobs/enqueue` is a lean entry point (payload types + `enqueue()` only, no handler deps) used by mutators; `@pi-dash/jobs` (barrel) is for server-only code. |
| `packages/observability/` | `src/index.ts` — `withTaskLog()` (retry + evlog for mutator async tasks), `withFireAndForgetLog()` (fire-and-forget with logging) |
| `packages/pdf/` | Server-side PDF generation using @react-pdf/renderer. `src/cash-voucher.tsx` (cash voucher), `src/kalakriti-id-cards.tsx` (four-per-A4 person cards), `src/kalakriti-id-card-layout.ts` (text fitting), `src/generate-kalakriti-id-cards.tsx` (PDF buffer builder), `assets/` (logos, signature). `scripts/preview-kalakriti-id-cards.ts` generates a five-role sample |
| `packages/whatsapp/` | `src/client.ts` (API helpers), `src/groups.ts` (group creation, member management), `src/messaging.ts` (send messages), `src/phone.ts` (number formatting), `src/preferences.ts`, `src/status.ts` |
| `packages/zero/` | `src/queries/` (core dashboard domains plus Kalakriti Editions, Centers, eligibility, Competitions, Guardians, students, entries, assignments, schedules, and audit), `src/mutators/` (core dashboard domains plus Kalakriti Edition configuration, access assignments, registration, schedules, notifications, and audit-producing commands), `src/lib/rrule-utils.ts` (RRULE expansion, parsing, form state conversion, exported as `@pi-dash/zero/rrule-utils`), `src/lib/compute-payment-status.ts`, `src/shared-schemas.ts`, `src/vendor-payment-constants.ts`, `src/permissions.ts`, `src/context.ts`, `vitest.config.ts` |
| `packages/e2e/` | `tests/` (feature specs including the Kalakriti registration and release gates), `pages/` (Page Object Models including Kalakriti Editions, Centers, Students, Competitions, and schedules), `fixtures/` (auth and multi-actor Kalakriti fixtures with console error monitoring), `helpers/` (idempotent seeds and DB-state probes), `global-setup.ts`, `run-e2e.sh` |

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
| `vendor` | `packages/db/src/schema/vendor.ts` |
| `vendorPayment` | `packages/db/src/schema/vendor.ts` |
| `vendorPaymentLineItem` | `packages/db/src/schema/vendor.ts` |
| `vendorPaymentAttachment` | `packages/db/src/schema/vendor.ts` |
| `vendorPaymentHistory` | `packages/db/src/schema/vendor.ts` |
| `vendorPaymentTransaction` | `packages/db/src/schema/vendor-payment-transaction.ts` |
| `vendorPaymentTransactionAttachment` | `packages/db/src/schema/vendor-payment-transaction.ts` |
| `vendorPaymentTransactionHistory` | `packages/db/src/schema/vendor-payment-transaction.ts` |
| `role` | `packages/db/src/schema/permission.ts` |
| `permission` | `packages/db/src/schema/permission.ts` |
| `rolePermission` | `packages/db/src/schema/permission.ts` |
| `appConfig` | `packages/db/src/schema/app-config.ts` |
| `eventFeedback` | `packages/db/src/schema/event-feedback.ts` |
| `eventFeedbackSubmission` | `packages/db/src/schema/event-feedback.ts` |
| `whatsappGroup` | `packages/db/src/schema/whatsapp-group.ts` |
| `eventReminderSent` | `packages/db/src/schema/event-reminder.ts` |
| `scheduledMessage` | `packages/db/src/schema/scheduled-message.ts` |
| `scheduledMessageRecipient` | `packages/db/src/schema/scheduled-message.ts` |
| `auditLog` | `packages/db/src/schema/audit-log.ts` |
| `kalakritiInventoryItem`, `kalakritiInventoryTransaction` | `packages/db/src/schema/kalakriti-inventory.ts` (`0099_conscious_expediter.sql`, `0100_fair_norman_osborn.sql`) |

## Audit Ledger

- `audit_log.view` is granted to `super_admin` by default and may be assigned to custom roles through the existing role permission UI. The API enforces the permission independently of the page guard.
- Zero mutation successes insert their audit row in the mutation transaction. Zero denials and failures use a separate final insert because a thrown mutation rolls back its transaction.
- Non-Zero actions insert `pending` before execution and finalize it once. Initial audit write failure blocks execution; finalization failure after an external effect leaves the row pending and returns an audit-finalization error.
- Audit metadata is an explicit sanitized summary. Raw request values, errors, free text, contact and banking data, file contents, URLs, object keys, IP addresses, and user agents are not persisted.
- Migration `0061_jittery_random.sql` must be applied before deploying the application code. Recording begins at deployment; there is no historical backfill, retention cleanup, or product update/delete path for finalized rows.

## Notifications

- **Package**: `packages/notifications/` — self-owned multi-channel notifications (in-app inbox, email, WhatsApp).
- **Sending**: Notification functions in `src/send/` (reimbursement, advance-payment, vendor-payment, vendor-payment-transaction, user, submission, team, team-event, event-interest, event-update, event-photo, event-feedback, reminders — pre-event, feedback nudge, attendance, photo upload). Triggered server-side from Zero mutators via `ctx.asyncTasks?.push()` or from pg-boss cron handlers.
- **Core**: `src/send-message.ts` provides `sendMessage()` and `sendBulkMessage()` with inbox, email, and WhatsApp channels + idempotency keys. `topic` is required on all sends.
- **Inbox**: `src/inbox.ts` inserts to `notification` DB table (idempotent via unique key). Zero syncs to client in real-time. `NotificationInbox` component in sidebar user menu.
- **Email**: `src/email.ts` sends via nodemailer with `List-Unsubscribe` header. Uses SMTP config from `packages/env`.
- **Topics**: 8 granular topics defined in `src/topics.ts` (ACCOUNT, REQUESTS_SUBMISSIONS, REQUESTS_STATUS, TEAMS, EVENTS_SCHEDULE, EVENTS_INTEREST, EVENTS_PHOTOS, EVENTS_FEEDBACK). `TOPIC_CATALOG` provides metadata (description, group, `requiredPermission`) for the settings UI.
- **Preferences**: Per-topic, per-channel (inbox + email + WhatsApp) toggles stored in `notification_topic_preference` table. Zero mutators (`notificationPreference.upsert`, `notificationPreference.adminUpsert`) handle updates. All preferences checked at send-time from DB. Required topics cannot be disabled (server-side guard). Settings UI filters topics by user permissions via `requiredPermission`.
- **WhatsApp**: Separate `packages/whatsapp/` package handles gateway client, groups, and messaging; requires `WHATSAPP_API_URL` env var to be set.
- **Legacy CDN**: `VITE_CDN_URL` identifies historical media references during migration. Current attachments, event photos, avatars, and editor media use authenticated application routes.
- **Helpers**: `src/helpers.ts` provides `getUserIdsWithPermission`, `getUserName`.
- **Retention**: `cleanup-notifications` pg-boss cron (daily 2 AM IST) deletes archived >90 days, read >180 days.
- DO: Add new notification types in `packages/notifications/src/send/`.
- DO: Register new env vars in `packages/env/src/server.ts`.

## Unit Testing

- **Framework**: Vitest with configs in `apps/web/vitest.config.ts` and `packages/zero/vitest.config.ts`, plus shell regression checks in `packages/e2e/`.
- **Running**: `bun run test:unit` — runs unit tests across all packages via Turborepo.
- **What to test**: Business logic, validation schemas, utility functions, stat computations. Not UI components.
- **Location**: Co-locate test files next to source (e.g., `foo.test.ts` beside `foo.ts`).
- **Existing tests**: Form schemas, stats helpers, validators, attachment links, submission mappers, permissions, shared schemas.

## E2E Testing

- **When to write E2E tests**: Write E2E tests when adding a major feature (new route/page, new CRUD workflow, new role-gated capability). Minor UI tweaks and refactors do not require E2E tests.
- **Location**: All E2E tests live in `packages/e2e/tests/` organized by feature (e.g., `auth/`, `authorization/`, `users/`, `reimbursements/`, `teams/`, `events/`, `roles/`, `dashboard/`, `sidebar/`).
- **Running tests**: `cd packages/e2e && bash run-e2e.sh` starts an isolated, worktree-aware Postgres, seeds data, starts Zero, builds the optimized Nitro app with `NODE_ENV=production`, serves it locally with `NODE_ENV=test`, runs Playwright, then cleans up. Pass test file paths as args for targeted runs (e.g., `bash run-e2e.sh tests/reimbursements/reimbursement-delete.spec.ts`). Set `E2E_SERVER=dev` to use Vite dev instead. Local runs cap the default at four workers; `--workers` overrides it. The runner reports environment-ready, Playwright, and total elapsed times.
- **Kalakriti scale benchmark**: `tests/performance/kalakriti.spec.ts` uses `helpers/seed-kalakriti-performance.ts` in the isolated test database and `helpers/profile-kalakriti-dashboard.ts` for server aggregate timings. Opt in with `KALAKRITI_PERFORMANCE=true`; query plans and row counts are attached to the Playwright report. See `docs/architecture/e2e-testing.md` for the command.
- **App scale benchmark**: `tests/performance/app.spec.ts` uses `helpers/seed-app-performance.ts` for Dashboard, Events and financial query profiling, including populated Event detail updates, photo metadata and feedback under admin and volunteer accounts. Opt in with `APP_PERFORMANCE=true`; both benchmarks share `helpers/zero-performance.ts`.
- **Entry eligibility CPU benchmark**: `apps/web/scripts/profile-entry-eligibility.ts` compares full-list and per-Student indexed eligibility calculations with synthetic data, including index construction. Run with `bun apps/web/scripts/profile-entry-eligibility.ts`; this does not measure browser rendering or Zero hydration.
- **Two-stack experiment**: `bun run packages/e2e/run-two-stacks.ts` snapshots the working sources into two temporary roots, partitions complete spec files using historical durations, then runs independent app/Zero/Postgres stacks with two workers each and no retries or traces. `partition-specs.ts` preserves cross-role file groups; `stack-workspace.ts` isolates auth, build outputs, and writable Nitro/Vite caches. Logs, JSON reports, and the combined elapsed-time summary remain in the printed temporary directory. The ordinary E2E command remains a single stack.
- **Timeout**: Each test has a 45s timeout. Use `test.slow()` (triples to 135s) for multi-step CRUD tests.
- **Projects**: Setup plus seven execution projects — `super_admin`, `admin`, `finance_admin`, `volunteer`, `unoriented_volunteer`, `unauthenticated`, and the one-worker `kalakriti_release_invariants` project for public schedule privacy and singleton live-Edition races. `packages/e2e/project-selection.ts` excludes role-only specs from other role projects while shared multirole specs retain their coverage.
- **Auth state**: The setup project signs in standard users and active Kalakriti actors with the API `request` fixture, then saves `request.storageState()` under `packages/e2e/.auth/`. Each setup actor has a distinct `192.0.2.x` test client IP so setup does not exhaust the normal browser tests' rate-limit bucket if rate limiting is enabled. Feature tests reuse these sessions; the dormant external actor has no saved session.
- **Fixtures**: Import `test` and `expect` from `packages/e2e/fixtures/test.ts` for email fixtures, `kalakritiActors`, and `consoleErrors`. The `page` fixture annotates uncaught browser errors when a test needs a page. API-only tests use `request` without starting a browser page. Use plain `@playwright/test` for unauthenticated tests that do not need the shared fixtures.
- **Page Object Model**: Shared page objects live in `packages/e2e/pages/`. `RequestPage` composes the request list, form, and approval detail objects; Kalakriti page objects cover Edition creation, Centers, students, competitions, entries, and the public schedule. New feature suites should follow the owning domain's existing pattern.
- **API authorization tests**: `tests/authorization/api-authorization.spec.ts` tests that admin-only Zero mutations are rejected for volunteer users via the `request` fixture and the live `/api/zero/mutate` endpoint.
- **Dev seeding**: `scripts/seed.ts` — comprehensive idempotent seed covering all data models. Run via `bun run seed`. Used by worktree setup and general dev.
- **E2E seeding**: `packages/e2e/helpers/seed-test-user.ts` creates standard test data plus the idempotent Kalakriti registration-release fixture, including all active role actors and one dormant external actor.
- **Selectors**: Use accessibility-first selectors (`getByRole`, `getByLabel`, `getByText`). Use `aria-current="date"` via `getByRole("button", { current: "date" })` for calendar today buttons. Avoid CSS class selectors.
- **Env**: Test credentials live in `packages/e2e/.env.test`. Do not commit real credentials.
- DO: Add E2E tests for new major features covering the happy path and key error states.
- DO: Place tests in the appropriate feature subdirectory under `packages/e2e/tests/`.
- DO: Use page objects from `packages/e2e/pages/` for multi-step user flows.
- DO: Test both admin and volunteer perspectives when the feature is role-gated.
- DO NOT: Write E2E tests for trivial UI changes or refactors.
- DO NOT: Place API authorization tests in `tests/auth/` — use `tests/authorization/` to avoid the volunteer project's `testIgnore: /auth\//` filter.

## Key Patterns

### DataTableWrapper

Generic `DataTableWrapper` in `apps/web/src/components/data-table/data-table-wrapper.tsx`. Feature tables are thin wrappers that pass columns, data, and ReUI `filter={{ fields, getValue }}`. ReUI chip filters are the only table filter UI. Search stays `searchFn`. Filter state lives in the `filters` URL param as a `FilterQuery` tree.

Pass **unfiltered** `data` when using `filter`. Server-paginated tables (jobs, audit log, Kalakriti audit) set `applyLocally: false`, persist the same `?filters=` query, and map `is` rules onto existing API params via `readSelectEquality`. `applyLocally: false` omits Convert to advanced because those APIs do not compile OR or extra `is` rules. Do not run `compileFilterQuery` on the current page. Extra toolbar controls such as `DateRangeFilter` still go through `toolbarFilters` beside the chips. Analytics uses `DataTableFiltersBar` with `allowAdvanced={false}` for the same reason.

### Adding a New Table

Every feature table follows the same structure. Use existing tables (reimbursements-table, events/public-events-table) as reference.

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
   Use `defaultColumnPinning` to pin non-reorderable columns (e.g., expand on left, actions/interest on right). For ReUI Filters, pass unfiltered `data` plus:
   ```tsx
   filter={{
     fields: createFooFilterFields(data),
     getValue: getFooFilterValue,
   }}
   ```
   Define `fields` and `getValue` next to the table (see `reimbursement-filters.ts` and `filter-fields.ts`). Do not pre-filter rows in the route. Server-paginated tables must set `applyLocally: false` and omit `getValue`; map equality rules to existing APIs instead.
8. **Route file**: Thin shell — imports the table component, runs Zero queries in `loader`, passes data + callbacks as props.
9. **Delete confirmation**: Localize in a `RowActions` component inside the table file using `useConfirmAction` + `ConfirmDialog`. No dialog state at the table level.

### Navigation Groups

Sidebar nav uses `buildNavGroups()` from `lib/nav-items.ts` to produce grouped nav items by role. `NavMainGrouped` in `components/layout/nav-main.tsx` renders the groups with collapsible sections.

### Post-Login Redirect

Login page accepts `?redirect=/path` search param. Validated before use: must start with `/` and not `//` (open redirect protection). Auth guard redirects to `/login?redirect=<current>` when session is missing.

### Form Fields

TanStack Form fields in `apps/web/src/components/form/`. Each field component accepts a `form` prop and `name`, handles validation display. Use `form-layout` + `form-actions` for consistent structure.

### Zero Queries

Split by domain in `packages/zero/src/queries/`. Each file exports a queries object. Aggregated in `packages/zero/src/queries.ts`. Query patterns: `.one()` for current user, `.all()` for lists, `.related()` for joins.

### Zero Mutators

Split by domain in `packages/zero/src/mutators/`. Each file exports a mutators object. Aggregated in `packages/zero/src/mutators.ts`. Mutators handle auth checks, cascade operations (line items, attachments), audit history, and trigger notifications via `ctx.asyncTasks`.

### Vendor Payment Workflow

Vendors have a two-stage lifecycle: `pending` → `approved`. Any authenticated user can create a vendor (non-admins are server-forced to `pending` status). Payments can be created against approved vendors or the user's own pending vendors. The payment form includes an inline "Add New Vendor" dialog that creates a pending vendor and auto-selects it. When an admin approves a vendor payment, the linked vendor is auto-approved if still pending. Admins can approve or unapprove vendors; unapproval is blocked when the vendor has existing payment requests. The `/vendors` admin route is admin-only via `assertPermission("vendors.view_all")` guard.

**Vendor payments** have their own standalone section at `/vendor-payments` (separate from reimbursements). Status lifecycle: `pending` → `approved` → `partially_paid` → `paid` (or `rejected`). The transition from `approved` to `partially_paid`/`paid` happens automatically when payment transactions are approved.

**Payment transactions** (`vendorPaymentTransaction`) are child records of a vendor payment, each representing an actual money transfer. Transactions have their own approval cycle (`pending` → `approved`/`rejected`). When a transaction is approved, `computePaymentStatus()` in `packages/zero/src/lib/compute-payment-status.ts` recalculates the parent vendor payment status using integer-cents arithmetic to avoid floating-point issues. The `requests.record_payment` permission (granted to volunteers by default) controls who can record transactions; `requests.approve` controls transaction approval. Both the VP submitter and admins can record transactions against approved vendor payments.

Components: `apps/web/src/components/vendor-payments/` — detail, form, table, transaction form dialog, transaction section, types. Mutators/queries: `packages/zero/src/mutators/vendor-payment-transaction.ts`, `packages/zero/src/queries/vendor-payment-transaction.ts`. Export: `apps/web/src/functions/export-vendor-payments-csv.ts`.

### Auth Guard

Routes under `_app` layout are authenticated. Auth middleware at `apps/web/src/middleware/auth.ts`. Server functions use session-based auth checks.

### Design System Imports

```ts
import { Button } from "@pi-dash/design-system/components/ui/button"
import { DataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid"
```

### Design Tokens

Row and page action menus use `ResponsiveActionMenu` from `@/components/shared/responsive-action-menu`. Pass a contextual `title`, the existing button as `trigger`, and one `actions` array containing stable IDs, labels, optional icons, callbacks or link `render` elements, disabled flags, group keys, and destructive flags. The caller owns permissions and confirmation dialogs. Below the shared 768px mobile breakpoint, actions render in a swipe-dismissable Drawer with separate destructive actions and Cancel; desktop retains DropdownMenu semantics. The scoped CSS module owns safe-area spacing and gesture transitions. Selection releases the menu focus trap before invoking callbacks, without delaying browser-activation-dependent actions. Crossing the breakpoint closes the menu. Theme, filter, column, and editor selection controls keep their existing primitives; the account menu retains its desktop notification submenu and opens a separate mobile inbox.

| Token | Usage |
|---|---|
| `--primary` | Interactive elements: buttons, links, focus rings. Darker cyan in light mode. |
| `--brand` / `--brand-foreground` | Decorative brand accent: borders, tints, indicators. Lighter cyan in light mode; converges with `--primary` in dark mode. |
| `font-sans` (`Inter Variable`) | Body text, UI elements, form inputs, table cells. |
| `font-display` (`Geist Variable`) | Page titles (`h1`), stat card values. Apply via `font-display tracking-tight`. |

### Server Functions

Use `createServerFn` from TanStack Start. Located in `apps/web/src/functions/`. Auth-guarded via session checks.

### File Upload Flow

Protected temp subfolders: `attachments`, `approval-screenshots`, `photos`,
`scheduled-messages`. Dedicated avatar/editor signers use `avatars` and
`updates`.

1. Client calls a surface-specific signer. Protected attachment, approval,
   photo, and scheduled-message uploads receive a current-user temp key.
2. Client uploads directly to R2 through the signed PUT URL.
3. The owning Zero mutator validates and copies a protected temp object to a
   parent-scoped durable key before committing the database row.
4. The durable row stores an exact object key or canonical authenticated media
   URL; a raw key is never authorization.
5. Temp-source and replaced-object deletion are queued after commit.
6. Reads use `routes/api/attachments/download.ts`,
   `routes/api/media/event-photo.$id.ts`,
   `routes/api/media/avatar.$userId.ts`, or
   `routes/api/media/event-update.ts`.

Avatar uploads use `getProfilePictureUploadUrl` / `deleteProfilePicture` and
are scoped to `avatars/{userId}/`. Event editor uploads use
`getEventEditorUploadUrl` and require update permission or team-lead
access. Run `r2:migrate-media-urls` in dry-run mode, repair all reported
malformed rows, apply the backfill, and confirm a zero-change/zero-malformed
dry-run before disabling public R2/CDN access.

### Notification Flow

1. Zero mutator performs data change (e.g., approve reimbursement)
2. Mutator pushes async task via `ctx.asyncTasks?.push()` on server
3. `routes/api/zero/mutate.ts` awaits `beforeCommitTasks` inside the transaction, then starts `asyncTasks` as logged fire-and-forget work after commit
4. Notification function in `packages/notifications/src/send/` inserts to DB (inbox) + sends email via nodemailer
5. Client-side inbox synced in real-time via Zero

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
- Client-side logging uses `import { log } from "evlog"` — initialized in `apps/web/src/lib/client-logger.ts` and shipped to `/api/log/ingest`.
- Client-side catch blocks use `log.error({ component, action, ...context, error })` — never `console.error`.
- Zero mutation results use `handleMutationResult()` from `apps/web/src/lib/mutation-result.ts` — logs via evlog + shows toast.

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

- **Audit Log scale benchmark**: `packages/e2e/tests/performance/audit.spec.ts` runs `helpers/profile-audit-performance.ts` with `AUDIT_PERFORMANCE=true`. It seeds 50,000 local-only audit rows, profiles the production builders in `apps/web/src/lib/server/audit-log.ts`, and attaches sanitized PostgreSQL plans and authenticated HTTP timings.

- **Kalakriti Audit scale benchmark**: `packages/e2e/tests/performance/kalakriti-audit.spec.ts` runs `helpers/profile-kalakriti-audit.ts` with `KALAKRITI_AUDIT_PERFORMANCE=true`. It profiles 41,000 local-only rows across two Editions using production scope and snapshot builders. `helpers/postgres-performance.ts` sanitizes PostgreSQL plans for both audit benchmarks.

Kalakriti all-person ID-card export: `apps/web/src/routes/api/kalakriti/$year/id-cards.ts` authorizes administrators, `apps/web/src/lib/server/kalakriti-id-card-data.ts` reads the roster, and `apps/web/src/components/kalakriti/id-card-download-button.tsx` downloads it from the Edition dashboard. `apps/web/src/lib/dev/kalakriti-pdf-assets.ts` embeds PDF fonts and logos into the server build.

Blank ID cards use `packages/pdf/src/generate-blank-kalakriti-id-cards.tsx` and `components/kalakriti/blank-id-card-download-dialog.tsx`. Registration uses `components/kalakriti/register-id-card-dialog.tsx`, `register-volunteer-card-dialog.tsx`, and `functions/kalakriti-blank-id-card.ts` under `apps/web/src/`, reusing attendee creation and volunteer enrollment commands.

### Kalakriti results ownership

`packages/db/src/schema/kalakriti-results.ts` stores results, revisions, scorecards, scoring state, and final declarations. `packages/zero/src/mutators/kalakriti-result.ts` owns audited Live-only commands. `packages/shared/src/kalakriti-results.ts` owns Center ranking and result-role policy. `apps/web/src/functions/kalakriti-results.ts` exposes aggregate-only standings and separately authorized result details; the existing Edition overview and Entries detail routes mount the widgets. Protected scorecard signing and typed downloads follow the existing attachment pipeline.

`packages/e2e/tests/kalakriti/results.spec.ts` uses a dedicated fixture and page object in the serialized Kalakriti release-invariants lane.
