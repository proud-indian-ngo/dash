# Jobs (`packages/jobs`)

> **Load when**: pg-boss, `enqueue`, job handlers, schedules, retries, DLQ, `singletonKey`, `event_triggers`.
> **Related**: `notifications.md` (what `notify-*` and WhatsApp jobs deliver), `observability.md`, `data-layer.md`

pg-boss runs every asynchronous side effect. Start at `src/handlers/index.ts`, which registers each queue with its options.

## Enqueueing

- Use `enqueue()` from `@pi-dash/jobs/enqueue` for side effects. Never call notification, WhatsApp, Immich or R2 handlers directly from server functions, auth hooks or mutators. Account deletion is the one synchronous send ([notifications](notifications.md)).
- `@pi-dash/jobs/enqueue` is the lean entry, so mutators never pull in handler code. The `@pi-dash/jobs` barrel is server-only.
- Wrap side-effect enqueues in `withFireAndForgetLog()` so a pg-boss failure does not fail the main operation. Await `enqueue()` only when enqueueing is the operation.
- A job that must exist exactly when a write commits is sent in that transaction: `enqueue(name, data, { db: inTransaction(tx) })`.
- Never use `Date.now()` in idempotency or singleton keys. Pass the mutator's deterministic timestamp.
- CLI scripts enqueue with `startJobProducer(databaseUrl)`, which starts no handlers, schedules or migrations. The caller stops it before exit.

## Operations access

`jobs.manage` permits listing operational metadata, queue statistics, retrying failed jobs and cancelling jobs. Retry and cancel take only the stored job ID and queue; request bodies cannot replace payloads. Unrestricted manual enqueue and raw payload/output inspection require `super_admin`. Error output is private too; adding an operational field requires extending the explicit API allowlist.

The R2 deletion worker independently requires `temporary-source` keys to match this deployment's `<prefix>/<surface>/tmp/<user>/<file>` layout before bypassing reference checks. Durable deletion always rechecks references under the key lock.

## Adding a job

Add the payload to `JobPayloads`, the name to `QUEUE_NAMES`, a `boss.work` registration and, if it recurs, a schedule. A schedule for a queue that was never created throws at startup, and every schedule after it is skipped.

## Queue options

`QUEUE_OVERRIDES` in `src/handlers/index.ts` gives each override with its reason.

pg-boss cannot change an existing queue's policy, so handlers must stay safe against duplicates.

`razorpay-sync-payment` is registered by the web server (`apps/web/server/plugins/jobs.ts`), which owns the import rules. It rethrows errors with name and Postgres code only, so pg-boss never stores donor details. See `finance-income.md`.

## Schedules

`src/schedules.ts` holds every cron (IST). The ones with behaviour worth knowing:

- Maintenance schedules that act on current state (fiscal years, circular closing, archive retimestamping, compliance items, the ledger backstop, import-row retention) use `missed: "once"`: an occurrence that came due while the app was down runs once on the next cron pass. Reminders and digests keep the default `skip`, because a send hours late is worse than none.
- `razorpay-reconcile` is scheduled only with `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET`, and never with a test key in production.
- `expire-event-interests` sets `reviewed_at` and leaves `reviewed_by` null. It notifies no one and writes no audit entry. Approve, reject and cancel all require `pending`, so expiry is final.
- `sync-public-events-deploy` runs only with `WEBSITE_DISPATCH_TOKEN`. It sends a `repository_dispatch` to `proud-indian-ngo/website` when the default public events feed changes. The fingerprint is in memory, so the first run after a restart always dispatches; a failed dispatch throws and the next run retries.

## Kalakriti jobs

- Lifecycle and schedule commands enqueue after commit, with singleton keys from the Edition and the transition or schedule revision.
- The 24-hour planned-close reminder rechecks the lifecycle and never closes registration itself.
- `notify-kalakriti-transport-changed` is keyed by the change ID and reloads the assignment before sending.

## Database connection and Zero event triggers

Worker and CLI producer connections use `getJobDatabaseUrl` (`src/database-url.ts`), which appends `-c event_triggers=off` to the session options. Drizzle and Zero keep the original URL with triggers on.

Why: Zero's DDL-start trigger emits a transactional logical message before a standalone `DROP INDEX CONCURRENTLY`, which PostgreSQL then rejects (`0A000`, "must be first action in transaction"). pg-boss issues such drops during index maintenance, which caused repeated `jobs/error` logs unrelated to any application job.

- pg-boss owns only the unsynced `pgboss` schema. Never run application migrations over these connections or publish `pgboss` through Zero.
- Keep the setting session-scoped. Do not put it in the shared database URL, on the role or globally.
- It needs PostgreSQL 17+ and superuser or SET privilege.
