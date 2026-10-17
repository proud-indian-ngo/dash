# Notifications

> **Load when**: notification batching or digests, `held_notification`, `flush-held-notifications`, `notify-*` handler, topic preferences, email templates, unsubscribe, bounces, `email_suppression`, WhatsApp poll, group JID, `sync-whatsapp-status`, GoWA gateway, WhatsApp Cloud API, message templates, `whatsapp_message`, group invites.
> **Related**: `jobs.md` (enqueueing, queues, schedules), `observability.md`

```
Server function / Zero mutator / auth hook
    → enqueue("notify-*" | "whatsapp-*", payload)      # see jobs.md
        → packages/jobs/src/handlers/
            → packages/notifications/src/   # sendMessage / sendBulkMessage
            → packages/whatsapp/src/        # Cloud API and GoWA
```

Account deletion is the one synchronous send: capture the recipient's enabled email delivery before deleting the user, and send the confirmation only after deletion succeeds. Deleted accounts get no inbox row, because inbox rows need a live user.

## Channels

| Channel | Implementation | Config |
|---|---|---|
| In-app inbox | `notification` table synced by Zero | none |
| Email | Resend via `@pi-dash/email` | `RESEND_API_KEY`, `EMAIL_FROM` (required in production; unset elsewhere skips with an `email_not_configured` warning), `RESEND_WEBHOOK_SECRET` |
| WhatsApp to people | Meta Cloud API templates, or GoWA text until the Cloud API is configured | `WHATSAPP_CLOUD_*`, `WHATSAPP_API_URL` |
| WhatsApp groups, polls, scheduled messages | GoWA | `WHATSAPP_API_URL`, `WHATSAPP_AUTH_USER`, `WHATSAPP_AUTH_PASS`, `WHATSAPP_WEBHOOK_SECRET` |

## Send flow

`sendMessage()` and `sendBulkMessage()` (`packages/notifications/src/send-message.ts`):

