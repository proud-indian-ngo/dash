# Deployment

## Prerequisites

| Requirement | Version |
|---|---|
| Bun | `>=1.3.11` (see `packageManager` in `package.json`) |
| Node.js | `>=20` (for zero-cache and build tools) |
| PostgreSQL | `>=14` with `wal_level=logical` |
| Docker | For local Postgres and WhatsApp gateway |

External services (optional based on features):

- **Courier** — notifications (inbox, email)
- **Cloudflare R2** — file storage
- **SMTP server** — transactional email (verification, password reset)
- **Immich** — photo album management
- **WhatsApp gateway** — self-hosted `go-whatsapp-web-multidevice`

## Environment Variables

Copy `.env.sample` to `.env` and fill in values. Grouped by category:

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `ZERO_UPSTREAM_DB` | PostgreSQL connection string (unpooled, for WAL replication) |
| `BETTER_AUTH_SECRET` | Session encryption secret (min 32 chars) |
| `BETTER_AUTH_URL` | Auth base URL (e.g., `https://dash.example.com`) |
| `CORS_ORIGIN` | Allowed CORS origin (usually same as `BETTER_AUTH_URL`) |
| `ZERO_ADMIN_PASSWORD` | Zero cache admin password |
| `ZERO_MUTATE_URL` | Zero mutate endpoint (e.g., `https://dash.example.com/api/zero/mutate`) |
| `ZERO_QUERY_URL` | Zero query endpoint (e.g., `https://dash.example.com/api/zero/query`) |
| `VITE_ZERO_URL` | Public URL for zero-cache (e.g., `https://zero.example.com`) |

### SMTP

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default `587`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender email address |

### Storage (Cloudflare R2)

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_KEY_PREFIX` | Key prefix for uploads |
| `VITE_CDN_URL` | Public CDN URL for serving uploaded files |

### Voucher Organization

| Variable | Description |
|---|---|
| `VOUCHER_ORG_NAME` | Organization name on vouchers (required for voucher generation) |
| `VOUCHER_ORG_ADDRESS` | Organization address |
| `VOUCHER_ORG_PHONE` | Organization phone |
| `VOUCHER_ORG_EMAIL` | Organization email |
| `VOUCHER_ORG_REGISTRATION` | Organization registration number |

Files required: `packages/pdf/assets/logo.png` and `packages/pdf/assets/signature.png` for voucher PDFs to include logo and signature.

### Optional

| Variable | Description |
|---|---|
| `COURIER_API_KEY` | Courier API key (notifications) |
| `WHATSAPP_API_URL` | WhatsApp gateway URL; blank to disable |
| `WHATSAPP_AUTH_USER` / `WHATSAPP_AUTH_PASS` | Gateway basic auth (default `admin`/`admin`) |
| `IMMICH_API_KEY` | Immich API key |
| `VITE_IMMICH_URL` | Public Immich URL; blank to disable |
| `GRAVATAR_API_KEY` | Gravatar REST API key |
| `AVATAR_FALLBACK_SEED` | DiceBear fallback seed |
| `COOKIE_DOMAIN` | Cross-subdomain cookie domain (production) |
| `APP_URL` | App URL shown in notification footers |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | For `auth:seed-admin` script |

### Zero Cache Process

These are consumed directly by the `zero-cache` binary:

| Variable | Description |
|---|---|
| `ZERO_UPSTREAM_DB` | Postgres connection (unpooled, WAL access) |
| `ZERO_ADMIN_PASSWORD` | Admin auth |
| `ZERO_MUTATE_URL` | Forwarded mutate endpoint |
| `ZERO_QUERY_URL` | Forwarded query endpoint |
| `ZERO_MUTATE_FORWARD_COOKIES` | `true` — forwards session cookies to mutate endpoint |
| `ZERO_QUERY_FORWARD_COOKIES` | `true` — forwards session cookies to query endpoint |
| `ZERO_LOG_LEVEL` | Log level (default `debug`) |
| `ZERO_REPLICA_FILE` | Path for local SQLite replica |

## Database Setup

### 1. PostgreSQL

PostgreSQL must run with `wal_level=logical` for Zero replication.

**Local (Docker):**

```bash
bun run db:start
```

This starts the container defined in `packages/db/docker-compose.yml` with `wal_level=logical` already configured.

**Production:** Ensure your managed Postgres instance has `wal_level=logical` enabled. Use an unpooled connection string for `ZERO_UPSTREAM_DB`.

### 2. Generate Drizzle types and apply schema

```bash
bun run db:generate    # Generate migration SQL from Drizzle schema
bun run db:migrate     # Apply pending migrations (dev and production)
bun run db:push        # Alternative: push schema directly (local dev only)
```

**Schema change workflow:**
1. Edit Drizzle schema in `packages/db/src/schema/`
2. `bun run db:generate` — creates a new migration SQL file
3. `bun run db:migrate` — applies the migration

**Zero compatibility:** Follow the expand/migrate/contract pattern for schema changes:
1. **Expand** — additive migration (new columns/tables, with defaults)
2. **Deploy** — release updated app code
3. **Contract** — after a grace period, drop old columns in a separate deployment

Always update DB schema before deploying the app. The Docker compose dependency chain handles this automatically.

### 3. Generate Zero schema

```bash
bun run zero:generate  # Generates packages/zero/src/schema.ts from Drizzle schema
```

### 4. Seed admin user

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then:

```bash
bun run auth:seed-admin
```

Idempotent — creates user if missing, ensures `admin` role.

## Build

```bash
bun install
bun run build
```

Output: `apps/web/dist/`.

## Running in Production

### Web App (TanStack Start)

The built app is a Node.js server:

```bash
node apps/web/dist/server/index.mjs
```

Runs on port 3001 by default.

### Zero Cache

The `zero-cache` process runs separately, connecting to Postgres via logical replication and serving WebSocket connections to clients:

```bash
# Ensure all ZERO_* env vars are set
npx zero-cache
```

Default port: 4848. Clients connect via `VITE_ZERO_URL`.

### WhatsApp Gateway (optional)

```bash
bun run whatsapp:start
```

Starts `go-whatsapp-web-multidevice` container on port 3100. Pair via QR code at `http://localhost:3100`.

## Production Checklist

- [ ] PostgreSQL running with `wal_level=logical`
- [ ] All required env vars set (see tables above)
- [ ] Database schema pushed: `bun run db:migrate`
- [ ] Zero schema generated: `bun run zero:generate`
- [ ] Admin user seeded: `bun run auth:seed-admin`
- [ ] App built: `bun run build`
- [ ] Web app process running
- [ ] `zero-cache` process running with `ZERO_UPSTREAM_DB` (unpooled connection)
- [ ] `ZERO_MUTATE_URL` and `ZERO_QUERY_URL` point to the web app's API routes
- [ ] `VITE_ZERO_URL` is publicly accessible (clients connect directly)
- [ ] `CORS_ORIGIN` and `BETTER_AUTH_URL` match your production domain
- [ ] `COOKIE_DOMAIN` set if using cross-subdomain cookies
- [ ] SMTP configured for email verification and password reset
- [ ] R2 bucket created and credentials set
- [ ] `VITE_CDN_URL` points to your R2 public access or CDN
- [ ] Courier workspace configured (if using notifications)
- [ ] WhatsApp gateway running and paired (if using WhatsApp alerts)
- [ ] Immich server accessible (if using photo management)

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push:

- `bun run check:types` — TypeScript type check
- `bun run check` — Biome linter
- `bun run test:unit` — Vitest unit tests

Pre-commit hook (lefthook) runs type check, linting, unit tests, and unused-exports check in parallel.
