# Deployment

## Prerequisites

| Requirement | Version |
|---|---|
| Bun | `>=1.3.11` (see `packageManager` in `package.json`) |
| Node.js | `>=20`, for zero-cache and build tools |
| PostgreSQL | `>=17` with `wal_level=logical`; Compose and production use 18 |
| Docker | Local Postgres and the WhatsApp gateway |

External services, each optional unless its variables are required below: Cloudflare R2 (files), Resend (email), Immich (photos), the self-hosted GoWA WhatsApp gateway, Meta's WhatsApp Cloud API and Razorpay.

## Environment variables

Copy `.env.sample` to `.env` locally; in production `docker-compose.prod.yml` passes variables to each service. The contracts are `packages/env/src/server.ts` and `web.ts` ([how they load](docs/architecture/env-and-secrets.md)). "Prod" means required when `NODE_ENV=production`. Empty strings count as unset. Every key, token and secret is a secret.

### Core, auth and encryption

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Session secret, 32+ characters |
| `BETTER_AUTH_URL` | Yes | Auth base URL and base of the public events feed's `signUpUrl`. The website accepts only `https://dash.proudindian.ngo/` links, so production must use that origin |
| `CORS_ORIGIN` | Yes | Allowed origin, usually `BETTER_AUTH_URL` |
| `DATA_ENCRYPTION_KEY` | Prod | Base64 of 32 bytes (`openssl rand -base64 32`). Encrypts donor IDs, PANs and bank numbers and keys import hashes. Never change it once data exists. Scripts that write encrypted values must use the production key |
| `COOKIE_DOMAIN` | No | Cross-subdomain cookie domain |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No | Account for `bun run auth:seed-admin`; password 8+ characters |
| `NODE_ENV` | No | `development` (default), `production` or `test` |
| `APP_URL` | No | App URL in notification footers |
| `APP_NAME`, `VITE_APP_NAME` | No | Server and browser app name; default `Proud Indian Dashboard` |
| `PHOTO_NOTIFICATION_DELAY_SECONDS` | No | Photo notification batching window; default 120, max 3600 |

### Zero

| Variable | Required | Purpose |
|---|---|---|
| `VITE_ZERO_URL` | Yes | Public zero-cache URL that browsers connect to; build argument too |
| `ZERO_UPSTREAM_DB` | Yes (zero-cache) | Unpooled PostgreSQL URL for logical replication |
| `ZERO_MUTATE_URL`, `ZERO_QUERY_URL` | Yes (zero-cache) | Web app's `/api/zero/mutate` and `/api/zero/query` |
| `ZERO_MUTATE_FORWARD_COOKIES`, `ZERO_QUERY_FORWARD_COOKIES` | No | Forward session cookies; default `true` |
| `ZERO_ADMIN_PASSWORD` | Prod | zero-cache admin password |
| `ZERO_LOG_LEVEL`, `ZERO_REPLICA_FILE` | No | Log level (default `debug`); SQLite replica path |
| `ZERO_QUERY_HYDRATION_STATS` | No | Slow-hydration statistics; keep `false` |

### Email (Resend)

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Prod | Sending key; unset skips email (auth links are logged) |
| `EMAIL_FROM` | Prod | Address on a Resend-verified domain, bare or `Name <address>` |
| `RESEND_WEBHOOK_SECRET` | No | `whsec_…` secret of the bounce and complaint webhook; unset makes `/api/email/webhook` answer 503 |

### Storage (Cloudflare R2)