1. Return early if the kill switch is on (`isNotificationsDisabled()`).
2. Read the recipient's topic preferences.
3. In parallel: insert the inbox row (unique `idempotencyKey`), then email and WhatsApp. For a batched topic, email and WhatsApp are held instead (see [Batching](#batching)).
4. Return a per-channel `SendMessageResult`.

Email:

- Keys: `{key}-email` for one recipient; bulk uses Resend's batch endpoint, 100 per request sorted by user id, `{key}-email-{chunk}`.
- A retry resends the first attempt's recipient list from `private.email_batch_recipients`, because Resend rejects a reused key with a changed payload. Snapshots are replaced after 23 hours (Resend's key window is 24) and deleted after two days.
- Requests are 250 ms apart, retry `rate_limit_exceeded` three times and time out after 10 s.
- Suppressed addresses are left out at lookup, so those users get inbox and WhatsApp only.

WhatsApp eligibility at send time: the user has a phone, `user.whatsappStatus` is verified, and `isWhatsAppTopicEnabled(userId, topicId)`. `sync-whatsapp-status` (enqueued from `packages/auth/src/auth.ts` on sign-up or phone change) records whether the phone is on WhatsApp.

## Batching

Email and WhatsApp DMs are held for 5 minutes (`BATCH_WINDOW_MINUTES`) and sent together, so a burst of activity reaches each person as one message. The inbox is never held. Code: `packages/notifications/src/batching.ts`.

- Every topic is batched except those with `sendImmediately` in `TOPIC_CATALOG` (Account, Kalakriti Schedule, Kalakriti Transport); `isBatchedTopic()` is the lookup.
- A send with `immediate: true` skips batching in any topic. It is used where the words go stale within the window: event reminders, event time or place updates, cancellations, and the admin `send-notification` and `send-scheduled-message` jobs.
- `holdNotification()` runs after the usual preference, suppression and WhatsApp checks. It stores the rendered message once in `private.held_notification` (keyed by the idempotency key) and a `held_notification_recipient` row per recipient and channel. Retries hold nothing twice; a reused key with different words logs `held_notification_key_reused`. A failed hold throws, so the notify job retries.
- Batches are per recipient, topic and channel, so each digest has one exact unsubscribe link. The window starts at the oldest unsent message; later messages join it without extending it.

### Flush

`flush-held-notifications` runs every minute (queue settings in `jobs.md`).

- It claims every due group under one `batch_id` and sends only that. A group with an unsent claim is not claimed again.
- It drops messages already read in the inbox and re-reads preferences, suppression and phones, so an unsubscribe inside the window is honoured.
- One message goes out as written (email key `{key}-email-{hash of batch ids}`, WhatsApp `{key}-whatsapp-{userId}`). Two or more become a digest (`NotificationDigestEmail` or a numbered WhatsApp text) keyed `digest-{batchId}-{channel}`; see also [Cloud API digests](#digests-on-the-cloud-api).
- With the kill switch on, it drops held messages past the window.

Failures:

- Each topic and channel group is sent separately.
- A claim owns its batches for 15 minutes (`CLAIM_LEASE_MINUTES`, longer than the job's 10-minute expiry). A later run then takes it over with the same keys, and gives up after 3 attempts (`MAX_ATTEMPTS`). A group that throws expires its lease at once.
- A failed delivery is logged and stamped sent, except a thrown WhatsApp send (transient Cloud API error or GoWA failure), which expires the claim for a retry; the send log skips what already went out. For immediate sends, a thrown WhatsApp send fails the notify job after inbox and email, and pg-boss retries.

Retention: once nothing is left to send, the content (body, HTML, WhatsApp text and template, digest row) is cleared (`cleared_at`); the row is deleted two days after it was held. Holding a cleared key again restores its content. These are transient queue tables with no seed records.

### Digest rows

Every sender in `src/send/` passes a `DigestRow` (`src/digest.ts`: name, meta line, amount, status, action label, list page). `buildDigest()` collapses repeat updates to one record into the latest row ("· 3 updates"), shows a shared title with a count ("New invoice (4)"), adds the topic to the subject so digests of different topics do not thread together, and lists up to 20 rows in email and 10 in WhatsApp. A message without a row shows its title and body.

## Topics and preferences

- Topics live in `packages/notifications/src/topics.ts`. `TOPIC_CATALOG` owns each topic's supported channels; preference editors, preference mutators and senders all enforce it.
- `notification_topic_preference` (PK `user_id` + `topic_id`) holds per-channel toggles. No row means all channels on. Preferences are read at send time; the database is the only source of truth.
- Users edit their own in Settings (`NotificationsSection`); admins edit anyone's (`UserNotificationsForm`). Both use Zero mutators: `notificationPreference.upsert` and `notificationPreference.adminUpsert` (`users.edit`). Required topics cannot be turned off, and unsupported topic and channel pairs are rejected server-side.
- Kalakriti has separate Registration, Schedule and Transport topics, all inbox and WhatsApp only. Transport messages go only to the affected Center's active Guardians and Liaisons.

## In-app inbox

- `notification` table, synced by Zero (`queries.notification.forCurrentUser()`, 50 most recent unarchived).
- `NotificationInbox` in the sidebar user menu: mark read or unread, archive, mark all read.
- `cleanup-notifications` deletes archived rows after 90 days and read rows after 180.

## Email

### Templates

`packages/email/src/templates/` uses the product design language as inline hex tokens (`theme.ts`, kept in step with `packages/design-system/styles.css`). `EmailLayout` frames notification, verification and password-reset email. Preview with `bun run dev:email` in `packages/email`.

Notification HTML is rendered once per message with `FOOTER_NOTE_PLACEHOLDER`. `buildNotificationEmail()` fills in each recipient's "You're getting this because…" line with a signed unsubscribe link and adds RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Required topics (Account) get neither.

### Unsubscribe

`packages/notifications/src/unsubscribe.ts` signs `userId\ntopicId` with HMAC-SHA256 under a key derived from `BETTER_AUTH_SECRET`. Links do not expire. Both targets take `u`, `t` and `sig`:

- `POST /api/email/unsubscribe` is the one-click target; it turns email off for the topic (`setTopicEmailEnabled`). `resubscribe=1` turns it back on.
- `/unsubscribe` is the footer page. Opening it changes nothing, so link scanners cannot unsubscribe anyone; its button and Undo POST to the API route.

Both are unauthenticated and authorised by the signature, so they sit outside the audit ledger.

### Bounces and complaints

Resend posts events to `POST /api/email/webhook`, verified with `RESEND_WEBHOOK_SECRET` (Svix signature via `standardwebhooks`).

- Permanent bounces and spam complaints add the address to `private.email_suppression` (`recordEmailSuppression`). A hard bounce replaces a complaint, never the reverse.
- Notification email skips every suppressed address. Verification and password-reset email skip hard bounces only (`isAuthEmailBlocked`), because someone who reported spam still asked for those.
- The user sheet shows "Email delivery" for suppressed users; `users.edit` holders can **Resume email** (`resumeUserEmail`, audited as `user.email.resume`).

## WhatsApp

### Cloud API

Messages to people use Meta's Cloud API once `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set (`isCloudApiEnabled()`). Without them everything goes through GoWA. Groups, RSVP polls and scheduled messages always use GoWA.

#### Templates

Meta delivers business-initiated messages only as approved templates. The social digest template is covered in `social-api.md`.

- `packages/whatsapp/src/templates.ts` lists them (named parameters, UTILITY, English, an "Open dashboard" button with a sender-filled path). Its test enforces Meta's rules: no parameter at the start or end (`{{x}}.` counts as the end), at least 2.5 fixed words per parameter, no chat.whatsapp.com buttons.
- `bun run whatsapp:templates submit` creates missing templates on Meta; `status` shows review state and category (`scripts/whatsapp-templates.ts`). It needs the production `APP_URL`, because a button's link is fixed at approval.
- A changed template needs a new name. Meta blocks a deleted name for about 30 days.
- Meta can move a template it reads as promotional to MARKETING, during review or after approval. `getCloudTemplate()` reads the live category, cached for an hour; only the digest decision uses it. Ask for a review in WhatsApp Manager → Message templates → Template Category Updates.

#### Senders

- Every message must pass `whatsappTemplate`: each sender in `src/send/` calls `whatsappTemplate(name, params, path)` (`@pi-dash/whatsapp/template-message`), type-checked against the template, or passes `null` on purpose.
- Values are flattened to one line and cut at 300 characters. `fitToBody()` shortens the longest values until the body fits Meta's 1024 characters.
- On the Cloud API, a `null` template is not sent on WhatsApp (`whatsapp_no_template` warning); it does not fall back to GoWA. The admin `send-notification` and `send-scheduled-message` jobs pass `null`, so they reach WhatsApp only through GoWA. The WhatsApp scan and R2 cleanup reports go out as GoWA text but are skipped on the Cloud API.

#### Send log and errors

- The Cloud API has no idempotency key, so `sendWhatsAppNotification()` claims the message key in `private.whatsapp_message` before sending. A finished claim is skipped (`duplicate`). A claim stuck in `sending` without a Meta message ID for 5 minutes is taken over by a retry, so a lost response can mean a second delivery.
- The row keeps Meta's message ID, template and status, never the phone or text. The flush job drops rows after 90 days. Transient table, no seed records.
- Requests time out after 10 s. Transient errors (throttling `130429` and `131056`, 5xx, timeouts; `isTransientCloudError()` in `cloud.ts`) release the claim and throw so the job retries. Permanent errors (missing or paused template, bad parameter, invalid number) mark the row `failed` with Meta's code, log once and return `rejected`.
- `sendWhatsAppNotification()` and `sendWhatsAppReply()` return `sent`, `duplicate`, `no_template` or `rejected`. Bulk sends go 5 at a time.

#### Digests on the Cloud API

- A batch whose rows merge into one row is sent as that single message.
- Otherwise it is sent as the `notifications_summary` template (count, topic, one-line list) while Meta holds it as UTILITY.
- If Meta moves it to MARKETING, each message goes out as its own template, unless there are more than 5, when the marketing summary is cheaper.
- If `notifications_summary` is not approved, each message goes out on its own.

#### Webhook

`/api/whatsapp/cloud/webhook` (`apps/web/src/lib/whatsapp-cloud-webhook.ts`). Subscribe the app to the `messages` field.

- `GET` answers Meta's subscription check with `WHATSAPP_CLOUD_VERIFY_TOKEN`.
- `POST` checks `X-Hub-Signature-256` against `WHATSAPP_CLOUD_APP_SECRET`: unset 404, bad signature 401, bad JSON 400, unhandled payload 200, processing error 500 (Meta retries).
- It ignores changes for any other `phone_number_id` (the business account may hold other numbers) and processes nothing while `WHATSAPP_CLOUD_PHONE_NUMBER_ID` is unset.
- It moves send-log statuses forward (sent → delivered → read; failed keeps Meta's error).
- Incoming messages get a fixed "this number isn't monitored" auto-reply, once per sender per India day, as free text inside Meta's 24-hour window. The reply's idempotency key is an HMAC of the sender's number under the app secret, so the log holds nothing that reveals the number. Only a `sent` outcome counts.

#### Group invites

With the Cloud API on, adding someone to a group sends the `group_invite` template instead (`addOrInviteToWhatsAppGroup()` in `groups.ts`), unless GoWA already lists them, at most once per group per India day. Why: adding people who have not saved the number is a strong ban signal for the GoWA number. Removals stay automatic.

- The button opens `/whatsapp-groups/$groupId/join`, which fetches the invite link from GoWA (`GET /group/invite-link`) and redirects. Meta does not allow chat.whatsapp.com links in buttons.
- `getWhatsAppGroupJoinLink` (`apps/web/src/lib/whatsapp-group-access.ts`) returns the link only to people entitled now: team or event members, oriented people for the all-volunteers group (`all_volunteers_group_id`), not-yet-oriented people for the orientation group (`orientation_group_id`). Anyone else gets `not_member` without the group name.
- Invites skip people who turned off WhatsApp for the Teams topic (team groups) or Events topic (event and app-wide groups).

### GoWA gateway

`packages/whatsapp` wraps the official GoWA REST API, pinned to `ghcr.io/aldinokemal/go-whatsapp-web-multidevice:v9.6.0` in both Compose files.

- The gowa-ui dashboard is enabled (`APP_UI_ENABLED`, `APP_UI_AUTO_UPDATE`) at `/` behind Basic Auth and follows upstream releases, not the pinned image. Health probes use `/health`. See [deployment](../../DEPLOYMENT.md#whatsapp-gateway-optional).
- Group JIDs look like `120363012345678901@g.us`; admins paste them from the WhatsApp Web URL.
- Group jobs (`whatsapp-add-member(s)`, `whatsapp-add-member-team`, `whatsapp-remove-member(-team)`, orientation membership) are idempotent and retry-safe.
- Text sends carry a bounded ASCII `Idempotency-Key` derived from message key, recipient and channel. GoWA does not guarantee atomic idempotency, so delivery stays at-least-once.

### RSVP polls

Events with `postRsvpPoll` get a WhatsApp poll in their team or event group `rsvpPollLeadMinutes` before start, 3 days by default (`send-event-rsvp-polls`).

- GoWA posts `message` webhooks to `/api/whatsapp/webhook`, signed `x-hub-signature-256: sha256=<HMAC-SHA256 of the raw body with WHATSAPP_WEBHOOK_SECRET>`. Compose sets `WHATSAPP_WEBHOOK_EVENTS=message`.
- Only `payload.poll.type = "vote"` is processed, using `poll_id` and `selected_option_hashes`. `resolved`, `partially_resolved` and `definition_missing` votes count because the app stores its own Yes/No hashes. Missing hashes and `decrypt_failed` are ignored; a decrypted empty array clears the RSVP. Everything else is acknowledged.
- Votes go to `event_rsvp_vote`. Yes adds the user as an event member; no or a cleared vote removes them; unknown hashes change nothing.
- Kalakriti-managed or Edition-linked events reject votes before any write, so webhooks cannot bypass Edition enrolment.
- Locally, GoWA calls the Vite server at `host.docker.internal:${DEV_WEB_PORT:-3001}/api/whatsapp/webhook` directly.

## Event self-join and leave

`teamEvent.joinAsMember` enqueues `notify-added-to-event`, as an admin add does. `teamEvent.leaveEvent` enqueues `notify-event-volunteer-left` to the team leads under the `EVENTS_INTEREST` topic; the key includes `leftAt`, so leave, rejoin and leave again sends twice.
