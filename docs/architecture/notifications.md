# Notifications

> **Load when**: `enqueue`, `notify-*` handler, notification topic preferences, WhatsApp poll, webhook proxy, fire-and-forget, group JID, `sync-whatsapp-status`, GoWA gateway.
> **Related**: `jobs.md`, `observability.md`

## Architecture

```
Server function / Zero mutator / auth hook
    → enqueue("notify-*" | "whatsapp-*", payload)
        → packages/jobs/src/handlers/       # pg-boss picks up job
            → packages/notifications/src/   # sendMessage / sendBulkMessage
            → packages/whatsapp/src/        # WhatsApp group ops
```

All async side-effects (notifications, WhatsApp group management, Immich photo sync, R2 object cleanup) → pg-boss `enqueue()` from `@pi-dash/jobs/enqueue`. **Never** call these fns directly from server fns, auth hooks, or mutators. pg-boss = persistence, retry (3 attempts + backoff), DLQ, jobs dashboard visibility.

**Subpath exports**: `@pi-dash/jobs/enqueue` = lean entry — typed payload interfaces + `enqueue()` only, no handler deps. Keeps client bundle free of server-only code. `@pi-dash/jobs` (barrel) re-exports everything incl. `boss.ts`, server-only.

**Exceptions**: `notifyUserDeleted` runs synchronously before user deletion (user row must exist for notification insert via FK constraint).

Enqueue calls for side-effects wrapped in `withFireAndForgetLog` → pg-boss failure doesn't block primary op. Only `await enqueue()` if enqueue IS the primary op.

## Channels

| Channel | Implementation | Config |
|---|---|---|
| In-app inbox | `notification` DB table synced via Zero | No external service; real-time via Zero sync |
| Email | Nodemailer via `@pi-dash/email` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| WhatsApp | Self-hosted gateway | `WHATSAPP_API_URL`; per-user opt-in via phone + preference check |

### Send Flow

`sendMessage()` and `sendBulkMessage()` in `packages/notifications/src/send-message.ts`:

1. Check kill-switch (`isNotificationsDisabled()`) — early return if disabled.
2. Query `notificationTopicPreference` for user's channel preferences (defaults: all enabled).
3. Three parallel promises:
   - **Inbox**: `insertNotification()` to `notification` table (idempotent via unique `idempotencyKey`).
   - **Email**: `sendNotificationEmail()` via nodemailer with `List-Unsubscribe` header.
   - **WhatsApp**: `sendWhatsAppMessage()` via the GoWA gateway with a deterministic `Idempotency-Key` request header.
4. Return `SendMessageResult` with per-channel success status.

`TOPIC_CATALOG` owns each topic's supported-channel allowlist. Both preference
editors and the preference mutators enforce that contract, and domain senders
consume the same lookup. Kalakriti registration and schedule messages use inbox
and WhatsApp while still honoring each recipient's topic preferences.

### In-App Inbox

- **Storage**: `notification` table (id, userId, topicId, title, body, clickAction, imageUrl, read, archived, idempotencyKey, createdAt).
- **Real-time**: Zero syncs `notification` table to client. `useQuery(queries.notification.forCurrentUser())` — reactive, no polling.
- **UI**: `NotificationInbox` component in sidebar user menu. Actions: mark read/unread, archive, mark all read.
- **Retention**: Daily cleanup job (`cleanup-notifications`) deletes archived notifications >90 days and read notifications >180 days.
- **Query limit**: 50 most recent unarchived notifications.

## WhatsApp RSVP Polls

Events with `postRsvpPoll` enabled → WhatsApp poll sent to their team/event group 3 days before start. pg-boss schedule: `send-event-rsvp-polls`, every 15 min.

GoWA gateway (`go-whatsapp-web-multidevice-poll-vote`) sends poll vote webhooks to `/api/whatsapp/webhook`. Votes recorded in `event_rsvp_vote`; "yes" auto-adds user as event member, "no" removes.

