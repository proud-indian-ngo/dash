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
