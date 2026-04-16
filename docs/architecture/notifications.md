# Notifications

> **Load when**: `enqueue`, Courier, WhatsApp, poll, RSVP, `notify-*` handler, notification topic preferences, webhook proxy, fire-and-forget.
> **Related**: `jobs.md`, `observability.md`

## Architecture

```
Server function / Zero mutator / auth hook
    → enqueue("notify-*" | "sync-*" | "whatsapp-*", payload)
        → packages/jobs/src/handlers/       # pg-boss picks up job
            → packages/notifications/src/   # notifications
            → packages/whatsapp/src/        # WhatsApp group ops
            → Courier API                   # user profile sync
```

All async side-effects (notifications, Courier sync, WhatsApp group management, Immich photo sync, R2 object cleanup) → pg-boss `enqueue()` from `@pi-dash/jobs/enqueue`. **Never** call these fns directly from server fns, auth hooks, or mutators. pg-boss = persistence, retry (3 attempts + backoff), DLQ, jobs dashboard visibility.

**Subpath exports**: `@pi-dash/jobs/enqueue` = lean entry — typed payload interfaces + `enqueue()` only, no handler deps. Keeps client bundle free of server-only code. `@pi-dash/jobs` (barrel) re-exports everything incl. `boss.ts`, server-only.

**Exceptions**: `notifyUserDeleted` runs synchronously before user deletion (Courier needs user to still exist).

Enqueue calls for side-effects wrapped in `withFireAndForgetLog` → pg-boss failure doesn't block primary op. Only `await enqueue()` if enqueue IS the primary op.

## Channels

| Channel | Provider | Config |
|---|---|---|
| In-app inbox | Courier | `COURIER_API_KEY`; client-side JWT from `functions/courier-token.ts` |
| Email | Courier | Routed through Courier's email channel |
| WhatsApp | Self-hosted gateway | `WHATSAPP_API_URL`; per-user opt-in via phone + preference check |

## WhatsApp RSVP Polls

Events with `postRsvpPoll` enabled → WhatsApp poll sent to their team/event group 3 days before start. pg-boss schedule: `send-event-rsvp-polls`, every 15 min.

GoWA gateway (`go-whatsapp-web-multidevice-poll-vote`) sends poll vote webhooks to `/api/whatsapp/webhook`. Votes recorded in `event_rsvp_vote`; "yes" auto-adds user as event member, "no" removes.

**Local dev webhook proxy**: GoWA (Go) can send `Transfer-Encoding: chunked` POSTs. Vite dev server rejects with 400. Run `bun run dev:webhook-proxy` alongside dev server — listens on `:3002`, buffers body, forwards to app on `:3001` with `Content-Length`. Dev `docker-compose.yml` points GoWA's webhook URL to `:3002`. Not needed in prod (Nitro handles direct).

## Topics & Preferences

Topics: `packages/notifications/src/topics.ts`. Each topic has per-channel toggles (email + WhatsApp) in `notification_topic_preference` table (composite PK: `user_id` + `topic_id`). Default: both channels enabled (no row = enabled).

**Storage model**: Local DB is source of truth. Email prefs sync one-way to Courier via `sync-courier-preference` pg-boss job (enqueued from Zero mutator's async task). Job reverts DB on Courier failure **only if** pref hasn't changed since job enqueued. WhatsApp prefs checked at send-time from local DB (`isWhatsAppTopicEnabled`), not via Courier.

**UI**: Users manage prefs via settings (`NotificationsSection`). Admins edit any user (`UserNotificationsForm`). Both use Zero queries/mutators — no server fns.

**Mutators**: `notificationPreference.upsert` (self), `notificationPreference.adminUpsert` (admin, `users.edit` required). Required topics cannot be disabled (server-side guard).
