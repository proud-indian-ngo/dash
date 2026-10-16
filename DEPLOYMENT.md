# Deployment

## Prerequisites

| Requirement | Version |
|---|---|
| Bun | `>=1.3.11` (see `packageManager` in `package.json`) |
| Node.js | `>=20` (for zero-cache and build tools) |
| PostgreSQL | `>=17` with `wal_level=logical`; Compose and production use 18 |
| Docker | For local Postgres and WhatsApp gateway |

External services (optional based on features):

- **Cloudflare R2** — file storage
- **Resend** — transactional email (verification, password reset, notifications)
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
| `DATA_ENCRYPTION_KEY` | Base64 of 32 random bytes (`openssl rand -base64 32`); encrypts finance-private fields such as donor ID numbers. Required in production and passed to the `web` service by `docker-compose.prod.yml`. Rotating it requires re-encrypting stored values. Run every script that writes encrypted values with this same key |
| `BETTER_AUTH_URL` | Auth base URL (e.g., `https://dash.example.com`). Also the base of the public events feed's `signUpUrl`; the proudindian.ngo website only accepts links starting with `https://dash.proudindian.ngo/`, so production must use exactly that origin |
| `CORS_ORIGIN` | Allowed CORS origin (usually same as `BETTER_AUTH_URL`) |
| `ZERO_ADMIN_PASSWORD` | Zero cache admin password |
| `ZERO_MUTATE_URL` | Zero mutate endpoint (e.g., `https://dash.example.com/api/zero/mutate`) |
| `ZERO_QUERY_URL` | Zero query endpoint (e.g., `https://dash.example.com/api/zero/query`) |
| `VITE_ZERO_URL` | Public URL for zero-cache (e.g., `https://zero.example.com`) |

### Email (Resend)

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key with sending access (required in production; unset skips sending) |
| `EMAIL_FROM` | Sender on a domain verified in Resend, bare or as `Name <address>` (required in production) |
| `RESEND_WEBHOOK_SECRET` | Signing secret (`whsec_…`) of the Resend webhook that reports bounces and spam complaints; unset disables `/api/email/webhook` |

Sends are spaced to stay under Resend's default 5 requests per second and rate-limited sends are retried; bulk notifications go through Resend's batch endpoint, and notification emails carry idempotency keys so job retries don't send twice.

**Bounce and complaint webhook:** in Resend, add a webhook to `https://<app-host>/api/email/webhook` subscribed to `email.bounced` and `email.complained`, and set its signing secret as `RESEND_WEBHOOK_SECRET`. Hard-bounced and spam-reporting addresses stop getting notification email; an admin can resume it from the user's sheet.

**Migrating from SMTP:** verify the sending domain in Resend (add its SPF and DKIM DNS records), create an API key with sending access, set `RESEND_API_KEY` and `EMAIL_FROM` (replacing the old `SMTP_FROM`), and remove `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`. The app refuses to start in production until both new variables are set.

