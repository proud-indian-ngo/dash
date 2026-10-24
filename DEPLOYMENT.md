# Deployment

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | `>=20`, for zero-cache and build tools |
| PostgreSQL | `>=17` with `wal_level=logical`; Compose and production use 18 |
| Docker | Local Postgres and the WhatsApp gateway |

External services, each optional unless its variables are required below: Cloudflare R2 (files), Resend (email), Immich (photos), the self-hosted GoWA WhatsApp gateway, Meta's WhatsApp Cloud API and Razorpay.

## Environment variables

Copy `.env.sample` to `.env` locally. Production uses `docker-compose.prod.yml`. Contracts: `packages/env/src/server.ts` and `web.ts` ([loading](docs/architecture/env-and-secrets.md)). "Prod" means required with `NODE_ENV=production`; empty strings are unset. Keep keys, tokens and secrets private.

### Core, auth and encryption

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Session secret |
| `BETTER_AUTH_URL` | Yes | Auth base URL and base of the public events feed's `signUpUrl`. The website accepts only `https://dash.proudindian.ngo/` links, so production must use that origin |
| `CORS_ORIGIN` | Yes | Usually `BETTER_AUTH_URL` |
| `DATA_ENCRYPTION_KEY` | Prod | `openssl rand -base64 32`. Also keys import hashes and receipt QR links. Never change it once data exists. Scripts that write encrypted values must use the production key |
| `COOKIE_DOMAIN` | No | Cross-subdomain cookie domain |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No | Account for `bun run auth:seed-admin` |
| `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` | Prod | [Turnstile](docs/architecture/auth.md#bot-checks) keys |
| `APP_URL` | No | URL in notification footers and receipt QR codes (else `BETTER_AUTH_URL`); keep it serving `/verify/r/*` |
| `APP_NAME`, `VITE_APP_NAME` | No | Server and browser app name |
| `PHOTO_NOTIFICATION_DELAY_SECONDS` | No | Photo notification batching window |

### Zero

| Variable | Required | Purpose |
|---|---|---|
| `VITE_ZERO_URL` | Yes | Public zero-cache URL that browsers connect to; build argument too |
| `ZERO_UPSTREAM_DB` | Yes (zero-cache) | Unpooled PostgreSQL URL for logical replication |
| `ZERO_APP_PUBLICATIONS` | Yes (zero-cache) | Must be `pi_dash_public`; excludes private user fields and auth tables |
| `ZERO_MUTATE_URL`, `ZERO_QUERY_URL` | Yes (zero-cache) | Web app's `/api/zero/mutate` and `/api/zero/query` |
| `ZERO_MUTATE_FORWARD_COOKIES`, `ZERO_QUERY_FORWARD_COOKIES` | No | Forward session cookies |
| `ZERO_ADMIN_PASSWORD` | Prod | zero-cache admin password |
| `ZERO_OPERATOR_PASSWORD` | No | Basic-auth password for `/statz`, `/profz` and `/plannerz`; unlike the admin password, it cannot read application data |
| `ZERO_LOG_LEVEL`, `ZERO_REPLICA_FILE` | No | Log level; SQLite replica path |
| `ZERO_QUERY_HYDRATION_STATS` | No | Row counts on slow-hydration warnings; keep `false` |

### Email (Resend)

`RESEND_API_KEY` and `EMAIL_FROM` are required in production. With the key unset, email is skipped and auth links are logged. `RESEND_WEBHOOK_SECRET` is optional.

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
| `VOUCHER_ORG_*`, `VOUCHER_FINANCE_ADMIN_NAME` | Yes | Organisation and finance admin details printed on cash vouchers |

The treasurer signature (`packages/pdf/assets/signature.png`) is bundled at build time. The cash-voucher limit is a setting (Settings → Programmes).

### WhatsApp gateway (GoWA)

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_WEBHOOK_SECRET` | Yes | Shared with the gateway; validates its webhook calls |
| `WHATSAPP_API_URL` | No | Gateway URL; unset disables the gateway |
| `WHATSAPP_AUTH_USER`, `WHATSAPP_AUTH_PASS` | No | Gateway basic auth |

### WhatsApp Cloud API

All optional. See [Switching WhatsApp to the Cloud API](#switching-whatsapp-to-the-cloud-api).

| Variable | Where to find it |
|---|---|
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | System user token, expiry Never, permissions `whatsapp_business_messaging` and `whatsapp_business_management` |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | WhatsApp → API Setup (the ID, not the number) |
| `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID` | The WhatsApp Business Account ID, not the portfolio ID; also used by `bun run whatsapp:templates` |
| `WHATSAPP_CLOUD_APP_SECRET` | App settings → Basic |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | Any random string, also entered as the webhook verify token in Meta |

### Immich

| Variable | Required | Purpose |
|---|---|---|
| `VITE_IMMICH_URL` | No | Public Immich URL; unset disables photos |
| `IMMICH_API_KEY` | No | Immich API key |
| `IMMICH_INTERNAL_URL` | No | Direct URL for server jobs, e.g. `http://immich-server:2283`, avoiding Cloudflare's 100 MB body limit; falls back to `VITE_IMMICH_URL` |

### Razorpay

All optional; ingestion is on only when both `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set. With the webhook secret unset, the webhook answers 404. Without `RAZORPAY_KEY_SECRET`, settlements and "Import past payments" are off.

### Social API and website

| Variable | Required | Purpose |
|---|---|---|
| `SOCIAL_MEDIA_SIGNING_SECRET` | No | `openssl rand -hex 32`. Signs 36-hour photo links; rotating it invalidates issued links |
| `WEBSITE_DISPATCH_TOKEN` | No | Fine-grained GitHub token for `proud-indian-ngo/website` only, Contents read and write. The `sync-public-events-deploy` job checks `/api/public/events` every 5 minutes and sends `events-changed` `repository_dispatch` when the feed changes |

### Governance

| Variable | Required | Purpose |
|---|---|---|
| `SIGNING_SERVICE_URL` | Yes | Internal URL of `services/signing` (`http://signing:8080` in `docker-compose.prod.yml`). Issuing circulars, making minutes and recording declarations need it; unset, they fail with "needs the signing service" and signed uploads are refused |
| `SIGNING_SERVICE_TOKEN` | Yes | Bearer token shared with the signing service, 16+ characters (`openssl rand -hex 32`) |

### Observability

| Variable | Required | Purpose |
|---|---|---|
| `APP_ENV` | No | Environment on logs and PostHog events; Prod Compose sets `production` and passes it to the build as `VITE_APP_ENV` |
| `APP_RELEASE` | No | Commit SHA on logs and errors. The Docker build reads it from `.git` (also as `VITE_APP_RELEASE`); empty when `.git` is absent |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTLP logs endpoint, used only when `POSTHOG_API_KEY` is unset |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | No | Server key; exports logs to PostHog over OTLP, taking precedence over `OTEL_EXPORTER_OTLP_ENDPOINT`, and sends server errors to Error Tracking |
| `OTEL_SERVICE_NAME` | No | Service name on server logs |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | No | Browser pageviews and exception capture; unset disables them. Turn on **Discard client IP data** in the PostHog project |
| `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID` | No | Build only: [source map](docs/architecture/observability.md#posthog) upload. Key: a personal API key with `error_tracking:write`, passed as a BuildKit secret; `docker-compose.prod.yml` defaults the project. Secrets are outside BuildKit's cache key, so a new key or failed upload takes effect on the next new commit; redeploying a built commit shows the step `CACHED` |
| `ZERO_OTEL_LOGS_EXPORTER`, `ZERO_OTEL_LOGS_ENDPOINT`, `ZERO_OTEL_HEADERS` | No | zero-cache log export; default `none`. For PostHog: `otlp`, `<host>/i/v1/logs`, `Authorization=Bearer <phc_ project token>` |
| `ZERO_OTEL_METRICS_EXPORTER`, `ZERO_OTEL_METRICS_ENDPOINT` | No | zero-cache metric export (replication and serving lag, WAL, connections); default `none`. For PostHog (Metrics is in alpha; enable it in the project first): `otlp`, `<host>/i/v1/metrics`. Shares `ZERO_OTEL_HEADERS`, so its key must be the `phc_` project token |

### Production Compose and tooling

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Prod Compose | Postgres credentials; Compose builds `DATABASE_URL` and the Zero URLs from them |
| `TS_AUTHKEY`, `TAILSCALE_CONFIG_DIR` | Prod Compose | Tailscale sidecar for Postgres |
| `PORT` | Prod Compose | Web port zero-cache calls; default 3000 |
| `WEB_INTERNAL_URL` | Prod Compose | Origin zero-cache calls for `ZERO_MUTATE_URL` and `ZERO_QUERY_URL`; default `http://web:$PORT`. Set it when web runs outside this Compose stack |
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

Apply migrations with `bun run db:migrate` (`db:push` is for local development only). The web container applies them, then prepares the Zero publication, before it starts listening; a failure exits it before it is healthy, so a rolling deploy keeps the old container. Keep schema changes Zero-compatible: add columns with defaults, deploy, then drop old columns in a later release. A migration that drops a column the old build reads ships with the regenerated Zero schema and web build; stop old app and Zero workers first.

Seed the admin with `bun run auth:seed-admin` (idempotent), with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set.

## Build

In Docker, `VITE_*` variables are build arguments. Pin `rocicorp/zero` in `docker-compose.prod.yml` to the same minor as the `@rocicorp/zero` catalog version. Image stages are described in [monorepo.md](docs/architecture/monorepo.md#docker-build).

## Running

### Web app

The production container listens internally on port 3000; local development uses 3001. Its container health check is `/api/version`, which never touches the database: `/api/health` also checks Postgres, and a container failing its check leaves Traefik's routing, so a Postgres restart would take the web app down with it. Keep `/api/health` for monitoring.

Hashed chunks under `/assets/*` are cached `immutable` for a year; a missing chunk returns 404 with `no-store` and the client reloads once. The error screen's Reload first calls `/api/clear-cache`, whose `Clear-Site-Data: "cache"` drops a chunk the browser cached broken; phones have no hard-refresh shortcut. Proxies must pass that header through. If an upstream cache retained a bad `/assets/*` response, purge those entries.

### Zero cache

zero-cache runs separately (the `rocicorp/zero` image in production, `npx zero-cache` elsewhere) with the `ZERO_*` variables set. It replicates from Postgres and serves WebSockets on port 4848; browsers connect through `VITE_ZERO_URL`.

The web container prepares `pi_dash_public` from the generated Zero schema after database migrations. Custom starts must run `bun packages/zero/scripts/prepare-publication.ts` against the upstream database and set `ZERO_APP_PUBLICATIONS=pi_dash_public`. The client schema alone cannot hide columns. Changing publications rebuilds the replica and can cause replication downtime; allow initialization to finish before serving traffic. Old clients requiring removed private fields must reload. Never retain a broader publication alongside this one.

zero-cache logs, with literal values redacted, slow hydrations and advancements (over 100 ms), planner warnings for reads no index covers, and `query-stats` events every minute ranking query shapes by time. For row counts on the slow warnings, set `ZERO_QUERY_HYDRATION_STATS=true`, redeploy zero-cache, then restore `false`. CPU profiles (`/profz`) and planner statistics (`/plannerz`) take `ZERO_OPERATOR_PASSWORD`.

### Signing service

`services/signing` runs as `signing`, reachable only from the web service. Deploy it before the web app when both change. `SIGNING_TSA_URL` names its timestamp authority (default `http://timestamp.digicert.com`, `none` to disable) and `SIGNING_ALLOW_FETCHING=true` lets it fetch revocation data; it needs outbound access to both.

The DSC helper calls `/api/signing/jobs/<token>` on `APP_URL` (or `BETTER_AUTH_URL`). Its release and Windows driver check are in [its README](services/signing-helper/README.md).

When a change spans the helper, release in this order, since the dashboard refuses helpers older than `MIN_HELPER_VERSION` and web must not deploy before the release exists:

1. Merge, then push the tag `signing-helper-vX.Y.Z`.
2. Approve the `signing-helper-release` environment and wait for the release. Confirm it has the `.dmg`, the app `.zip`, the `.exe`, `pidash-sign-manifest.json` and its `.sig`.
3. Deploy the signing service, then web.

### WhatsApp gateway (optional)

GoWA runs outside this repo's Compose files, in development and production. Point `WHATSAPP_API_URL` and `WHATSAPP_AUTH_*` at it, and configure the gateway with:

- Webhook URL `<app>/api/whatsapp/webhook` and secret `WHATSAPP_WEBHOOK_SECRET`.
- Webhook events `message,message.ack`. `message` carries poll votes (the app reads `payload.poll`; `message.poll_vote` won't do), and `message.ack` the delivery and read receipts for the Notification delivery page.
- For a gateway in Docker posting to a local dev server, run `bun run --cwd apps/web dev --host 0.0.0.0` so it reaches `host.docker.internal:${DEV_WEB_PORT:-3001}`.

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
- [ ] Resend domain verified (SPF and DKIM). Webhook to `https://<app-host>/api/email/webhook` with events `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`, its secret in `RESEND_WEBHOOK_SECRET`
- [ ] R2 bucket created; lifecycle rule expires `<R2_KEY_PREFIX>/{attachments,approval-screenshots,kalakriti-inventory,kalakriti-music,kalakriti-scorecards,photos,scheduled-messages,governance}/tmp/` after 24 hours. Durable keys must not expire
- [ ] [Organisation accounts](#organisation-accounts), [books and receipts](#books-and-receipts) and, if used, [Razorpay](#razorpay-setup) set up
- [ ] WhatsApp gateway paired and Immich reachable, if used
- [ ] Social pipeline, if used: `SOCIAL_MEDIA_SIGNING_SECRET` set, token created with `bun run social:token create social-artifacts --scopes events:read,photos:read,signups:read,social:write`, and app_config `social_approver_user_id` names the digest recipient ([social-api.md](docs/architecture/social-api.md))
- [ ] Website rebuilds, if wanted: `WEBSITE_DISPATCH_TOKEN` set; the website's `PUBLIC_EVENTS_URL` is `https://dash.proudindian.ngo/api/public/events`
- [ ] Any upstream cache respects origin `Cache-Control` on `/assets/*`
- [ ] Dokploy routes the web domain through Traefik to container port 3000; no web host port is published
- [ ] Traefik's `forwardedHeaders.trustedIPs` lists Cloudflare's IPv4 and IPv6 ranges, matching `apps/web/src/lib/client-ip.ts` ([rate limiter](docs/architecture/caching.md#rate-limiter)); `insecure` and `notAppendXForwardedFor` stay false. Until it lists the IPv6 ranges, the origin has no AAAA record
- [ ] The origin accepts web traffic only from Cloudflare, whose peers may set `X-Forwarded-For`. `cf-origin-firewall` on the host enforces it (Docker bypasses `ufw`), so every site there needs a proxied record; keep its ranges current

## Backups and restore

Daily database backups, what they leave out, and the restore steps are in [backups.md](docs/backups.md).

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

## Upgrade notes

Steps here are still needed on a fresh environment.

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
3. Fills in Settings → Organisation accounts → Donation receipts (name, address, PAN, signatory, signature; issuing needs the signature) and checks the 80G URN and date. Never seed the real values.

- The server creates reference account heads on start; a code clash logs "Books reference data missing".
- Finance admins and super admins get the book-keeping permissions and `donors.receipt` automatically.
- Ledger tables refuse UPDATE, DELETE and TRUNCATE. A reviewed repair must run `SET LOCAL pi_dash.ledger_maintenance = 'on'` in its own transaction.
- Close a year after it ends and the previous year is closed. Enter audited figures after the CA signs.
- Receipt email needs `RESEND_API_KEY` and `EMAIL_FROM`. An invoice line is charged to the audit fee provision only when finance picks "Audit fees payable (provision)" at approval.

### Imports

Contribution CSV, give.do payout and bank statement imports need the organisation accounts above and `DATA_ENCRYPTION_KEY`; without the key, donors are created without PANs and PAN matching is off. The daily `expire-import-rows` job (02:30 IST) clears raw cells 180 days after a batch's last import, and unimported uploads after 30 days.

### Private media cutover

Uploads go to per-user `tmp/` keys that their mutation claims, hence the R2 lifecycle rule. The bucket has no public route. Unset `VITE_CDN_URL` once a release that no longer uses it deploys.

### Kalakriti

Do not roll back past the two-file music migrations (`0079`, `0080`) to single-file music code, which cannot hold two files.

### pg-boss event triggers

Event triggers are disabled only on the pg-boss connections, which needs PostgreSQL 17+ and superuser or SET privilege for `event_triggers`. Never disable them on `DATABASE_URL`, `ZERO_UPSTREAM_DB`, a role, a database or globally; Zero needs schema changes. See [jobs.md](docs/architecture/jobs.md).

### Cost centres

`0155_cost_centres` to `0157_drop_city` swap `city` for `cost_centre_id`, dropping columns the old build reads ([Database setup](#database-setup)).

Before deploying, list Mumbai-series occurrences saved as Bangalore. The backfill fixes `fixed_by_backfill` rows (see the `0156` header); fix others by hand once deployed:

```sql
SELECT c.id, p.name AS series, c.original_date,
  (c.created_at = c.updated_at AND p.updated_at <= c.created_at) AS fixed_by_backfill
FROM team_event c JOIN team_event p ON p.id = c.series_id
WHERE c.city = 'bangalore' AND p.city = 'mumbai';
```

Then count requests whose city isn't their event's:

```sql
WITH event_city AS (
  SELECT e.id, CASE WHEN e.city = 'bangalore' AND p.city = 'mumbai'
      AND e.created_at = e.updated_at AND p.updated_at <= e.created_at
    THEN 'mumbai' ELSE e.city::text END AS city
  FROM team_event e LEFT JOIN team_event p ON p.id = e.series_id
)
SELECT
  (SELECT count(*) FROM reimbursement r JOIN event_city e ON e.id = r.event_id
     WHERE r.city::text <> e.city) AS reimbursements,
  (SELECT count(*) FROM vendor_payment v JOIN event_city e ON e.id = v.event_id
     WHERE v.city::text <> e.city) AS vendor_payments;
```

The migration's own counts: `SELECT value FROM app_config WHERE key = 'cost_centre_backfill';`.

The next posting run reposts every expense posting (rules version 3).

### Lead approval

Lead approval keeps already-pending requests with finance. Unsyncing payee bank columns rebuilds the replica; clients reload ([details](#zero-cache)).
