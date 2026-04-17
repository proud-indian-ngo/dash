# Proud Indian Dashboard

A volunteer and admin management dashboard built with a modern TypeScript monorepo stack. Admins can create and manage user accounts, assign roles, ban users, reset passwords, track volunteer orientation, and process financial request workflows (reimbursements and advance payments) — with real-time data sync powered by Rocicorp Zero and self-owned multi-channel notifications (in-app inbox, email, WhatsApp).

> Sign-up is disabled by design. Only admins can create new accounts.

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
- **React Email + Nodemailer** — transactional and notification email
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
| Ban / unban | Ban users with optional reason and expiry |
| Password reset | Admin can reset any user's password |
| Email verification | Verification email sent on account creation |
| Orientation tracking | Track whether a volunteer attended orientation |
| Requests | Unified view for reimbursement and advance payment requests — submit, review, approve/reject with line items and type filter |
| Teams | Organize volunteers into teams with leads; optionally link to WhatsApp groups for automated member syncing |
| Events | Create team events (one-time or recurring), assign members, track attendance per occurrence; public events page for all users |
| Event interest | Volunteers express interest in public events; leads/admins approve or reject; approved volunteers are auto-added as event members with WhatsApp sync |
| Event updates | Leads/admins post rich-text updates (Plate editor with inline images) to events after they start |
| Event photos | Members upload photos to events; leads/admins approve or reject; approved photos sync to Immich for album management |
| Anonymous feedback | Collect anonymous feedback from event participants after events complete, with configurable deadlines and admin visibility |
| File attachments | Upload files to Cloudflare R2; attach URLs to requests |
| Bank accounts | Users manage bank accounts for request payouts |
| Expense categories | Admin-managed categories for request line items |
| Notifications | Self-owned multi-channel notifications (in-app inbox, email, WhatsApp); per-user topic preferences |
| WhatsApp alerts | Optional WhatsApp notifications via self-hosted gateway |
| CSV export | Export data tables to CSV files |
| Settings dialog | Profile, account, banking, expense categories, WhatsApp groups, and notification preferences |
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
│   ├── email/              # React Email templates + Nodemailer transport
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
│       ├── global-setup.ts # Authenticates admin & volunteer sessions
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

### SMTP (email)

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default `587`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender email address |

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
| `VITE_CDN_URL` | CDN base URL for serving uploaded images |

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
| `bun run auth:seed-admin` | Create/promote admin user |
| `bun run ui:add` | Add shadcn/ui components to the design system |

### Unit Testing

| Script | Description |
|---|---|
| `bun run test:unit` | Run unit tests across all packages (Vitest) |

### E2E Testing

| Script | Description |
|---|---|
| `cd packages/e2e && bash run-e2e.sh` | Run full E2E suite (starts test DB, seeds, runs Playwright, cleans up) |
| `cd packages/e2e && bash run-e2e.sh tests/foo.spec.ts` | Run specific test files (paths relative to `packages/e2e/`) |
| `cd packages/e2e && bash run-e2e.sh --ui` | Run E2E tests with Playwright UI mode |
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | Run E2E tests via Turborepo |
| `bun run test:e2e:ui` | Run E2E tests in Playwright UI mode |

The E2E suite uses three Playwright projects:

- **admin** — authenticated as admin, runs all feature tests except auth
- **volunteer** — authenticated as volunteer, runs non-admin feature tests
- **unauthenticated** — runs auth tests (login, forgot password)

Test credentials are in `packages/e2e/.env.test`. The orchestration script (`run-e2e.sh`) handles spinning up a dedicated test PostgreSQL on port 5433, pushing the schema, seeding test data, starting zero-cache, and cleaning up after tests complete.

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
