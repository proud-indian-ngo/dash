# Notifications

> **Load when**: notification batching or digests, `held_notification`, `flush-held-notifications`, `enqueue`, `notify-*` handler, notification topic preferences, WhatsApp poll, webhook proxy, fire-and-forget, group JID, `sync-whatsapp-status`, GoWA gateway.
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

**Account deletion**: capture the recipient's enabled email delivery before deleting the user, then send the confirmation only after deletion succeeds. Deleted accounts do not receive inbox notifications because those rows require a live user foreign key.

Enqueue calls for side-effects wrapped in `withFireAndForgetLog` → pg-boss failure doesn't block primary op. Only `await enqueue()` if enqueue IS the primary op.

## Channels

| Channel | Implementation | Config |
|---|---|---|
| In-app inbox | `notification` DB table synced via Zero | No external service; real-time via Zero sync |
| Email | Resend via `@pi-dash/email` | `RESEND_API_KEY`, `EMAIL_FROM` (both required in production; unset elsewhere skips sending with an `email_not_configured` warning); `RESEND_WEBHOOK_SECRET` for bounce and complaint events |
| WhatsApp | Self-hosted gateway | `WHATSAPP_API_URL`; per-user opt-in via phone + preference check |

### Send Flow

`sendMessage()` and `sendBulkMessage()` in `packages/notifications/src/send-message.ts`:

1. Check kill-switch (`isNotificationsDisabled()`) — early return if disabled.
2. Query `notificationTopicPreference` for user's channel preferences (defaults: all enabled).
3. Three parallel promises:
   - **Inbox**: `insertNotification()` to `notification` table (idempotent via unique `idempotencyKey`).
   - **Email**: `sendNotificationEmail()` (one recipient, key `{key}-email`) or `sendBulkNotificationEmails()` (Resend's batch endpoint, 100 per request, recipients sorted by user id, key `{key}-email-{chunk}`). The first attempt's recipient list is stored in `private.email_batch_recipients` under its key, and a retried job resends that list rather than re-reading preferences: Resend rejects a reused key whose payload changed (`409 invalid_idempotent_request`). Snapshots are replaced after 23 hours, inside Resend's 24-hour key window, and deleted after two days. `sendEmail()` and `sendEmailBatch()` space requests 250ms apart, retry `rate_limit_exceeded` up to three times, time out after 10s, and add a plain-text part generated from the HTML; skipped or failed sends report `false`.
   - Email lookups (`getUserEmail`, `getBulkUserEmails`) leave out addresses on the suppression list, so suppressed users get inbox and WhatsApp only.
   - **WhatsApp**: `sendWhatsAppMessage()` via the GoWA gateway with a deterministic `Idempotency-Key` request header.
   - **Batched topics**: email and WhatsApp are held rather than sent; see [Batching](#batching).
4. Return `SendMessageResult` with per-channel success status.

### Batching

Email and WhatsApp DMs are held for a short window and sent together, so a burst of activity (seven invoices logged in two minutes) reaches each person as one message instead of seven. The in-app inbox is never held.

- **Which topics**: every topic except those marked `sendImmediately` in `TOPIC_CATALOG` (Account, Kalakriti Schedule, Kalakriti Transport). `isBatchedTopic()` is the lookup.
- **Which messages skip it**: a send with `immediate: true` goes out at once in any topic. It's set where the words go stale within the window: event reminders ("starts in 30 min"), event updates (time or place) and cancellations, and the admin `send-notification` and `send-scheduled-message` jobs.
- **Hold**: for a batched topic, `sendMessage()`/`sendBulkMessage()` write the inbox row as usual, check preferences, suppression and WhatsApp eligibility as they would to send, and call `holdNotification()` (`src/batching.ts`) for the recipients that pass. It stores the message once in `private.held_notification` (keyed by the message idempotency key, with its rendered email HTML and WhatsApp text) and one `private.held_notification_recipient` row per recipient and channel. Retried jobs hold nothing twice. A key already held with a different title or body is logged (`held_notification_key_reused`): two messages sharing a key would give later recipients the first one's words. If the hold can't be stored, it throws and the notify job fails and is retried; nothing is lost silently.
- **Window**: `BATCH_WINDOW_MINUTES` (5), fixed from a recipient's oldest unsent message in a topic and channel; later messages join it rather than extending it. Batches are per recipient + topic + channel, so each digest has one exact unsubscribe link.
- **Flush**: `flush-held-notifications` runs every minute (queue policy `exclusive`, not retried, 60-second heartbeat). It claims every due group with one `batch_id` and sends only the batches it claimed. A group that still has an unsent claim is not claimed again, so its new messages follow in the next message rather than beside it. Messages the recipient has already read in the app inbox are dropped from the batch. Then it sends: a recipient with **one** message gets it exactly as written, and recipients of the same message go out together through Resend's batch endpoint (key `{key}-email-{hash of batch ids}`) or as WhatsApp DMs with the usual `{key}-whatsapp-{userId}` key. Two or more messages become a digest (`NotificationDigestEmail` template, or a numbered WhatsApp text) keyed `digest-{batchId}-{channel}`. Preferences, suppression and phone numbers are read again at flush, so an unsubscribe inside the window is honoured.
- **Digest rows**: every sender in `src/send/` passes `digest` (a `DigestRow` from `src/digest.ts`) next to its title and body: the record's `name`, a short `meta` line (who, why, how many), `amountPaise`, a `status` badge, an `actionLabel` and the `list` page for the digest's button. It's stored as `held_notification.digest`. `buildDigest()` turns the rows into the email: repeat updates to one record of one kind collapse into the latest row ("· 3 updates"; a different amount keeps rows apart), the heading repeats a shared title with the count ("New invoice (4)"), the subject adds the topic name so digests of different topics don't thread together, rows sit under their titles only when some title repeats (otherwise one flat list), a status every row shares is dropped, the button goes to the shared list page or else the dashboard, and the inbox preview names the first few records. Email digests list up to 20 rows and WhatsApp digests 10, with "And N more." for the rest. A message without a row shows its title and body.
- **Failures**: each topic and channel is sent on its own, so one failing group can't hold up the rest. A claim owns its batches for `CLAIM_LEASE_MINUTES` (15, longer than the job's 10-minute expiry); a claim still unsent after that (the run died, or its group threw, which expires the lease at once) is taken over by a later run under the same `batch_id`, so the resend uses the same keys, and given up (stamped sent, logged) after `MAX_ATTEMPTS` (3). A run stops between groups once pg-boss aborts it at its expiry. A delivery that fails is logged and stamped sent, like an immediate send that fails.
- **Kill switch**: while notifications are disabled, the flush drops held messages that are past the window.
- **Retention**: once a message has nothing left to send, its content (body, email HTML, WhatsApp text, digest row) is cleared (`cleared_at`); the inbox keeps its own copy. The cleared row stays for tracing and is deleted two days after it was held. Holding a cleared key again restores its content. The tables are transient queues and have no seed records.

`TOPIC_CATALOG` owns each topic's supported-channel allowlist. Both preference
editors and the preference mutators enforce that contract, and domain senders
consume the same lookup. Kalakriti registration, schedule, and transport messages
use inbox and WhatsApp while honoring each recipient's topic preferences.

### Email templates

`packages/email/src/templates/` uses the product design language as inline hex tokens (`theme.ts`, kept in step with `packages/design-system/styles.css`): the compact lockup (`apps/web/public/email-logo.png`) above a white card on the sidebar grey, an optional `status` badge with the app's five tones, line items as a framed list, the note on the info wash, one sky-ink button. `EmailLayout` frames notification, verification and password-reset emails alike. Preview them with `bun run dev:email` in `packages/email`.

Notification HTML is rendered once per message, with `FOOTER_NOTE_PLACEHOLDER` where each recipient's footer sentence goes. `buildNotificationEmail()` swaps in "You're getting this because you're subscribed to …" with that recipient's signed unsubscribe link, and adds RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Required topics (Account) get neither.

### Unsubscribe

`packages/notifications/src/unsubscribe.ts` signs `userId\ntopicId` with HMAC-SHA256 under a key derived from `BETTER_AUTH_SECRET`; links don't expire. Two targets carry the same `u`, `t` and `sig` query:

- `POST /api/email/unsubscribe` is the one-click target mail providers call; it turns email off for that topic (`setTopicEmailEnabled`). `resubscribe=1` turns it back on.
- `/unsubscribe` is the footer link's page. Opening it changes nothing (so link scanners can't unsubscribe anyone); its button and Undo POST to the API route.

Both are unauthenticated and authorised by the signature, so they sit outside the audit ledger like other webhooks.

### Bounces and complaints