**Local dev webhook proxy**: GoWA (Go) can send `Transfer-Encoding: chunked` POSTs. Vite dev server rejects with 400. Run `bun run dev:webhook-proxy` alongside dev server — listens on `:3002`, buffers body, forwards to app on `:3001` with `Content-Length`. Dev `docker-compose.yml` points GoWA's webhook URL to `:3002`. Not needed in prod (Nitro handles direct).

## Topics & Preferences

Topics: `packages/notifications/src/topics.ts`. Each topic has per-channel toggles (inbox + email + WhatsApp) in `notification_topic_preference` table (composite PK: `user_id` + `topic_id`). Default: all channels enabled (no row = enabled).

Kalakriti has separate Registration and Schedule topics so Guardians and
assigned volunteers can control those streams independently.

**Storage model**: DB is sole source of truth. Preferences checked at send-time for all channels. No external sync needed.

**UI**: Users manage prefs via settings (`NotificationsSection`). Admins edit any user (`UserNotificationsForm`). Both use Zero queries/mutators — no server fns.

**Mutators**: `notificationPreference.upsert` (self), `notificationPreference.adminUpsert` (admin, `users.edit` required). Required topics cannot be disabled, and unsupported topic/channel pairs are rejected server-side.

## WhatsApp Gateway (GoWA)

`packages/whatsapp` wraps the self-hosted GoWA (`go-whatsapp-web-multidevice-poll-vote`) REST API. Config: `WHATSAPP_API_URL`, `WHATSAPP_AUTH_USER`, `WHATSAPP_AUTH_PASS`, `WHATSAPP_WEBHOOK_SECRET`.

**Group JID format**: `<numeric-id>@g.us` (example `120363012345678901@g.us`). Users paste JIDs into the WhatsApp group form — admin copies from WhatsApp Web URL.

**User sync**: `sync-whatsapp-status` job (enqueued from `packages/auth/src/index.ts` on user creation/phone change) verifies the user's phone is registered with WhatsApp. Result cached on `user.whatsappStatus`.

**Per-user opt-in**: send-time check combines three conditions:
1. User has a phone number.
2. `whatsappStatus` is verified.
3. `isWhatsAppTopicEnabled(userId, topicId)` — local DB pref.

Any false → skip WhatsApp for that user.

The notification layer derives a stable WhatsApp delivery key from the domain
message key, recipient, and channel, then forwards it to the gateway as the
bounded, ASCII-safe `Idempotency-Key` header. Inbox delivery is deduplicated
locally. The upstream GoWA API does not currently guarantee atomic idempotency
for text sends, so a retry after an ambiguous provider response remains
at-least-once for WhatsApp.

**Group ops**: `whatsapp-add-to-group`, `whatsapp-remove-from-group` jobs — idempotent, retry-safe. Used by RSVP poll vote handler and team-membership mutations.

## Volunteer Self-Join / Leave

`teamEvent.joinAsMember` (self-join) enqueues `notify-added-to-event` (same topic as admin-triggered add). `teamEvent.leaveEvent` (self-remove) enqueues `notify-event-volunteer-left` → bulk message to team leads (queried server-side at mutation time). Topic reuses `EVENTS_INTEREST` (same lead audience, related signal). Idempotency key includes `leftAt` timestamp so leave→rejoin→leave delivers two distinct notifications.

**Webhook**: GoWA POSTs to `/api/whatsapp/webhook` with `WHATSAPP_WEBHOOK_SECRET` header check. Handles poll votes + message status updates.

**Chunked-request proxy**: GoWA (Go) emits `Transfer-Encoding: chunked` POSTs — Vite dev server rejects with 400. `bun run dev:webhook-proxy` buffers body on `:3002`, forwards to `:3001` with `Content-Length`. Prod (Nitro) handles chunked directly — proxy not needed.
