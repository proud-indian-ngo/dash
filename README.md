# Proud Indian Dashboard

A volunteer and admin management dashboard built with a modern TypeScript monorepo stack. Admins can create and manage user accounts, assign roles, ban users, reset passwords, track volunteer orientation, and process financial request workflows (reimbursements and advance payments) — with real-time data sync powered by Rocicorp Zero and self-owned multi-channel notifications (in-app inbox, email, WhatsApp).

> Volunteers aged 18 or over can self-register at `/register` (email verification required). Admins can also create accounts directly.

## Features

- **TypeScript** — end-to-end type safety across all packages
- **TanStack Start** — SSR framework with file-based routing via TanStack Router
- **TanStack Form** — type-safe form state management with Zod validation
- **TanStack Table** — headless data grid with sorting, filtering, pagination, and column management
- **TailwindCSS v4** — utility-first styling
- **shadcn/ui + reui** — reusable component library
- **Hugeicons** — icon library
- **Better-Auth** — authentication with admin plugin (ban, impersonate, role management)
- **Zero (Rocicorp)** — real-time data sync via PostgreSQL logical replication
- **Drizzle ORM** — TypeScript-first ORM with migrations
- **PostgreSQL** — primary database
- **WhatsApp** — optional self-hosted WhatsApp gateway via go-whatsapp-web-multidevice
- **React Email + Resend** — transactional and notification email
- **Zero-synced inbox** — self-owned in-app notifications with real-time sync
- **Plate** — rich-text editor for event updates (bold, italic, lists, inline images)
- **Cloudflare R2** — S3-compatible object storage for file attachments
- **evlog** — structured wide-event logging (server-side)
- **GitHub Actions** — CI pipeline (type check, lint, unit tests)
- **Vitest** — unit testing for business logic and utilities
- **Turborepo** — optimized monorepo build orchestration
- **Bun** — fast package manager and runtime

## App Capabilities