Resend posts delivery events to `POST /api/email/webhook`, verified with `RESEND_WEBHOOK_SECRET` (Svix signature, via `standardwebhooks`). Permanent bounces and spam complaints add the address to `private.email_suppression` (`recordEmailSuppression`; a hard bounce replaces a complaint, never the reverse). Notification email skips every suppressed address; verification and password-reset email skip hard bounces only (`isAuthEmailBlocked`), because someone who reported spam still asked for those. The user sheet shows an "Email delivery" section for suppressed users, and `users.edit` holders can **Resume email** (`resumeUserEmail`, audited as `user.email.resume`).

### In-App Inbox

- **Storage**: `notification` table (id, userId, topicId, title, body, clickAction, imageUrl, read, archived, idempotencyKey, createdAt).
- **Real-time**: Zero syncs `notification` table to client. `useQuery(queries.notification.forCurrentUser())` — reactive, no polling.
- **UI**: `NotificationInbox` component in sidebar user menu. Actions: mark read/unread, archive, mark all read.
- **Retention**: Daily cleanup job (`cleanup-notifications`) deletes archived notifications >90 days and read notifications >180 days.
- **Query limit**: 50 most recent unarchived notifications.

## WhatsApp RSVP Polls

Events with `postRsvpPoll` enabled → WhatsApp poll sent to their team/event group 3 days before start. pg-boss schedule: `send-event-rsvp-polls`, every 15 min.

The official GoWA gateway sends `message` webhooks to `/api/whatsapp/webhook`. The app accepts `payload.poll.type = "vote"`, using `poll_id` and `selected_option_hashes` from that nested object. `resolved`, `partially_resolved`, and `definition_missing` votes are usable because pi-dash stores its own Yes/No option hashes. Missing hashes and `decrypt_failed` votes are ignored, never treated as an empty selection; a successfully decrypted empty array clears the RSVP. Other message and poll types are acknowledged without processing. Both Compose configurations subscribe to `WHATSAPP_WEBHOOK_EVENTS=message`.

Votes are recorded in `event_rsvp_vote`; "yes" auto-adds the user as an event member, and "no" or a cleared vote removes them. Unknown option hashes leave membership unchanged. Kalakriti-managed or Edition-linked events reject RSVP votes before writes so webhook traffic can't bypass the Edition volunteer enrollment policy.

**Local dev webhook proxy**: GoWA (Go) can send `Transfer-Encoding: chunked` POSTs. Vite dev server rejects with 400. Run `bun run dev:webhook-proxy` alongside dev server — listens on `:3002`, buffers body, forwards to app on `:3001` with `Content-Length`. Dev `docker-compose.yml` points GoWA's webhook URL to `:3002`. Not needed in prod (Nitro handles direct).

## Topics & Preferences

Topics: `packages/notifications/src/topics.ts`. Each topic has per-channel toggles (inbox + email + WhatsApp) in `notification_topic_preference` table (composite PK: `user_id` + `topic_id`). Default: all channels enabled (no row = enabled).

Kalakriti has separate Registration, Schedule, and Transport topics so Guardians
and assigned volunteers can control those streams independently. Transport
messages go only to the affected Center's active Guardians and Liaisons.

**Storage model**: DB is sole source of truth. Preferences checked at send-time for all channels. No external sync needed.

**UI**: Users manage prefs via settings (`NotificationsSection`). Admins edit any user (`UserNotificationsForm`). Both use Zero queries/mutators — no server fns.

**Mutators**: `notificationPreference.upsert` (self), `notificationPreference.adminUpsert` (admin, `users.edit` required). Required topics cannot be disabled, and unsupported topic/channel pairs are rejected server-side.

## WhatsApp Gateway (GoWA)

`packages/whatsapp` wraps the official GoWA REST API, pinned to `ghcr.io/aldinokemal/go-whatsapp-web-multidevice:v9.6.0` in local and production Compose. No custom fork is required. Config: `WHATSAPP_API_URL`, `WHATSAPP_AUTH_USER`, `WHATSAPP_AUTH_PASS`, `WHATSAPP_WEBHOOK_SECRET`.

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

**Webhook**: GoWA POSTs to `/api/whatsapp/webhook` with `x-hub-signature-256: sha256=<HMAC-SHA256 of the raw body using WHATSAPP_WEBHOOK_SECRET>`. The endpoint handles decrypted poll votes and acknowledges other payloads without processing them.

**Chunked-request proxy**: GoWA (Go) emits `Transfer-Encoding: chunked` POSTs — Vite dev server rejects with 400. `bun run dev:webhook-proxy` buffers body on `:3002`, forwards to `:3001` with `Content-Length`. Prod (Nitro) handles chunked directly — proxy not needed.