| Variable | Required | Purpose |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Yes | R2 credentials and bucket |
| `R2_KEY_PREFIX` | Yes | Upload key prefix, e.g. `attachments` |
| `VITE_CDN_URL` | Yes | Historical public CDN origin, used to recognise legacy media references. Keep it set (see [Upgrade notes](#private-media-cutover)) |

### Avatars and cash vouchers

| Variable | Required | Purpose |
|---|---|---|
| `GRAVATAR_API_KEY`, `AVATAR_FALLBACK_SEED` | Yes | Gravatar REST key; DiceBear fallback seed |
| `GRAVATAR_API_BASE_URL`, `GRAVATAR_TIMEOUT_MS` | No | Defaults `https://api.gravatar.com/v3` and `5000` |
| `VOUCHER_ORG_NAME`, `VOUCHER_ORG_ADDRESS`, `VOUCHER_ORG_PHONE`, `VOUCHER_ORG_EMAIL`, `VOUCHER_ORG_REGISTRATION`, `VOUCHER_FINANCE_ADMIN_NAME` | Yes | Organisation and finance admin details printed on cash vouchers |

The treasurer signature (`packages/pdf/assets/signature.png`) is bundled at build time. The cash-voucher limit is a setting (Settings → Programmes).

### WhatsApp gateway (GoWA)

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_WEBHOOK_SECRET` | Yes | Shared with the gateway; validates its webhook calls |
| `WHATSAPP_API_URL` | No | Gateway URL; unset disables the gateway |
| `WHATSAPP_AUTH_USER`, `WHATSAPP_AUTH_PASS` | No | Gateway basic auth; Compose defaults `admin`/`admin` |
| `WHATSAPP_WEBHOOK` | No | Gateway container only: URL it posts messages to (`…/api/whatsapp/webhook`) |

### WhatsApp Cloud API

See [Switching WhatsApp to the Cloud API](#switching-whatsapp-to-the-cloud-api).

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | No | System user token, expiry Never, permissions `whatsapp_business_messaging` and `whatsapp_business_management` |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | No | Phone number ID from WhatsApp → API Setup (not the number) |
| `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID` | With the token | WhatsApp Business Account ID (not the portfolio ID); also used by `bun run whatsapp:templates` |
| `WHATSAPP_CLOUD_APP_SECRET` | No | App secret (App settings → Basic); verifies `/api/whatsapp/cloud/webhook`; unset disables the route |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | No | Any random string, also entered as the webhook verify token in Meta |
| `WHATSAPP_CLOUD_GRAPH_VERSION` | No | Graph API version; default `v25.0` |

### Immich

| Variable | Required | Purpose |
|---|---|---|
| `VITE_IMMICH_URL` | No | Public Immich URL; unset disables photos |
| `IMMICH_API_KEY` | No | Immich API key |
| `IMMICH_INTERNAL_URL` | No | Direct URL for server jobs, e.g. `http://immich-server:2283`, avoiding Cloudflare's 100 MB body limit; falls back to `VITE_IMMICH_URL` |

### Razorpay

Ingestion is on only when both `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set.

| Variable | Required | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | No | `rzp_live_…` or `rzp_test_…`; the prefix sets live or test mode |
| `RAZORPAY_WEBHOOK_SECRET` | No | Secret set on the Razorpay dashboard webhook; unset makes the webhook answer 404 |
| `RAZORPAY_KEY_SECRET` | No | Fetches payments, refunds and settlements from the API. Without it, webhook copies are used and settlements and "Import past payments" are off |

### Social API and website

| Variable | Required | Purpose |
|---|---|---|
| `SOCIAL_MEDIA_SIGNING_SECRET` | No | HMAC key, 32+ characters (`openssl rand -hex 32`), for 36-hour signed photo links. Unset makes `/api/social/v1/events/{id}/photos` and `/api/social/v1/media/…` answer 503. Rotating it invalidates issued links |
| `WEBSITE_DISPATCH_TOKEN` | No | Fine-grained GitHub token for `proud-indian-ngo/website` only, Contents read and write. The `sync-public-events-deploy` job checks `/api/public/events` every 5 minutes and sends `events-changed` `repository_dispatch` when the feed changes |

### Observability

| Variable | Required | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTLP logs endpoint; overrides the PostHog fallback |
| `POSTHOG_API_KEY` | No | Server key; exports logs to PostHog over OTLP when no endpoint is set |
| `POSTHOG_HOST` | No | Default `https://us.i.posthog.com` |
| `OTEL_SERVICE_NAME` | No | Service name on server logs; default `pi-dash` |
| `VITE_POSTHOG_KEY` | No | Browser analytics and exception capture; unset disables them |
| `VITE_POSTHOG_HOST` | No | Browser PostHog host |

### Production Compose and tooling

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Prod Compose | Postgres credentials; Compose builds `DATABASE_URL` and the Zero URLs from them |
| `TS_AUTHKEY`, `TAILSCALE_CONFIG_DIR` | Prod Compose | Tailscale sidecars for Postgres and GoWA |
| `PORT` | Prod Compose | Web port zero-cache calls; default 3000 |
| `DEV_DB_HOST`, `DEV_DB_PASSWORD` | Development | Local Postgres; required when `NODE_ENV=development` |
| `DEV_WEB_PORT`, `ZERO_PORT`, `WORKTREE_ID`, `ZERO_APP_ID` | Development | Worktree ports and IDs |
| `SKIP_VALIDATION`, `VITE_E2E` | Build, E2E | Skip validation; skip `.env.worktree` |

E2E credentials and `*_TEST_DATABASE_URL` variables are test settings, not deployment ones.

## Database setup

PostgreSQL needs `wal_level=logical` for Zero. Locally, `bun run db:start` starts `packages/db/docker-compose.yml`, already configured. In production, give `ZERO_UPSTREAM_DB` an unpooled connection.

Production Compose also loads `pg_stat_statements` with `compute_query_id=auto` and `track_io_timing=on`; changing these needs a Postgres restart. Then run once as an administrator:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT count(*) FROM pg_stat_statements;
```

Apply migrations with `bun run db:migrate` (`db:push` is for local development only). Production Compose runs the `migrate` service before the app. Keep schema changes Zero-compatible: add columns with defaults, deploy, then drop old columns in a later release. A migration that drops a column the old build reads ships with the regenerated Zero schema and web build; stop old app and Zero workers first.

Seed the admin with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set:

```bash
bun run auth:seed-admin   # idempotent; creates the user and ensures the admin role
```

## Build

```bash
bun install
bun run build
```

The web build writes `apps/web/.output/`. In Docker, `VITE_*` variables are build arguments. Pin `rocicorp/zero` in `docker-compose.prod.yml` to the same minor as the `@rocicorp/zero` catalog version. Image stages are described in [monorepo.md](docs/architecture/monorepo.md#docker-build).

## Running

### Web app

```bash
bun run --cwd apps/web start   # bun run .output/server/index.mjs
```

The production container listens on port 3000 with a health check at `/api/health`; local development uses 3001.

Hashed chunks under `/assets/*` are cached `immutable` for a year; a missing chunk returns 404 with `no-store` and the client reloads once. If Cloudflare ever cached a bad `/assets/*` response, purge `/assets/*`.

### Zero cache

zero-cache runs separately (the `rocicorp/zero` image in production, `npx zero-cache` elsewhere) with the `ZERO_*` variables set. It replicates from Postgres and serves WebSockets on port 4848; browsers connect through `VITE_ZERO_URL`.

For a slow-query investigation, set `ZERO_QUERY_HYDRATION_STATS=true`, redeploy zero-cache, then restore `false`.

### WhatsApp gateway (optional)

```bash
bun run whatsapp:start   # GoWA on http://localhost:3100; pair by QR code
```

- Both Compose files pin `ghcr.io/aldinokemal/go-whatsapp-web-multidevice:v9.6.0`. Upgrade by changing the tag; keep the storage volume and `WHATSAPP_WEBHOOK_SECRET`.
- GoWA downloads and caches its own dashboard under `/app/storages/ui/`, which needs GitHub access on first start. For an offline build, see [upstream](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/v9.6.0/readme.md#web-dashboard-gowa-ui). Log in with `WHATSAPP_AUTH_USER` and `WHATSAPP_AUTH_PASS`; production uses the GoWA Tailscale URL.
- Webhook events must be `message`, not `message.poll_vote`; the app reads votes from `payload.poll`.
- For local webhooks, run `bun run --cwd apps/web dev --host 0.0.0.0` so Docker reaches `host.docker.internal:${DEV_WEB_PORT:-3001}`.

### Switching WhatsApp to the Cloud API

Messages stay on the gateway until both `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set. Switch in this order:

1. Check every template is approved: `bun run whatsapp:templates status`. Unapproved templates are not sent.
2. Use a number that is neither the gateway's number nor registered in the WhatsApp or WhatsApp Business app.
3. Set `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_VERIFY_TOKEN` and `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID`, then deploy.
4. In Meta's WhatsApp → Configuration page, register `https://<APP_URL>/api/whatsapp/cloud/webhook` with the same verify token and subscribe to `messages`.
5. Set `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, and redeploy.

Template buttons link to production `APP_URL`, so keep `WHATSAPP_CLOUD_PHONE_NUMBER_ID` out of staging and local environments.

## Production checklist

- [ ] PostgreSQL has `wal_level=logical`; `ZERO_UPSTREAM_DB` is unpooled
- [ ] Every required variable is set; the app refuses to start otherwise
- [ ] Migrations applied (`bun run db:migrate`) and admin seeded (`bun run auth:seed-admin`)
- [ ] zero-cache's `ZERO_MUTATE_URL` and `ZERO_QUERY_URL` reach the web app; `VITE_ZERO_URL` is public
- [ ] `BETTER_AUTH_URL` and `CORS_ORIGIN` match the production domain
- [ ] Resend domain verified (SPF and DKIM). Webhook to `https://<app-host>/api/email/webhook` with events `email.bounced` and `email.complained`, its secret in `RESEND_WEBHOOK_SECRET`
- [ ] R2 bucket created; lifecycle rule expires `<R2_KEY_PREFIX>/{attachments,approval-screenshots,kalakriti-inventory,kalakriti-music,kalakriti-scorecards,photos,scheduled-messages}/tmp/` after 24 hours. Durable keys must not expire
- [ ] [Organisation accounts](#organisation-accounts), [books and receipts](#books-and-receipts) and, if used, [Razorpay](#razorpay-setup) set up
- [ ] WhatsApp gateway paired and Immich reachable, if used
- [ ] Social pipeline, if used: `SOCIAL_MEDIA_SIGNING_SECRET` set, token created with `bun run social:token create social-artifacts --scopes events:read,photos:read,signups:read,social:write`, and app_config `social_approver_user_id` names the digest recipient ([social-api.md](docs/architecture/social-api.md))
- [ ] Website rebuilds, if wanted: `WEBSITE_DISPATCH_TOKEN` set; the website's `PUBLIC_EVENTS_URL` is `https://dash.proudindian.ngo/api/public/events`
- [ ] Cloudflare respects origin `Cache-Control` on `/assets/*`
- [ ] The origin is reachable only through Cloudflare: `/api/public/events` rate-limits by `cf-connecting-ip`, which a direct client could forge

## Backups and restore

Production PostgreSQL runs on Dokploy, which backs it up daily. The bucket, schedule, retention and last good run are on the Backups tab of the pi-dash database in Dokploy; check there, and use its Test button for a backup on demand. Dokploy's backup is a `pg_dump` of `POSTGRES_DB` (`pi-dash`), so it holds every schema in that database: `public`, `private`, `pgboss` and zero-cache's own state.

The database backup does not hold:

- Files in R2 (attachments, payment proof, vouchers, receipts, photos). Nothing in this repo backs up the bucket.
- The env. Keep `DATA_ENCRYPTION_KEY` outside the database backup; without it, PANs, bank numbers and donor IDs are unreadable and import hashes stop matching ([env-and-secrets.md](docs/architecture/env-and-secrets.md)). Keep `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `RAZORPAY_WEBHOOK_SECRET`, `ZERO_ADMIN_PASSWORD` and the other secrets with it.
- zero-cache's replica (`/data/zero.db` in the `zero_cache_data` volume) and GoWA's pairing (`whatsapp_data`).

To restore:

1. Stop `web` and `zero-cache`.
2. On the Backups tab choose Restore, pick the bucket and backup file, and enter database `pi-dash`. Dokploy runs `pg_restore --clean --if-exists`, replacing everything in that database.
3. Delete `/data/zero.db*` (or the `zero_cache_data` volume). Wiping the replica is always safe; zero-cache rebuilds it from Postgres and clients resync.
4. Start the stack. `migrate` applies any newer migrations, and the server re-applies the ledger guards (`ensureLedgerTriggers()`) on start.

After a restore:

- Work since the backup is gone and must be re-entered.
- pg-boss is back at the backup's state, so jobs queued then run again. Notifications sent since the backup may go out twice, because the send logs rolled back too.
- Files uploaded since the backup are no longer referenced. The monthly `cleanup-r2-orphans` job (1st, 04:00) deletes them, so re-attach or download them before then.
- Razorpay: run "Sync now" (last three days) or "Import past payments" in Settings → Integrations. Duplicates are skipped ([finance-income.md](docs/architecture/finance-income.md)).
- Re-import give.do payouts and bank statements since the backup, then choose Books → Post pending.

Test a restore into a scratch database every quarter.

## Troubleshooting

### Clients stuck loading or not syncing

zero-cache is down or its replica is wedged. Check its logs and `/keepalive`, `wal_level=logical`, an unpooled `ZERO_UPSTREAM_DB`, and that `ZERO_MUTATE_URL` and `ZERO_QUERY_URL` reach the web app. If those are fine, stop zero-cache, delete `/data/zero.db*` and start it.

### Jobs failing or stuck

The Jobs page (`jobs.manage`) lists jobs by queue and state and retries failed or cancels queued ones. Failed jobs are also copied to the `dead-letter` queue, which nothing processes; retry the original instead. Queue rules are in [jobs.md](docs/architecture/jobs.md).

### Razorpay payments missing

Settings → Integrations shows the mode, last webhook and waiting counts. A 401 in Razorpay's webhook log means `RAZORPAY_WEBHOOK_SECRET` differs from the dashboard. Rows waiting as `sync_failed` or `queued` re-sync on the 6-hourly reconcile or "Sync now"; `no_clearing_account` clears once a clearing account is saved.

### WhatsApp not delivered

On the Cloud API, run `bun run whatsapp:templates status`; unapproved templates are not sent, and permanent errors leave the send log row `failed` with Meta's code. Groups, polls and scheduled messages use GoWA; check it is paired in its dashboard. See [notifications.md](docs/architecture/notifications.md).

### Email not arriving

A bounce or complaint suppressed the address. The user sheet shows "Email delivery"; a `users.edit` holder chooses Resume email. With `RESEND_API_KEY` unset, logs show `email_not_configured`.

### "Saved with a different encryption key"

The log reason is `encrypted_value_unreadable`: the value was encrypted under another `DATA_ENCRYPTION_KEY`. Re-encrypt it under the production key; re-key tooling is in git history. Command-line variables override `.env` and `.env.worktree`, so check a script's target before running it against production.

### Books show "Waiting to post"

Each waiting record has a reason, such as `pick_bank_account` or `no_payment_proof`. Fix the record, then choose Post pending ([finance-books.md](docs/architecture/finance-books.md#posting-runs-and-waiting-to-post)).

## CI

`.github/workflows/ci.yml` runs on pull requests to `master` and on pushes to `master`:

- Checks: `bun run check:types`, `bun run check`, `bun run check:unused`, `bun run test:unit`
- E2E: builds the web app, pushes the schema to a test database, starts zero-cache and runs Playwright in four shards

## Upgrade notes

Steps here are still needed on a fresh environment. Legacy data migrations are listed at the end.

### Organisation accounts

Seeded organisation accounts are dev-only. Before anyone records income, a `finance.manage` user creates the trust's bank, cash, fixed deposit and gateway clearing accounts in Settings → Organisation accounts (`/settings/org-accounts`), with fund source and, for FCRA accounts, the FCRA role. The "Deposited into" picker is empty until then.

### Razorpay setup

Test mode first:

1. Create a Razorpay gateway clearing account in Settings → Organisation accounts.
2. Set `RAZORPAY_KEY_ID` (`rzp_test_…`), `RAZORPAY_WEBHOOK_SECRET` (`openssl rand -hex 32`) and optionally `RAZORPAY_KEY_SECRET`, then restart.
3. In Settings → Integrations, confirm "Connected · test mode", copy the webhook URL, choose the clearing account and save. Adjust the notes keys if the Payment Page's field names differ.
4. On the Razorpay dashboard, in the same mode, add a webhook with that URL, the same secret, and events `payment.captured`, `order.paid`, `refund.processed` and `settlement.processed`.
5. Make a test payment; it appears on the Income page or the Imports tab.
6. Switch to the `rzp_live_…` key and a live-mode webhook. A test key on a production server records nothing.
7. With `RAZORPAY_KEY_SECRET` set, run "Import past payments" (at most 400 days per run) for earlier payments and settlements.

### Books and receipts

After the books, income posting and receipts migrations, a finance admin:

1. Enters opening balances at Finance → Books → Opening balances once the CA has confirmed the audited FY 2025-26 balance sheet. Never seed or script real figures.
2. Chooses Post pending on Finance → Books once. It backfills postings from 1 April 2026 and is safe to repeat; the `ledger-post-pending` job runs daily at 03:30 IST. Then clears the "Waiting to post" list.
3. Fills in Settings → Organisation accounts → Donation receipts (registered name, address, PAN, signatory) and checks the 80G URN and date. Never seed the real values.

- The server creates reference account heads on start; a code clash logs "Books reference data missing".
- Finance admins and super admins get the book-keeping permissions and `donors.receipt` automatically.
- Ledger tables refuse UPDATE, DELETE and TRUNCATE. A reviewed repair must run `SET LOCAL pi_dash.ledger_maintenance = 'on'` in its own transaction.
- Close a year after it ends and the previous year is closed. Enter audited figures after the CA signs.
- Receipt email needs `RESEND_API_KEY` and `EMAIL_FROM`. An invoice line is charged to the audit fee provision only when finance picks "Audit fees payable (provision)" at approval.

### Imports

Contribution CSV, give.do payout and bank statement imports need the organisation accounts above and `DATA_ENCRYPTION_KEY`; without the key, donors are created without PANs and PAN matching is off. The daily `expire-import-rows` job (02:30 IST) clears raw cells 180 days after a batch's last import, and unimported uploads after 30 days.

### Private media cutover

Uploads go to per-user `tmp/` keys that their mutation claims, hence the R2 lifecycle rule. The media reference backfill is already applied in production (October 2026). Disable the R2 public URL and CDN route once authenticated reads are verified. Keep `VITE_CDN_URL` until a release removes its use, and unset it only after that release deploys.

### Kalakriti

The results, two-file music (`0079`, `0080`) and credential-removal migrations apply in order with `bun run db:migrate`; their one-off backfills are gone from the repo. Do not roll back to single-file music code, which cannot hold two files.

### pg-boss event triggers

Event triggers are disabled only on the pg-boss connections, which needs PostgreSQL 17+ and superuser or SET privilege for `event_triggers`. Never disable them on `DATABASE_URL`, `ZERO_UPSTREAM_DB`, a role, a database or globally; Zero needs schema changes. See [jobs.md](docs/architecture/jobs.md).

### Already applied in production (October 2026)

- Vendor parties (`0116_vendor_parties.sql`): vendor details encrypted into `party_private` and `party_bank_account`. `drop_vendor_legacy_details` stops with `vendor_legacy_details still has rows` if any remain; the backfill script is in git history.
- Vendor payment status repair: run on 17 October 2026; script in git history.
- Money in paise (`0118_money_paise.sql`): rupee `amount` columns replaced by `amount_paise`.
- Production finance setup: done on 17 October 2026.
- Expenses head repair: the server moves `EXPENSE_*` heads out from under Corpus donations on start. Where legacy claims exist, clear the Reimbursements filter "Missing payment proof" (add the screenshot or void unpaid claims), then choose Post pending.
