# Jobs (`packages/jobs`)

> **Load when**: pg-boss, `enqueue`, job handler, job schedule, cron, retry, DLQ, `singletonKey`, `createNotifyHandler`, handler registration, `event_triggers`.
> **Related**: `notifications.md` (what `notify-*` and WhatsApp jobs deliver), `observability.md`, `data-layer.md`

pg-boss runs every asynchronous side effect.

| Concept | Location |
|---|---|
| Lazy-started pg-boss singleton | `src/boss-instance.ts` |
| Typed `enqueue(name, payload)` and `QUEUE_NAMES` | `src/enqueue.ts` |
| Payload interfaces and the `JobPayloads` map | `src/types.ts` |
| Queue options and `boss.work` registration | `src/handlers/index.ts` |
| `createNotifyHandler()` (request logger, success and error logging) | `src/handlers/create-handler.ts` |
| Cron schedules | `src/schedules.ts` |
| CLI producer | `src/producer.ts` |

## Enqueueing

- Use `enqueue()` from `@pi-dash/jobs/enqueue` for side effects. Never call notification, WhatsApp, Immich or R2 handlers directly from server functions, auth hooks or mutators. Account deletion is the one synchronous send ([notifications](notifications.md)).
- `@pi-dash/jobs/enqueue` is the lean entry: payload types and `enqueue()` only, so mutators never pull in handler code. The `@pi-dash/jobs` barrel is server-only.
- Wrap side-effect enqueues in `withFireAndForgetLog()` so a pg-boss failure does not fail the main operation. Await `enqueue()` only when enqueueing is the operation.
- Never use `Date.now()` in idempotency or singleton keys. Pass the mutator's deterministic timestamp.
- `startJobProducer(databaseUrl)` lets a CLI script enqueue against an explicit database without starting handlers, schedules or migrations. The caller stops it before exit.

## Adding a job

1. Add the payload to `JobPayloads` in `src/types.ts`.
2. Add the name to `QUEUE_NAMES` in `src/enqueue.ts`. A schedule for a queue that was never created throws at startup, and every schedule after it is skipped.
3. Register `boss.work` in `src/handlers/index.ts`, with any queue override.
4. Add a schedule in `src/schedules.ts` if it recurs.

## Queue defaults and overrides

Defaults: 3 retries with backoff from 5 seconds, 15-minute expiry, dead-letter queue `dead-letter`. Notify queues poll every 5 seconds.

| Queue | Override | Why |
|---|---|---|
| `flush-held-notifications` | `exclusive`, no retry, 60 s heartbeat | One flush at a time; unsent claims pass to a later run after a lease (see [batching](notifications.md#batching)) |
| `generate-cash-voucher` | `stately`, key `voucher-<lineItemId>` | Repeated requests collapse; an edit during a render queues one more |
| `ledger-post-source` | `stately`, key `type:id` | A burst of edits to one source collapses |
| `ledger-post-pending` | `singleton`, no retry, 1 h expiry, heartbeat | One sweep at a time; it stops itself after 45 minutes |
| `razorpay-sync-payment` | `stately`, key = payment ID | Repeated webhook deliveries collapse |
| `razorpay-sync-refund`, `razorpay-sync-settlement` | `stately`, 8 retries, 1 min doubling to 1 h | Razorpay may not show a refund as processed yet |
| `razorpay-reconcile` | `exclusive`, no retry, 4 h expiry, heartbeat | Runs never overlap; a dead run fails within minutes |
| `send-scheduled-whatsapp` | DLQ `dead-letter-scheduled-whatsapp` | Separate dead letters for scheduled messages |

pg-boss cannot change an existing queue's policy, so handlers must stay safe against duplicates.

`razorpay-sync-payment` is registered by the web server (`apps/web/server/plugins/jobs.ts`), which owns the import rules. It rethrows errors with name and Postgres code only, so pg-boss never stores donor details; after the last retry the import row waits as `sync_failed`. See `finance-income.md`.

## Schedules

`src/schedules.ts` holds every cron (IST). The ones with behaviour worth knowing:

| Job | When | Does |
|---|---|---|
| `flush-held-notifications` | every minute | Sends held email and WhatsApp; trims the WhatsApp send log to 90 days |
| `send-event-rsvp-polls` | every 15 min | RSVP polls for events with `postRsvpPoll`, at each event's `rsvpPollLeadMinutes` before start (default 3 days) |
| `expire-event-interests` | daily 00:00 | Marks `pending` interests in started events `expired` |
| `cleanup-notifications` | daily 02:00 | Deletes archived inbox rows after 90 days, read rows after 180 |
| `ensure-fiscal-years` | 1st of month | Keeps the current and next fiscal year and periods (`packages/db/src/fiscal-years.ts`) |
| `razorpay-reconcile` | every 6 h | Only with `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET`, never a test key in production; unscheduled otherwise |
| `sync-public-events-deploy` | every 5 min | Only with `WEBSITE_DISPATCH_TOKEN`; unscheduled otherwise |

`expire-event-interests` (`packages/db/src/event-interest-expiry.ts`) sets `reviewed_at` to the run time and leaves `reviewed_by` null. It notifies no one and writes no audit entry; volunteers see "Not reviewed". Approve, reject and cancel all require `pending`, so expiry is final.

`sync-public-events-deploy` sends an `events-changed` `repository_dispatch` to `proud-indian-ngo/website` when the default public events feed changes, which rebuilds the site. The fingerprint is in memory, so the first run after a restart always dispatches; a failed dispatch throws and the next run retries.

## Kalakriti jobs

- Lifecycle and schedule commands enqueue after commit, with singleton keys from the Edition and the transition or schedule revision.
- Opening registration schedules the 24-hour planned-close reminder. The reminder rechecks the lifecycle and never closes registration itself.
- Published Session, Competition, Venue and Age Category label or order changes enqueue the same affected-recipient schedule job.
- Center vehicle or driver changes enqueue `notify-kalakriti-transport-changed` keyed by the change ID. The handler reloads the assignment and sends only to that Center's active Guardians and Liaisons, reusing the change ID in per-recipient message keys.

## Database connection and Zero event triggers

Worker and CLI producer connections use `getJobDatabaseUrl` (`src/database-url.ts`), which appends `-c event_triggers=off` to the session options. Drizzle and Zero keep the original URL with triggers on.

Why: Zero's DDL-start trigger emits a transactional logical message before a standalone `DROP INDEX CONCURRENTLY`, which PostgreSQL then rejects (`0A000`, "must be first action in transaction"). pg-boss issues such drops during index maintenance, which caused repeated `jobs/error` logs unrelated to any application job.

- pg-boss owns only the unsynced `pgboss` schema. Never run application migrations over these connections or publish `pgboss` through Zero.
- Keep the setting session-scoped. Do not put it in the shared database URL, on the role or globally.
- It needs PostgreSQL 17+ and superuser or SET privilege. Compose and production run PostgreSQL 18.