| Feature | Description |
|---|---|
| Role-based access | `admin` and `volunteer` roles; admin-only pages are guarded |
| User management | Create, edit, delete users (admin only) |
| Responsive action menus | Row and page actions use desktop dropdowns and swipe-dismissable mobile action sheets with separate destructive actions. The mobile account menu opens Notifications in its own view. |
| Ban / unban | Ban users with optional reason and expiry |
| Password reset | Admin can reset any user's password |
| Email verification | Verification email sent on account creation |
| Orientation tracking | Track whether a volunteer attended orientation |
| Requests | Unified view for reimbursement and advance payment requests — submit, review, approve/reject with line items and type filter |
| Claim for others | Finance (`requests.create_for_others`) files a reimbursement for someone else, paid to one of their saved bank accounts, and can change the claimant later with a reason; the claimant owns it, is notified and is named on the voucher |
| Charged to | Every reimbursement and vendor payment says which work it served: an event, a programme or project without an event, or the organisation (admin). Finance can change it at approval or later; the Programme column and filter show "Admin" and an "Unallocated" count for legacy requests |
| Teams | Organize volunteers into teams with leads; optionally link to WhatsApp groups for automated member syncing |
| Events | Create team events (one-time or recurring), assign members, track attendance per occurrence; public events page for all users |
| Kalakriti Editions | Run production-gated yearly registration workspaces with Edition-scoped access, persistent external identities, Center quotas and controls, student and competition-entry registration, public schedules, assignment-scoped dashboards and ZIP exports, and administrator or assigned-Lead audit trails. Volunteer enrollment automatically promotes unoriented volunteers without changing admin or custom roles; see the [orientation policy](docs/architecture/kalakriti-registration.md#identity-and-access). |
| Kalakriti dashboards | Scan phase-aware pending work and scoped participation, staffing, meal, transport, inventory and attendance summaries. Work pages add actionable counts, completion visuals, mobile row context and clearable filters; public schedules filter by Venue, Age Category and Category. |
| Kalakriti Students | Browse Students across all authorized Centers with a Center column and filter. Registration and row actions retain their actual Center's permissions and quota rules. |
| Kalakriti Entry music | Optionally attach up to two MP3, M4A, or AAC files per Entry (20 MB each), with per-file retries, staged Save/Cancel, and protected playback/download. Scoped music editing remains available after registration closes; files stay out of public schedules and exports. |
| Kalakriti competition workspace | One row per Competition with scoped Entries and Division schedules; add/edit/cancel in place and set Venue/time in the editor. Settings groups Edition details, participation rules, Categories, Venues and Eligibility. |
| Kalakriti Guests and Judges | Manage Edition-bound non-login attendees with required name/phone and optional email. Assign judges to multiple competitions; Overall Events Leads can add, edit, assign, and delete Judges (deletion is blocked after check-in or meal history), while other Event Heads have scoped read access and Volunteer Coordinators can view both rosters. Guests and judges use QR/yearly-ID check-in before breakfast or lunch. |
| Kalakriti ID cards | Global and Edition admins download current-person cards or choose page counts of blank Volunteer, Guest, and Judge cards, four per A4 page. Blank cards have unique QR codes and write-in name lines; scan-to-register links them to new people. Creating central volunteers also requires user-creation permission. |
| Kalakriti detail sheets | View stable yearly IDs for Students, Volunteers, and Guardians, alongside responsibilities, Centers, and competition entries. Every authorized sheet viewer sees a QR containing the person's existing identifier, with no issuance step or separate Credentials page. |
| Kalakriti operation ledger | Record authorized live-Edition operations from JSON person identifiers or yearly IDs, with idempotent retries, scoped staff permissions, and Student/Entry deletion guards. |
| Kalakriti Go live | Configuration administrators can move a registration-locked Edition to Live after readiness checks for configuration, active Leads, closed Center controls, and transport coverage. Only one Edition may be Live; QR issuance is never a prerequisite. |
| Kalakriti Center editing | Center rows open a detail sheet with basic information, registration, scoped assignments, and transport; individual Center pages are removed. The action menu opens a shared editor for basic fields, registration controls, and Guardian/Liaison assignments. Authorized administrators can edit name, location, and Google Maps fields in any Edition status; operational controls retain their existing restrictions. |
| Kalakriti Center transport | The Transport page lists one row per vehicle, including Centers without assignments. Transport Leads and administrators edit vehicles, drivers, and per-vehicle pickup times there; Center records own location and Google Maps links. Finalized Center scan stages determine status; Guardians and Center Liaisons have scoped read-only access. |
| Kalakriti Inventory | Track Edition-owned items, optional photos, current stock, and estimated INR value. Logistics staff and administrators record purchases and counted-stock adjustments, and scan volunteers for multi-item dispatches and standalone returns; immutable Transactions preserve each balance change. |
| Kalakriti Food | A scoped roster shows eligible Students, Volunteers, Guardians, Guests, and Judges, with filters for every column and colored meal-status icons. Breakfast/lunch totals retain served history; admins and Food Leads can undo meal marks without deleting history. Volunteers also show check-in status in their roster. |
| Kalakriti Entries | The Entries directory spans all authorized Centers. Event details show Present from venue-arrival scans, Attended from session attendance, and filters for displayed data fields. |
| Kalakriti Results | Scoped event staff upload judge scorecards and publish attended Entry awards. The dashboard shows live Center points; Events Leads/admins finalize or reopen overall winner and runner-up declarations. |
| Kalakriti Awards | Awards Leads, Awards Members, and administrators track published prizes per Student or whole group, with partial completion, undo, and safeguards against changing handed-over awards. |
| Kalakriti Scan | Role-aware sidebar tabs cover Center transport, volunteer/guest/judge check-in, meals, and Competition attendance. Pickup allows absentees; later transport stages require every traveler. Meals require Student pickup, volunteer/guest/judge check-in, or active Guardian registration; Competition attendance requires pickup and a valid session. Students and Centers show transport status in their tables. |
| Event interest | Volunteers express interest in public events; leads/admins approve or reject; approved volunteers are auto-added as event members with WhatsApp sync |
| Public events feed | `GET /api/public/events` serves upcoming public sessions to proudindian.ngo and any other site or agent (CORS `*`, 60 requests a minute per IP; recurring series expanded, admin-set coarse "Public area" instead of the location, no personal data). Its OpenAPI description is at `/api/public/openapi.json`, listed in proudindian.ngo's `/.well-known/api-catalog`. Its `signUpUrl` (`/register?interestEventId=[&occDate=]`) shows the session on the register page, files a pending per-session interest once the email is verified, and lands existing volunteers on the event. Kalakriti events are not listed |
| Event updates | Leads/admins post rich-text updates (Plate editor with inline images) to events after they start |
| Event photos | Members upload photos to events; leads/admins approve or reject; approved photos sync to Immich for album management |
| Anonymous feedback | Collect anonymous feedback from event participants after events complete, with configurable deadlines and admin visibility |
| File attachments | Upload files to Cloudflare R2; authorize reads against persisted request, avatar, event, or message records |
| Bank accounts | Users manage bank accounts for request payouts |
| Donors | Directory of donors, sponsors, grantors and intermediaries; contact and ID details stay server-side and identifiers are encrypted |
| Income | Manually recorded contributions (donor, sponsor, grantor or intermediary, channel, Form 113 reporting mode and donation type, deposit account, programme and project) and other income such as interest, with this year's totals, a "Missing donor details" count and each donor's giving history; contributions can also be imported from a CSV file in four steps (upload, map columns, review, import), from give.do exports (matched column for column, recorded through GiveIndia as the intermediary, non-INR rows refused) or any spreadsheet, with re-uploads recognised by donation ID, missing details of accepted existing donors filled without overwriting, and an Imports tab listing each file's outcome; Razorpay Payment Page donations arrive by webhook and are recorded automatically, with contact-only matches held for review and counted as waiting (Imports tab, Settings → Integrations); their refunds are applied as they happen (refunded, or "Partly refunded" with the refunds on the contribution), a reconcile every 6 hours catches missed webhooks, past payments are imported from Settings → Integrations, Razorpay's payouts to the bank are recorded with the payments they covered (Income → Settlements, with what is still awaiting settlement), and bank statements are imported from CSV and matched to settlements, donations and give.do payouts (Bank statements, `finance.view`), with unknown credits recorded as donations from the line; give.do payout workbooks can be imported from Settlements with per-donation fee evidence and optional import of unknown gifts, and finance users can filter contributions by "Reached bank"; staging records only, before receipts and postings |
| Donations return | Filing readiness for Form 113 (formerly 10BD) at `/income/return`: what blocks each gift (missing ID, name or address with PIN code, an ID that doesn't look valid, a donation platform recorded as the donor), what is waiting or excluded (donors who don't want a tax certificate, excluded gifts, cash above ₹2,000, in kind, refunded, foreign currency) partly refunded gifts and CSR gifts for the CA to decide on, with an upload file in the portal's column order and an "All gifts" file for the CA (both need `finance.view_sensitive`; audited); the 80G registration lives in Settings → Organisation accounts |
| Donation receipts | Numbered receipts (`PI/2026-27/0001`, one gap-free series a year) for direct gifts (UPI, NEFT/IMPS, cheque) from 1 April 2026, issued one at a time or in bulk after a review of what is blocked and why, downloaded as a PDF with the 80G line, emailed to the donor on request, and voided with a reason while keeping the number; Razorpay and give.do gifts are receipted by the gateway (Income → Receipts, `donors.receipt`) |
| Books | The trust's ledger from 1 April 2026 at Finance → Books: each account's balance and cash book by month with a running balance, income and expenditure by account head or programme, and a balance summary that checks assets against funds and liabilities; a finance admin enters the CA-confirmed opening balances once (corrected only by reversal), and closes the financial year after it ends with a checklist, or reopens it with a reason; contributions, refunds, other income, gateway payouts and transfers between own accounts post automatically (gross gifts, gateway fees as expense, payouts as transfers out of clearing, edits as reversal and repost), with a daily backfill, a "Waiting to post" list with reasons and "Post pending"; each line links back to its record; posted entries are append-only; the CA handoff workbook (XLSX: receipts and payments, income and expenditure with a summary, balance sheet items, Form 113 donor list) downloads from the page menu |
| Organisation accounts | The trust's bank, cash and gateway clearing accounts that income is deposited into, with fund source and FCRA role, and the 80G registration the donations return carries, managed in Settings |
| Programmes | Cause-based programmes with a lead and a finance-approval threshold; the first piece of the finance redesign (`docs/architecture/finance-and-programmes.md`) |
| Expense categories | Admin-managed categories for request line items |
| Notifications | Self-owned multi-channel notifications (in-app inbox, email, WhatsApp); per-user topic preferences; email and WhatsApp batched over 5 minutes into one digest per person and topic |
| Audit log | Immutable user-action history with server-side filters and a viewer restricted by the `audit_log.view` permission |
| WhatsApp alerts | Optional WhatsApp notifications via self-hosted gateway |
| CSV export | Export data tables to CSV files |
| Settings | One page (`/settings`) with your profile, account, notifications and bank accounts, and, by permission, general settings, roles, expense categories, WhatsApp groups, API tokens and maintenance jobs |
| Theming | Light/dark mode toggle with system preference detection |
| Real-time sync | All data tables update live via Zero sync |

## Project Structure

```
pi-dash/
├── apps/
│   └── web/                # Full-stack app (React + TanStack Start)
│       └── src/
│           ├── routes/     # File-based routes (_app, _auth, api)
│           ├── components/ # Feature and layout components
│           ├── functions/  # Server functions (auth-guarded RPC)
│           ├── hooks/      # Custom React hooks
│           ├── lib/        # Shared utilities
│           └── middleware/  # Auth middleware
├── packages/
│   ├── auth/               # Better-Auth config & admin seed script
│   ├── db/                 # Drizzle schema, migrations, Docker Compose
│   ├── email/              # React Email templates + Resend transport
│   ├── env/                # Zod-validated env contracts (server + web)
│   ├── config/             # Shared TypeScript & tooling config
│   ├── design-system/      # shadcn/ui + reui components, theme provider
│   ├── notifications/      # Multi-channel notification sending (inbox, email, WhatsApp)
│   ├── observability/      # Structured logging helpers (withTaskLog, withFireAndForgetLog)
│   ├── whatsapp/           # WhatsApp gateway client, groups, messaging
│   ├── zero/               # Rocicorp Zero schema, queries, mutators
│   └── e2e/                # Playwright E2E tests
│       ├── fixtures/       # Custom test fixtures (auth emails)
│       ├── helpers/        # Seed scripts (test users, categories)
│       ├── tests/          # Test specs organized by feature
│       ├── global-setup.ts # Authenticates shared roles and active Kalakriti actors
│       ├── playwright.config.ts
│       └── run-e2e.sh      # Full-stack test orchestration script
├── ARCHITECTURE.md         # Stub → docs/architecture/ (sharded chapters, on-demand)
├── docs/architecture/      # System architecture chapters (data-layer, auth, ...)
├── DEPLOYMENT.md           # Production deployment guide
├── biome.jsonc             # Biome linter config (via ultracite)
├── .env.sample             # Environment variable template
└── turbo.json              # Task orchestration
```

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.sample .env
```

Edit `.env` and fill in the required values (see [Environment Variables](#environment-variables) below).

### 3. Start PostgreSQL

```bash
bun run db:start
```

This starts the Dockerized PostgreSQL instance required for both the app and Zero.

### 4. Initialize the database

```bash
bun run db:generate
bun run db:push
```

### 5. Generate Zero schema

```bash
bun run zero:generate
```

### 6. Create the first admin (optional)

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then:

```bash
bun run auth:seed-admin
```

The script is idempotent — it creates the user if missing and ensures the role is `admin`.

### 7. Start the dev server

```bash
bun run dev
```

| Service | URL |
|---|---|
| Web app | http://localhost:3001 |
| Zero cache | http://localhost:4848 |
| Drizzle Studio | http://localhost:5555 |

## Environment Variables

Copy `.env.sample` to `.env`. Required variables:

### Server

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `ZERO_UPSTREAM_DB` | PostgreSQL connection string (unpooled, for Zero logical replication) |
| `BETTER_AUTH_SECRET` | Session encryption secret (min 32 chars) |
| `BETTER_AUTH_URL` | Auth base URL (e.g. `http://localhost:3001`) |
| `CORS_ORIGIN` | Allowed CORS origin |
| `GRAVATAR_API_KEY` | Bearer token for Gravatar REST profile requests |
| `AVATAR_FALLBACK_SEED` | Static seed namespace used for DiceBear fallback avatars |
| `ZERO_ADMIN_PASSWORD` | Zero admin authentication password |
| `ZERO_MUTATE_URL` | Zero mutate endpoint URL |
| `ZERO_QUERY_URL` | Zero query endpoint URL |

### Email (Resend)

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key with sending access (required in production; unset skips sending) |
| `EMAIL_FROM` | Sender on a domain verified in Resend, bare or as `Name <address>` (required in production) |
| `RESEND_WEBHOOK_SECRET` | Signing secret (`whsec_…`) of the Resend webhook that reports bounces and spam complaints; unset disables `/api/email/webhook` |

In development both can be left empty: emails are skipped with an `email_not_configured` warning, and verification and password-reset links are logged (`auth_email_not_sent`) so local sign-up still works. To test real delivery, use a separate dev API key and send to `delivered@resend.dev`.

### Cloudflare R2 (file storage)

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_KEY_PREFIX` | Key prefix for uploaded assets |

### WhatsApp (optional)

| Variable | Description |
|---|---|
| `WHATSAPP_API_URL` | WhatsApp gateway URL (e.g. `http://localhost:3100`); leave blank to disable |
| `WHATSAPP_AUTH_USER` | WhatsApp gateway basic auth username (default `admin`) |
| `WHATSAPP_AUTH_PASS` | WhatsApp gateway basic auth password (default `admin`) |

### Development only

| Variable | Description |
|---|---|
| `DEV_DB_HOST` | PostgreSQL URL for local Docker instance (e.g. `localhost:5432`) |
| `DEV_DB_PASSWORD` | Password for the local PostgreSQL instance |
| `ZERO_LOG_LEVEL` | Zero cache log level (default `debug`) |
| `ZERO_REPLICA_FILE` | Path for Zero's local SQLite replica |

### Client (Vite)

| Variable | Description |
|---|---|
| `VITE_ZERO_URL` | Zero cache server URL (e.g. `http://localhost:4848`) |
| `VITE_CDN_URL` | Historical CDN base URL used to recognize legacy media references; current R2 media reads use authenticated routes |

### Immich (optional photo management)

| Variable | Description |
|---|---|
| `IMMICH_API_KEY` | Immich API key for album and asset management |
| `VITE_IMMICH_URL` | Public Immich URL for album links shown in the UI (e.g. `https://photos.example.com`); leave blank to disable |

### Optional

| Variable | Description |
|---|---|
| `ADMIN_EMAIL` | Email for `auth:seed-admin` |
| `ADMIN_PASSWORD` | Password for `auth:seed-admin` |
| `COOKIE_DOMAIN` | For cross-subdomain cookies in production |
| `GRAVATAR_API_BASE_URL` | Override Gravatar REST base URL (defaults to `https://api.gravatar.com/v3`) |
| `GRAVATAR_TIMEOUT_MS` | Timeout in milliseconds for Gravatar profile requests (default `5000`) |
| `APP_URL` | App URL shown in notification footers (e.g. `https://dash.proudindian.ngo`) |
| `WEBSITE_DISPATCH_TOKEN` | Fine-grained GitHub token for `proud-indian-ngo/website` (Contents: read and write); when set, a 5-minute job sends the website's `events-changed` dispatch whenever the public events feed changes |

## Available Scripts

### Development

| Script | Description |
|---|---|
| `bun run dev` | Start all services |
| `bun run dev:web` | Start web app only |

### Database

| Script | Description |
|---|---|
| `bun run db:start` | Start PostgreSQL container |
| `bun run db:stop` | Stop PostgreSQL container |
| `bun run db:down` | Tear down container and volume |
| `bun run db:watch` | Start PostgreSQL in foreground |
| `bun run db:push` | Push schema changes to database |
| `bun run db:generate` | Generate types from migrations |
| `bun run db:migrate` | Run pending migrations |
| `bun run db:studio` | Open Drizzle Studio UI |

### WhatsApp (optional)

| Script | Description |
|---|---|
| `bun run whatsapp:start` | Start self-hosted WhatsApp gateway container |
| `bun run whatsapp:stop` | Stop WhatsApp gateway container |

### Code generation & auth

| Script | Description |
|---|---|
| `bun run zero:generate` | Regenerate Zero schema from Drizzle schema |
| `bun run zero:analyze` | Analyze configured Zero named queries against a Zero cache |
| `bun run auth:seed-admin` | Create/promote admin user |
| `bun run ui:add` | Add shadcn/ui components to the design system |

### Unit Testing

| Script | Description |
|---|---|
| `bun run test:unit` | Run unit tests across all packages (Vitest and E2E shell checks) |

### E2E Testing

| Script | Description |
|---|---|
| `cd packages/e2e && bash run-e2e.sh` | Run full E2E suite (starts test DB, seeds, runs Playwright, cleans up) |
| `cd packages/e2e && bash run-e2e.sh tests/foo.spec.ts` | Run specific test files (paths relative to `packages/e2e/`) |
| `E2E_SERVER=dev bash packages/e2e/run-e2e.sh tests/foo.spec.ts` | Run a focused test against Vite without a production build |
| `cd packages/e2e && bash run-e2e.sh --ui` | Run E2E tests with Playwright UI mode |
| `bash packages/e2e/run-e2e.sh --list` | List selected tests without starting services |
| `bun run packages/e2e/run-two-stacks.ts` | Benchmark two isolated stacks with two workers each, tracing off, and no retries |
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | Run E2E tests via Turborepo |
| `bun run test:e2e:ui` | Run E2E tests in Playwright UI mode |

The E2E suite uses setup plus seven browser projects:

- **super_admin**, **admin**, and **finance_admin** — authenticated administrative perspectives
- **volunteer** and **unoriented_volunteer** — authenticated volunteer perspectives with different access
- **unauthenticated** — login and password recovery coverage
- **kalakriti_release_invariants** — public schedule privacy and singleton live-Edition races, serialized through one worker

Global setup saves authenticated API storage state for every shared role and active Kalakriti actor. Test credentials are in `packages/e2e/.env.test`. The orchestration script (`run-e2e.sh`) starts a dedicated worktree-aware PostgreSQL, migrates and seeds it, starts Zero, and serves a fresh optimized build with `NODE_ENV=test`. Interactive UI/debug mode uses Vite so app edits remain visible. Every run tears down its database and services on exit and reports setup, test, and total elapsed time.

Role-only specs are selected before execution in `packages/e2e/project-selection.ts`; shared multirole coverage remains intact.

### Build & quality

| Script | Description |
|---|---|
| `bun run build` | Build all apps |
| `bun run check:types` | TypeScript type check across all packages |
| `bun run check` | Run linter (ultracite/Biome) |
| `bun run fix` | Auto-fix linter issues (ultracite/Biome) |
| `bun run check:unused` | Find unused exports (knip) |
| `bun run analyze` | Bundle analysis (web app) |
| `bun run check:updates` | Check for package updates |
| `bun run ruler:apply` | Apply Ruler config |
