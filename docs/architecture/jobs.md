# Jobs (`packages/jobs`)

> **Load when**: pg-boss, `enqueue`, job handler, job schedule, cron, retry, DLQ, `singletonKey`, `createNotifyHandler`, `notify-*`, handler registration.
> **Related**: `notifications.md`, `observability.md`, `data-layer.md`

pg-boss–backed job queue. All async side-effects (notifications, integrations, cleanup). Handlers live in `src/handlers/`.

| Concept | Location | Notes |
|---|---|---|
| Queue init | `src/boss-instance.ts` | Singleton pg-boss, lazy-started |
| Enqueue API | `src/enqueue.ts` | Typed `enqueue(name, payload)` — lean entry for mutators |
| CLI producer | `src/producer.ts` | `startJobProducer(databaseUrl)` uses an explicitly selected database without starting handlers, schedules, or migrations; the caller stops it before exit |
| Payload types | `src/types.ts` | All payload interfaces + `JobPayloads` map |
| Handler registration | `src/handlers/index.ts` | Imports all handlers, registers with pg-boss |
| Handler wrapper | `src/handlers/create-handler.ts` | `createNotifyHandler()` — adds `createRequestLogger`, success/error logging |
| Schedules | `src/schedules.ts` | Cron schedules (reminders, polls, cleanup) |

## Handler Categories

- `notify-*` — domain notification delivery
- `process-*` / `remind-*` / `send-*` — event reminders, RSVP polls, digests
- `immich-*` — photo sync
- `whatsapp-*` — group management
- `sync-*` — WhatsApp status
- `generate-*` — cash voucher PDF
- `delete-*` / `cleanup-*` — R2, stale data, old notifications

## Idempotency Rule

**Never use `Date.now()` in notification idempotency keys**. Pass deterministic timestamp from the mutator.

Kalakriti lifecycle and schedule commands enqueue post-commit jobs with
singleton keys derived from the Edition and transition or schedule revision.
Opening registration separately schedules the 24-hour planned-close reminder;
the reminder handler rechecks the Edition lifecycle and never closes registration.
Published Session, Competition label, Venue label, and Age Category label/order
changes enqueue the same affected-recipient schedule job.

Center vehicle/driver updates enqueue `notify-kalakriti-transport-changed` with
an assignment/change-ID singleton key. The handler reloads the assignment and
resolves only that Center's active Guardian and Liaison recipients; delivery
uses the same change ID for deterministic per-recipient message keys.


## Zero DDL trigger compatibility

Worker and CLI producer connections derive their URL through `getJobDatabaseUrl`, retaining existing connection settings and appending `-c event_triggers=off` to PostgreSQL session options. pg-boss owns only the unsynced `pgboss` schema. Never use these connections for application schema migrations or publish the pg-boss schema through Zero. Drizzle and Zero connections retain the original URLs and enabled event triggers.

On PostgreSQL 18.3 with Zero 1.9, Zero's DDL-start trigger emits a transactional logical message before a standalone `DROP INDEX CONCURRENTLY`. PostgreSQL then rejects the drop with SQLSTATE `0A000`, “DROP INDEX CONCURRENTLY must be first action in transaction”. pg-boss can issue this during background index migration repair or cleanup after reindexing, causing repeated `jobs/error` logs. The error does not identify a failed application job.

A disposable reproduction using Zero's installed `createEventFunctionStatements` and `createEventTriggerStatements` confirmed: the index drop succeeds before those triggers are installed, fails afterward, and succeeds with event triggers off on that connection. A separate connection still has the setting on and emits Zero DDL events for application-table changes. This is session-scoped; do not set it in the shared database URL, on the database role, or globally.

The setting requires PostgreSQL 17+ and superuser or suitable SET privilege. Current Compose and production use PostgreSQL 18. See [PostgreSQL's setting documentation](https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-EVENT-TRIGGERS). Deploying the application recreates the dedicated job pool with the option; it does not require a database restart or a Zero upgrade. After deployment, inspect pg-boss maintenance status and confirm the repeated error stops rather than suppressing its log.