### Storage (Cloudflare R2)

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_KEY_PREFIX` | Key prefix for uploads |
| `VITE_CDN_URL` | Historical public CDN URL used to recognize legacy R2 media references |

Protected uploads use current-user temp keys and are claimed to durable keys by
their owning database mutation. Before deployment, configure 24-hour Cloudflare
R2 expiry rules for
`<R2_KEY_PREFIX>/{attachments,approval-screenshots,kalakriti-inventory,kalakriti-music,kalakriti-scorecards,photos,scheduled-messages}/tmp/`.

Private-storage cutover order:

1. Configure the protected temp-key lifecycle rules.
2. Deploy authenticated reads and transactional claims.
3. Backfill stored media references to canonical app URLs (done in production
   with a one-off script, now in git history).
4. Verify request attachments, approval proofs, scheduled media, event photos,
   avatars, and event editor media through authenticated application routes.
5. Disable the R2 public development URL and public CDN route.
6. In a follow-up, deploy code that removes `VITE_CDN_URL` usage and its schema
   requirement while the variable is still configured. Remove the runtime
   variable only after that deployment succeeds.

Do not remove `VITE_CDN_URL` before the backfill and public-access cutover;
legacy rows still use it for canonicalization during migration.

### Kalakriti two-file music cutover

This release requires the generated `0079_mighty_kronos.sql` and
`0080_gray_punisher.sql` migrations before the matching app and Zero schema run.
Quiesce writes and stop old application instances, apply migrations with
`bun run db:migrate`, then run the
[Entry music backfill](docs/architecture/kalakriti-registration.md#entry-music-migration)
in dry-run, apply, and final dry-run modes. Repair every reported malformed row;
resume traffic only when no legacy candidates or malformed rows remain.

The backfill preserves object keys and bytes in place, then clears singleton
metadata atomically after inserting each child. Keep the music temporary-object
expiry rule above and deploy the app and Zero schema together. Do not roll back
to singleton-only code after enabling two-file writes without an explicit data
conversion; it cannot represent both files.

### Voucher Organization

| Variable | Description |
|---|---|
| `VOUCHER_ORG_NAME` | Organization name on vouchers (required for voucher generation) |
| `VOUCHER_ORG_ADDRESS` | Organization address |
| `VOUCHER_ORG_PHONE` | Organization phone |
| `VOUCHER_ORG_EMAIL` | Organization email |
| `VOUCHER_ORG_REGISTRATION` | Organization registration number |

The treasurer signature (`packages/pdf/assets/signature.png`) is embedded in the server bundle at build time. The cash-voucher limit is a setting (Settings → Programmes), not an environment variable.

### Optional

| Variable | Description |
|---|---|
| `APP_NAME` | App display name (default `Proud Indian Dashboard`) |
| `WHATSAPP_API_URL` | WhatsApp gateway URL; blank to disable |
| `WHATSAPP_AUTH_USER` / `WHATSAPP_AUTH_PASS` | Gateway basic auth (default `admin`/`admin`) |
| `WHATSAPP_WEBHOOK_SECRET` | **Required** — secret for WhatsApp webhook validation |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Meta system user token (expiry **Never**, permissions `whatsapp_business_messaging` and `whatsapp_business_management`). With the phone number ID set, messages to people go through the official Cloud API as templates; blank keeps everything on the gateway |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Phone number ID from the app's WhatsApp → API Setup page (not the number itself) |
| `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID (not the business portfolio ID); used to read template categories and by `bun run whatsapp:templates` |
| `WHATSAPP_CLOUD_APP_SECRET` | App secret (App settings → Basic); verifies `/api/whatsapp/cloud/webhook`, blank disables it |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | Any random string; enter the same value as the webhook's verify token in the app's WhatsApp → Configuration page |
| `WHATSAPP_CLOUD_GRAPH_VERSION` | Graph API version, default `v25.0` |
| `IMMICH_API_KEY` | Immich API key |
| `VITE_IMMICH_URL` | Public Immich URL; blank to disable |
| `IMMICH_INTERNAL_URL` | Optional direct/internal Immich URL used by server-side jobs (photo sync, delete) to bypass Cloudflare 100 MB body limit. Example: `http://immich-server:2283` on shared Docker network. Falls back to `VITE_IMMICH_URL` when unset. |
| `RAZORPAY_KEY_ID` | Razorpay key id (`rzp_live_…` or `rzp_test_…`). With `RAZORPAY_WEBHOOK_SECRET` it turns on Payment Page ingestion; its prefix decides live or test mode. Not secret by itself, but keep it with the others. |
| `RAZORPAY_WEBHOOK_SECRET` | The secret set on the Razorpay dashboard webhook; every delivery is verified against it. Unset turns ingestion off (the webhook answers 404). Treat as a secret. |
| `RAZORPAY_KEY_SECRET` | Optional. When set, the sync jobs fetch each payment and refund from the Razorpay API (the source of truth), the 6-hourly reconcile and "Sync now" also list payments, refunds and settlements from the API, `settlement.processed` webhooks record the settlement, and Settings → Integrations can "Import past payments"; when unset, the signed webhook copies are used, the reconcile and "Sync now" only retry payments stuck in the queue, settlements are not recorded, and the import is off. Treat as a secret. |
| `SOCIAL_MEDIA_SIGNING_SECRET` | HMAC key (at least 32 characters, e.g. `openssl rand -hex 32`) for the 36-hour signed photo links of the social API (`/api/social/v1/events/{id}/photos` and `/api/social/v1/media/...`). Unset makes both return 503. Rotating it invalidates links already handed out. Treat as a secret. |
| `GRAVATAR_API_KEY` | Gravatar REST API key |
| `GRAVATAR_API_BASE_URL` | Gravatar API base URL (default `https://api.gravatar.com/v3`) |
| `GRAVATAR_TIMEOUT_MS` | Gravatar API timeout in ms (default `5000`) |
| `AVATAR_FALLBACK_SEED` | DiceBear fallback seed |
| `COOKIE_DOMAIN` | Cross-subdomain cookie domain (production) |
| `APP_URL` | App URL shown in notification footers |
| `WEBSITE_DISPATCH_TOKEN` | Fine-grained GitHub token whose only resource is `proud-indian-ngo/website`, with **Contents: read and write**. When set, the `sync-public-events-deploy` job checks `/api/public/events` every 5 minutes and sends the website's `events-changed` `repository_dispatch` (which rebuilds proudindian.ngo) only when the feed changed (and once after each restart). Treat as a secret. |
| `VOUCHER_FINANCE_ADMIN_NAME` | Finance admin name printed on cash vouchers |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | For `auth:seed-admin` script |
| `POSTHOG_API_KEY` | Server-side PostHog API key used for OTLP log export when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset |
| `POSTHOG_HOST` | PostHog host for server-side OTLP export fallback (default `https://us.i.posthog.com`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Explicit OTLP logs endpoint; overrides PostHog fallback when set |
| `OTEL_SERVICE_NAME` | Service name attached to server logs/traces (default `pi-dash`) |
| `VITE_POSTHOG_KEY` | Public PostHog project key for browser analytics and exception capture |
| `VITE_POSTHOG_HOST` | Public PostHog host for browser SDK (default `https://us.i.posthog.com`) |

### Observability / Analytics

- Server logs export over OTLP when either `OTEL_EXPORTER_OTLP_ENDPOINT` is set or `POSTHOG_API_KEY` is present.
- OTLP drain is fire-and-forget — if the endpoint is unreachable, logs are dropped silently (evlog retries up to 2 times).
- Browser analytics and client-side exception capture stay disabled unless `VITE_POSTHOG_KEY` is set.
- `OTEL_SERVICE_NAME` controls service name attached to server-side exported events.
- All server-side logs are automatically enriched with `traceId` from the request context via `evlog:enrich` hook.
- Job payloads carry `__traceId` internally for trace propagation; this field is stripped before reaching business logic.

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
| `ZERO_QUERY_HYDRATION_STATS` | Optional slow-hydration row statistics; Compose defaults to `false` |

For a bounded performance investigation in Dokploy, set `ZERO_QUERY_HYDRATION_STATS=true` in the Compose environment and redeploy zero-cache. Collect slow-hydration row statistics and compare them with query plans from the Zero inspector. Restore `false` and redeploy after the investigation. This setting does not change query results or raise the slow-query warning threshold. Keep the admin password and authentication cookies out of captured reports.

## Database Setup

### 1. PostgreSQL

PostgreSQL must run with `wal_level=logical` for Zero replication.

**Local (Docker):**

```bash
bun run db:start
```

This starts the container defined in `packages/db/docker-compose.yml` with `wal_level=logical` already configured.

**Production:** Ensure your managed Postgres instance has `wal_level=logical` enabled. Use an unpooled connection string for `ZERO_UPSTREAM_DB`.

The production Compose PostgreSQL command also preloads `pg_stat_statements` with `compute_query_id=auto`. Applying this startup change requires recreating/restarting the PostgreSQL service and briefly interrupts database connections. An app-only redeploy is insufficient. If Dokploy maintains a separate Compose definition, apply the same PostgreSQL command there and preserve any other configured preload libraries.

After PostgreSQL restarts, connect to the application database (`dash` in production) as an administrator and run once:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SHOW shared_preload_libraries;
SELECT count(*) FROM pg_stat_statements;
```

The production Compose command also sets `track_io_timing=on` to collect disk read/write timings for subsequent queries. Verify it with `SHOW track_io_timing;`.

The extension exposes collected PostgreSQL statement statistics; it does not measure Zero's SQLite query execution. See the [PostgreSQL documentation](https://www.postgresql.org/docs/18/pgstatstatements.html).

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

The Kalakriti legacy-credential removal migration drops `kalakriti_credential` and its stored token hashes. Back up that table before applying it, and stop old app/Zero workers that still reference it; a mixed-version rollout isn't compatible with this drop. JSON person QRs and yearly IDs don't require credential rows. Later event-day branches must remove their credential-table dependencies before deployment. Existing missing volunteer yearly IDs can be filled with the [explicit backfill](docs/architecture/kalakriti-registration.md#volunteer-yearly-ids).

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

Production Docker (`Dockerfile`) runs `bun install --frozen-lockfile --ignore-scripts` so `@rocicorp/zero-sqlite3` does not compile a native addon in the slim image. Pin `rocicorp/zero` in `docker-compose.prod.yml` to the same minor as the `@rocicorp/zero` catalog version.

The web build and migrator share the `source` stage. The migrator copies dependencies and database sources directly from it, so building the migration image does not run Vite or require web build arguments.

## Running in Production

### Web App (TanStack Start)

The built app is a Node.js server:

```bash
node apps/web/dist/server/index.mjs
```

Runs on port 3001 by default.

#### Static assets and caching

Build chunks under `/assets/*` have content-hashed names and are served with `cache-control: public, max-age=31536000, immutable`. A request for a chunk the running build doesn't have (a tab or container from another deploy) gets a `404` with `cache-control: no-store`, so a missing chunk is never cached; the client reloads once onto the current build. Keep Cloudflare respecting the origin's `Cache-Control` on `/assets/*` (no edge TTL override). If a bad response under `/assets/*` was ever cached, purge `/assets/*` in Cloudflare; affected browsers need a hard refresh.

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

Local and production Compose configurations use the official `ghcr.io/aldinokemal/go-whatsapp-web-multidevice:v9.6.0` image. `pull_policy: always` checks the registry for that pinned version on `docker compose up`; version upgrades require changing the tag.

#### Dashboard

Since GoWA v9, the dashboard is released separately as [gowa-ui](https://github.com/aldinokemal/gowa-ui), but GoWA downloads and serves it itself. Both Compose files explicitly set `APP_UI_ENABLED=true` and `APP_UI_AUTO_UPDATE=true`; no separate UI container is required. Open `http://localhost:3100` locally or the existing GoWA Tailscale URL in production and use `WHATSAPP_AUTH_USER` / `WHATSAPP_AUTH_PASS`.

The first startup needs outbound access to GitHub's API and release downloads. GoWA verifies the release digest and caches the HTML under `/app/storages/ui/`, inside the existing persistent WhatsApp volume. It checks for UI updates every three hours, independently of the pinned GoWA server version. A failed download with no cache displays a fallback page instead of the dashboard.

For a fixed or offline UI build, follow [upstream's dashboard instructions](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/v9.6.0/readme.md#web-dashboard-gowa-ui): place the chosen release's `gowa-ui.html` at `/app/storages/ui/index.html` and set `APP_UI_AUTO_UPDATE=false`. `APP_UI_ASSET_SHA256` can additionally enforce an exact asset digest; setting it while tracking latest can reject future releases.

#### Local webhooks and upgrades

GoWA v9.6.0 sends webhook requests with `Content-Length`, so the old buffering proxy is no longer needed. Local Compose sends callbacks directly to `http://host.docker.internal:${DEV_WEB_PORT:-3001}/api/whatsapp/webhook`. For local webhook testing, run the web dev server with `bun run --cwd apps/web dev --host 0.0.0.0` so Docker can reach it. If using a different `DEV_WEB_PORT`, supply the same value to the web process and Compose. The Vite configuration already allows the `host.docker.internal` hostname.

Deploy the app's upstream poll parser and gateway image together. Both Compose configurations subscribe to `WHATSAPP_WEBHOOK_EVENTS=message`; change any device-specific webhook event override from `message.poll_vote` to `message` too. The app reads votes from `payload.poll` and ignores other messages and failed vote decryption. Keep the existing WhatsApp storage volume and `WHATSAPP_WEBHOOK_SECRET` when replacing the fork container.

### Switching WhatsApp to the Cloud API

Messages to people move to Meta's Cloud API only once both `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set; until then everything stays on the gateway. Switch in this order:

1. Check every template is approved: `bun run whatsapp:templates status`. Unapproved ones aren't sent on the Cloud API.
2. Use a Cloud API number that is neither the GoWA gateway's number nor registered on the WhatsApp or WhatsApp Business app.
3. Set `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_VERIFY_TOKEN` and `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID`, then deploy. The deploy applies migration `0149` (send log and digest columns).
4. In the app's WhatsApp → Configuration page, register the webhook `https://<APP_URL>/api/whatsapp/cloud/webhook` with the same verify token, and subscribe to the `messages` field.
5. Set `WHATSAPP_CLOUD_ACCESS_TOKEN` (system user token, expiry **Never**) and `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, and redeploy. This is the switch.

Template buttons link to the production `APP_URL` registered with each template, so a staging deployment on the Cloud API would send people to production. Keep staging and local `.env` files without `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.

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
- [ ] Resend API key and verified sending domain configured for email verification and password reset
- [ ] Resend webhook (`email.bounced`, `email.complained`) pointing at `/api/email/webhook`, with `RESEND_WEBHOOK_SECRET` set
- [ ] R2 bucket created and credentials set
- [ ] R2 lifecycle expires protected `tmp` objects after 24 hours
- [ ] `VITE_CDN_URL` matches the historical CDN origin until cutover is complete
- [ ] Private media backfill has zero changed/malformed rows
- [ ] R2 public bucket/CDN access is disabled after authenticated-read verification
- [ ] WhatsApp gateway running and paired (if using WhatsApp alerts)
- [ ] Immich server accessible (if using photo management)
- [ ] `WEBSITE_DISPATCH_TOKEN` set (fine-grained GitHub token, `proud-indian-ngo/website` only, Contents: read and write) if the public website should rebuild when events change; the website's `PUBLIC_EVENTS_URL` is `https://dash.proudindian.ngo/api/public/events`
- [ ] Razorpay Payment Page donations: `RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET` (and optionally `RAZORPAY_KEY_SECRET`) set, the dashboard webhook added and the clearing account chosen (see "Razorpay Payment Page donations" below)
- [ ] `SOCIAL_MEDIA_SIGNING_SECRET` set and a social API token created (`bun run social:token create social-artifacts --scopes events:read,photos:read,signups:read,social:write`) if the social pipeline is in use; app_config `social_approver_user_id` names the digest recipient (see `docs/architecture/social-api.md`)
- [ ] Cloudflare respects the origin `Cache-Control` for `/assets/*` (see "Static assets and caching")
- [ ] The app origin is only reachable through Cloudflare: `/api/public/events` rate-limits by `cf-connecting-ip`, which a client could forge if the origin were exposed directly

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push:

- `bun run check:types` — TypeScript type check
- `bun run check` — Biome linter
- `bun run test:unit` — Vitest unit tests

Pre-commit hook (lefthook) runs type check, linting, unit tests, and unused-exports check in parallel.


### pg-boss and Zero event triggers

The application disables PostgreSQL event triggers only on its dedicated pg-boss worker/producer connections to permit concurrent maintenance of the unsynced `pgboss` schema. This requires PostgreSQL 17+ and superuser or suitable SET privilege for `event_triggers`. Do not disable event triggers in `DATABASE_URL`, `ZERO_UPSTREAM_DB`, at role/database level or globally: application schema changes must still reach Zero. The normal deployment recreates job connections; no database restart is required. See `docs/architecture/jobs.md` for the reproduced failure and validation.

### Kalakriti results rollout

Apply both ordered results migrations (Entry composite uniqueness, then result tables) before deploying the matching generated Zero schema and web build. Existing Editions start without results; there is no historical score backfill. Add the 24-hour R2 lifecycle expiry for `<R2_KEY_PREFIX>/kalakriti-scorecards/tmp/` before enabling scorecard uploads. Durable scorecards, including files retained by old result revisions, must not expire.

### Vendor parties rollout

Migration `0116_vendor_parties.sql` turned every vendor into a party (same UUID, kind organisation, `vendor` role) and moved its contact, PAN and bank details out of the replicated `vendor` table. The one-off backfill that encrypted them into `party_private` and `party_bank_account` ran in production in October 2026, and the migration `drop_vendor_legacy_details` then drops the emptied `private.vendor_legacy_details` table. That migration stops with `vendor_legacy_details still has rows` if any are left, so nothing unmigrated is lost; restore the backfill script from git history (before the PR that removed it) and run it with the production `DATA_ENCRYPTION_KEY` first.

If a reveal says "saved with a different encryption key" (server log reason `encrypted_value_unreadable`), the value was encrypted under another `DATA_ENCRYPTION_KEY`, for example by a script run from a laptop with its local key. Re-encrypt it under the production key; the one-off re-key tooling used in October 2026 is in git history.

Scripts read their database and key from the environment. Variables set on the command line override `.env` and `.env.worktree`; check the target before running anything against production.

### Vendor payment status repair

A one-off repair corrected vendor payment statuses that disagreed with their payments and invoice (requests paid while still `pending`, or reset to `approved` by a later approval). It ran in production in October 2026; the script is in git history.

### Money in paise rollout

Migration `0118_money_paise.sql` replaces the `numeric(12,2)` rupee `amount` column with `amount_paise bigint` on `reimbursement_line_item`, `advance_payment_line_item`, `vendor_payment_line_item` and `vendor_payment_transaction`. It runs in the existing `migrate` service: per table it adds the column, backfills `round(amount * 100)`, sets it NOT NULL and drops `amount`, all in the migration transaction. Before touching anything it checks every amount and aborts with `money_paise: an amount has more than two decimal places` if one has more than two; `numeric(12,2)` cannot hold such a value, so this only fires if the column type was changed by hand, and the deploy stops with no data changed.

Because `amount` is dropped, deploy the migration, the regenerated Zero schema and the web build together, as for the vendor parties rollout; old app or Zero workers that still read `amount` fail. Screens, notifications, cash vouchers and the financial-year export show the same rupee values as before. The vendor payment transaction notification jobs now carry `amountPaise`; for this release the handlers also accept the old rupee `amount`, so a job the old build enqueued before the deploy still sends the right figure and no queue drain is needed. That fallback is removed in a later release.

### Organisation accounts before recording income

Production has no organisation accounts: the seeded ones are dev-only. Before anyone records a contribution that is not in kind, or any other income, a `finance.manage` user must create the trust's real bank, cash and gateway clearing accounts in Settings → Organisation accounts (`/settings/org-accounts`), with the fund source and, for FCRA accounts, the FCRA role. The "Deposited into" picker is empty until then. Bank account numbers and IFSC are not stored yet.

### CSV imports of contributions

Migration `0120_income_imports` adds `import_batch`, `contribution.import_batch_id` and the server-only `private.import_row`, `private.external_identity` and `private.collection_event`. No new environment variables. Imports need the same organisation accounts as manual entries, and `DATA_ENCRYPTION_KEY` for PANs: without it, imported donors are created without their ID and automatic PAN matching is off. The pg-boss schedule `expire-import-rows` (daily, 2:30 AM IST) disposes of uploaded rows: their raw cells 180 days after a batch's last import, or the rows themselves 30 days after upload for batches never imported.

### Razorpay Payment Page donations

Migration `0123_razorpay_imports` adds the `razorpay_api` import source and the `razorpay` identity provider, `import_batch.pending_count`, makes `private.import_row.retain_until` nullable (a Razorpay payment has no retention date until it has an outcome), and lets a Razorpay batch exist before a clearing account is chosen (`org_account_id` stays required for CSV batches by a check constraint). Ingestion is off until both `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set; nothing else changes until then.

Setup, test mode first:

1. In Settings → Organisation accounts, create a gateway clearing account for Razorpay (for example "Razorpay clearing").
2. Set `RAZORPAY_KEY_ID` (a `rzp_test_…` key while testing), `RAZORPAY_WEBHOOK_SECRET` (any strong random string, e.g. `openssl rand -hex 32`) and, optionally, `RAZORPAY_KEY_SECRET`, then restart the app.
3. In Settings → Integrations (`/settings/integrations`, `finance.view` to see, `finance.manage` to edit), check the status says "Connected · test mode", copy the webhook URL, choose the clearing account and save. Adjust the notes keys if the Payment Page's field names differ from the defaults.
4. On the Razorpay dashboard (in the same mode as the key), Settings → Webhooks → Add new webhook: the URL from step 3, the same secret as `RAZORPAY_WEBHOOK_SECRET`, and the events `payment.captured`, `order.paid`, `refund.processed` and `settlement.processed`. An existing webhook needs `refund.processed` and `settlement.processed` added; other refund events are acknowledged and ignored, and `settlement.processed` is only acknowledged while `RAZORPAY_KEY_SECRET` is unset.
5. Make a test payment on the Payment Page. Settings → Integrations shows the webhook time, and the donation appears on the Income page (or as waiting on the Imports tab).
6. With `RAZORPAY_KEY_SECRET` set, use "Import past payments" in Settings → Integrations (`finance.manage`) to bring in donations made before the webhook existed: a From and To date (default the start of the financial year to today), at most 400 days per run. It runs in the background one India day at a time, shows its progress, and leaves payments already recorded as they are. No shell access is needed.

A test key on a production server stops ingestion: deliveries are acknowledged but nothing is recorded, and the Integrations page shows a blocking error, since test payments would otherwise land in the real books; switch to the `rzp_live_…` key and the live-mode webhook once testing is done. Live and test payments are kept apart by mode, so a test payment never matches a live one. The `razorpay-sync-payment` queue is new; its worker is registered by the web server itself (`apps/web/server/plugins/jobs.ts`).

Migration `0125_razorpay_refunds` adds the `contribution_refund` table (synced through Zero, written only by the server; unique per source and refund reference) with its `contribution_refund_source` enum and two flags, the server-only `private.pending_refund` (refunds held until their payment is imported: IDs, amount, currency, time), `private.import_row.external_id` (a Razorpay row's payment ID, kept when retention nulls `raw`), and the `refund` value of `private.external_identity_entity_type`. No new environment variables. Two queues are new, `razorpay-sync-refund` (keyed by refund ID; a refund whose payment is not imported yet is held and applied when the payment is) and `razorpay-reconcile` (one run at a time, never retried, 60-second heartbeat, stopped before its 4-hour expiry), both worked by the web server. The `razorpay-reconcile` schedule (every 6 hours at :15 IST, over today and the three days before) is registered whenever `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set, never with a test key on a production server; it syncs payments stuck queued or failed for over an hour, and with `RAZORPAY_KEY_SECRET` also lists payments and refunds from the API. The run's progress and last result are kept in app_config (`razorpay_reconcile_run`, `razorpay_last_reconcile`: dates and counts only). Refunds are recorded, not posted: a full refund marks the contribution refunded, a partial one shows as "Partly refunded", a recorded refund fixes the contribution's amount, donor, date, account and channel, and a refund of a receipted contribution (none exist yet) or one Razorpay reports again with another amount is shown under "Needs attention" in Settings → Integrations.

Migration `0126_razorpay_settlements` adds `gateway_settlement` (one row per Razorpay payout: mode, settlement ID unique per provider and mode, clearing account, status, India settlement date, net amount, gross, refunds, fees and GST of its lines, payment and line counts, the payout's own instant-settlement fee and GST, a count of unreadable recon lines, UTR, an `amount_changed` flag) and `gateway_settlement_item` (the payments, refunds, transfers and adjustments each payout covered, linked to the contribution or refund they settled), with three enums; both are synced through Zero to `finance.view` and `finance.manage` only and written only by the server. No new environment variables, but settlements need `RAZORPAY_KEY_SECRET`: they come from `GET /v1/settlements` and the settlement recon (`GET /v1/settlements/recon/combined`). Add `settlement.processed` to the dashboard webhook's events; each delivery queues `razorpay-sync-settlement` (new queue, keyed by settlement ID, retried with backoff, worked by the web server). The reconcile, "Sync now" and "Import past payments" record each day's settlements after its payments and refunds, so running "Import past payments" once over the financial year also brings in its settlements. Settlements never create or change contributions and make no postings, but a contribution a processed settlement paid out can no longer be deleted and its amount, donor, date, account and channel are fixed. Income → Settlements shows them with "Awaiting settlement" (gifts and refunds no processed settlement has covered yet).

Migration `0127_bank_statement_lines` adds `statement_line` (one row per bank statement line: bank account, value date, direction, amount, printed balance, masked narration, reference, a keyed line hash unique per account, match status and kind, the matched settlement or contribution, a suggestion, an ignore reason and note) with four enums, and the `bank_csv` value of `import_batch_source`. Lines are synced through Zero to `finance.view` and `finance.manage` only and written only by the server and the contribution mutator. No new environment variables, services or queues. The line hash uses the import hashing key (`DATA_ENCRYPTION_KEY`), so keep that key fixed once statements are imported, as for contribution imports. Statement uploads are kept in `private.import_row` under the existing import retention job.

Migration `0129_give_do_payouts` adds `give_do` to `gateway_settlement_provider` and `give_do_payout` to `import_batch_source`; there are no new tables or data backfills. Apply migrations before deploying the updated web/Zero code. The server-side XLSX reader is included in the web package and lockfile; no new environment variables, services, API credentials or queues are needed. Importers need both `donors.manage` and `finance.manage`, an active give.do clearing account and a fund. Existing `DATA_ENCRYPTION_KEY` and import retention requirements apply unchanged. Give.do imports are synchronous and atomic; re-uploaded UTRs preserve the first settlement and flag changed evidence. The default settlement date is the upload date and can be corrected during review.

### The books (ledger, opening balances, year close)

Migration `0132_ledger_books` adds `posting`, `ledger_entry`, `account_movement`, `movement_allocation`, `opening_balance` and `fiscal_year_event` with their enums, `fiscal_year.closed_by`, the `deposit` value of `org_account_kind` and the `fund` value of `account_head_type`. Migrations `0133_ledger_append_only` and `0134_ledger_guards` add the database guards: no UPDATE or DELETE on the ledger tables and `fiscal_year_event`, `opening_balance` final except its one-time reversal stamp, and no TRUNCATE on any of the six. A reviewed repair must run `SET LOCAL pi_dash.ledger_maintenance = 'on'` in its own transaction. All run in the existing `migrate` service; deploy them with the regenerated Zero schema and the web build. No new environment variables, services or queues, and nothing posts automatically yet.

On start the web server ensures the Corpus Fund and the books' account heads (`Fixed assets`, `Audit fees payable`, `Fund balance`, `Interest on fixed deposit`); if one can't be created because another row already uses its code, the server log says "Books reference data missing" with the code, and the opening balances page says so too. The new permissions `finance.post_opening`, `finance.close_year`, `finance.reopen_year` and `finance.adjust` go to every finance admin and super admin automatically; admins don't get them, and there is no separate Treasurer role. Finance admins can post opening balances and close or reopen the year. After the deploy:

1. In Settings → Organisation accounts, confirm the current account and add the fixed deposit with kind "Fixed deposit".
2. Once the CA has confirmed the audited FY 2025-26 balance sheet, a finance admin enters the opening balances at Finance → Books → Opening balances (`/finance/books/opening`): each account's balance, one line per fixed asset, the audit fees payable, and the Corpus and General Fund balances, with the CA's name and date. It posts only when assets equal funds plus liabilities. Never seed or script the real figures.
3. A year can be closed only after it has ended, once the previous year is closed; close FY 2026-27 from Finance → Books after 31 March 2027.

### Audited figures (the year-end true-up)

Migration `0149_audited_figures` adds `audited_figures` and `audited_figures_line` (with the `audited_figures_status` and `audited_figures_line_kind` enums), synced read-only through Zero to book readers; `0150_ledger_guards_v3` puts them under the books' database guards (the document final except its one-time reversal stamp, its lines append-only, no TRUNCATE on either) and moves the guard functions to v3. Deploy them with the regenerated Zero schema and the web build. No new environment variables, services or queues. On start the web server adds four reference account heads: `Depreciation` and `Year-end adjustments (audited)` (expense), `Year-end adjustments (audited) — income` (income) and `Transfers between funds` (fund). Rolling back to code from before guards v3 makes the server rewrite the guard functions with the v2 version comment on start; the triggers on the audited-figures tables stay in place, and redeploying restores v3. `finance.adjust`, which finance admins and super admins already hold, now enters them. Nothing posts until a finance admin enters a year's figures at Finance → Books → Audited figures (`/finance/books/audited`), after the year has ended and the CA has signed its statements; never seed or script the real figures.

### Income posting (books layer 3-2)

Migration `0135_ledger_income` adds `ledger_source_state` (with the `ledger_source_status` enum) and `statement_line.transfer_org_account_id` with its check. Run it in the existing `migrate` service and deploy it with the regenerated Zero schema and the web build. No new environment variables or services. Two new pg-boss queues, created by the jobs worker at start: `ledger-post-source` (one job per changed income record) and `ledger-post-pending` (the sweep, scheduled daily at 03:30 India time). On start the web server adds the account heads `Donations received`, `In-kind donations`, `Other income`, `In-kind consumed` and `Gateway charges` (fixed IDs; a code clash is logged as "Books reference data missing" and the affected records wait with that reason). The new permission `finance.post_pending` goes to every finance admin and super admin automatically. After the deploy:

1. Post the opening balances first if they aren't (the deploy steps above).
2. A finance admin opens Finance → Books and chooses **Post pending** once. This is the backfill from 1 April 2026: every contribution, refund, other income, processed payout and marked transfer since then posts. It works for 20 seconds in the request and hands the rest to the `ledger-post-pending` job; the daily run catches anything left. Running it again is safe.
3. Check the "Waiting to post" list on Books. A payout waits for its bank account when more than one bank account is active and its bank statement line isn't matched (match the line on Bank statements); a bank line marked as a transfer before this release waits for its other account (unmatch it and mark it again, picking the fixed deposit or the other bank account).

### Donation receipts

Migration `0136_donation_receipts` adds `contribution_receipt` (synced through Zero) and, in schema `private`, `contribution_receipt_counter` and `contribution_receipt_snapshot`. Deploy it with the regenerated Zero schema and the web build. No new environment variables or services; the new pg-boss queue `send-contribution-receipt` is created on start. Receipts with the 80G line need `DATA_ENCRYPTION_KEY` (already required for donor IDs); emailing needs `RESEND_API_KEY` and `EMAIL_FROM`.

The new permission `donors.receipt` goes to every finance admin and super admin automatically; admins don't get it. After the deploy, a finance admin:

1. Fills in Settings → Organisation accounts → Donation receipts: the trust's registered name, address, PAN, and the signatory's name and designation (printed on every receipt; never seed the real values).
2. Checks the 80G registration (URN and date) under Donations return in the same page.
3. Has the CA confirm the receipt wording marked CA TO CONFIRM in `packages/shared/src/receipts.ts` before the first receipt is sent.

### Expenses head repair and payment proof

No migration, environment variable, service or queue. On start the web server gives the Expenses parent head its own ID and moves the expense category heads (`EXPENSE_*`) out from under Corpus donations, where a clash of IDs had put them. During a rolling deploy an instance still on the old build may create one more category head under Corpus donations; the next restart moves it. After the deploy, a finance admin clears the Reimbursements filter "Missing payment proof" by adding each claim's payment screenshot (or voiding a claim that was never paid), then chooses Post pending on Books.

### CA handoff workbook (books layer 3-5)

Nothing to configure: no migration, environment variable, service or queue. The web app gains the server-only `write-excel-file` dependency, installed by the existing `bun install` layer. After the deploy a finance admin can download the workbook from Finance → Books → ⋯ → Download CA workbook (XLSX) once the opening balances are posted.
