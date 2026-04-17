# Jobs (`packages/jobs`)

> **Load when**: pg-boss, `enqueue`, job handler, job schedule, cron, retry, DLQ, `singletonKey`, `createNotifyHandler`, `notify-*`, 42 handlers.
> **Related**: `notifications.md`, `observability.md`, `data-layer.md`

pg-boss–backed job queue. All async side-effects (notifications, integrations, cleanup). 42 handlers in `src/handlers/`.

| Concept | Location | Notes |
|---|---|---|
| Queue init | `src/boss-instance.ts` | Singleton pg-boss, lazy-started |
| Enqueue API | `src/enqueue.ts` | Typed `enqueue(name, payload)` — lean entry for mutators |
| Payload types | `src/types.ts` | All payload interfaces + `JobPayloads` map |
| Handler registration | `src/handlers/index.ts` | Imports all handlers, registers with pg-boss |
| Handler wrapper | `src/handlers/create-handler.ts` | `createNotifyHandler()` — adds `createRequestLogger`, success/error logging |
| Schedules | `src/schedules.ts` | Cron schedules (reminders, polls, cleanup) |

## Handler Categories

- `notify-*` — 12 notification types
- `process-*` / `remind-*` / `send-*` — event reminders, RSVP polls, digests
- `immich-*` — photo sync
- `whatsapp-*` — group management
- `sync-*` — WhatsApp status
- `generate-*` — cash voucher PDF
- `delete-*` / `cleanup-*` — R2, stale data, old notifications

## Idempotency Rule

**Never use `Date.now()` in notification idempotency keys**. Pass deterministic timestamp from the mutator.
