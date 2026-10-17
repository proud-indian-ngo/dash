# Notifications

> **Load when**: notification batching or digests, `held_notification`, `notify-*` handlers, topic preferences, email templates, unsubscribe, bounces, WhatsApp Cloud API or templates, GoWA, polls, group invites.
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

| Channel | Implementation |
|---|---|
| In-app inbox | `notification` table synced by Zero |
| Email | Resend via `@pi-dash/email`. `EMAIL_FROM` is required in production; unset elsewhere, email is skipped with a warning |
| WhatsApp to people | Meta Cloud API templates, or GoWA text until the Cloud API is configured |
| WhatsApp groups, polls, scheduled messages | GoWA |

## Send flow

`sendMessage()` and `sendBulkMessage()` check the kill switch, read topic preferences, insert the inbox row, then send email and WhatsApp (or hold them, see [Batching](#batching)).

Email:

- A retry resends the first attempt's recipient list from `private.email_batch_recipients`, because Resend rejects a reused key with a changed payload. Snapshots are replaced after 23 hours, inside Resend's 24-hour key window.
- Suppressed addresses are left out at lookup, so those users get inbox and WhatsApp only.

WhatsApp goes only to users with a verified `whatsappStatus` and the topic enabled. `sync-whatsapp-status`, enqueued on sign-up or phone change, records whether the phone is on WhatsApp.

## Batching

Email and WhatsApp DMs are held for a short window and sent together, so a burst of activity reaches each person as one message. The inbox is never held. Code: `packages/notifications/src/batching.ts`.

- Every topic is batched except those with `sendImmediately` in `TOPIC_CATALOG`.
- A send with `immediate: true` skips batching. Use it where the words go stale within the window: reminders, time or place changes, cancellations, and admin-composed messages.
- Holding runs after the usual preference, suppression and WhatsApp checks. A failed hold throws, so the notify job retries.
- Batches are per recipient, topic and channel, so each digest has one exact unsubscribe link. The window starts at the oldest unsent message and later messages do not extend it.

### Flush

`flush-held-notifications` runs every minute.

- It claims due groups under one `batch_id` and sends only those. It re-reads read state, preferences, suppression and phones, so an unsubscribe inside the window is honoured.
- One message goes out as written; two or more become a digest. See also [Cloud API digests](#digests-on-the-cloud-api).

Failures:

- Each topic and channel group is sent separately.
- A claim's lease (`CLAIM_LEASE_MINUTES`) must stay longer than the scheduled job's expiry, so a later run takes over only after the first has stopped. It reuses the same keys and gives up after `MAX_ATTEMPTS`.
- A failed delivery is logged and stamped sent, except a thrown WhatsApp send (transient Cloud API or GoWA error), which expires the claim for a retry; the send log skips what already went out. For immediate sends, a thrown WhatsApp send fails the notify job after inbox and email, and pg-boss retries.

Held content is cleared once sent and rows are deleted after two days. These are transient tables with no seed records.

### Digest rows

Every sender in `src/send/` passes a `DigestRow`. `buildDigest()` collapses repeat updates to one record and adds the topic to the subject, so digests of different topics do not thread together.

## Topics and preferences

- `TOPIC_CATALOG` (`packages/notifications/src/topics.ts`) owns each topic's supported channels; editors, mutators and senders all enforce it.
- `notification_topic_preference` holds per-channel toggles. No row means all channels on. Preferences are read at send time.
- Required topics cannot be turned off, and unsupported topic and channel pairs are rejected server-side. Admins edit anyone's preferences with `users.edit`.
- Kalakriti Transport messages go only to the affected Center's active Guardians and Liaisons.

## Email

### Templates

`packages/email/src/templates/` uses inline hex tokens (`theme.ts`); keep them in step with `packages/design-system/styles.css`. Preview with `bun run dev:email` in `packages/email`.

Notification HTML is rendered once per message. `buildNotificationEmail()` then adds each recipient's signed unsubscribe link and RFC 8058 `List-Unsubscribe` headers. Required topics get neither.

### Unsubscribe

Links are HMAC-signed under a key derived from `BETTER_AUTH_SECRET` and do not expire.

- `POST /api/email/unsubscribe` is the one-click target.
- `/unsubscribe` is the footer page. Opening it changes nothing, so link scanners cannot unsubscribe anyone; its buttons POST to the API route.

Both are unauthenticated and authorised by the signature, so they sit outside the audit ledger.

### Bounces and complaints

Resend posts events to `POST /api/email/webhook`, verified with `RESEND_WEBHOOK_SECRET`.

- Permanent bounces and spam complaints add the address to `private.email_suppression`. A hard bounce replaces a complaint, never the reverse.
- Notification email skips every suppressed address. Verification and password-reset email skip hard bounces only, because someone who reported spam still asked for those.
- `users.edit` holders can **Resume email** from the user sheet (audited).

## WhatsApp

### Cloud API

Messages to people use Meta's Cloud API once `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set. Without them everything goes through GoWA. Groups, RSVP polls and scheduled messages always use GoWA.

#### Templates

Meta delivers business-initiated messages only as approved templates. The social digest template is covered in `social-api.md`.

- `packages/whatsapp/src/templates.ts` lists them. Its test enforces Meta's rules: no parameter at the start or end (`{{x}}.` counts as the end), at least 2.5 fixed words per parameter, no chat.whatsapp.com buttons.
- `bun run whatsapp:templates submit` creates missing templates on Meta; `status` shows review state and category. It needs the production `APP_URL`, because a button's link is fixed at approval.
- A changed template needs a new name. Meta blocks a deleted name for about 30 days.
- Meta can move a template it reads as promotional to MARKETING, during review or after approval. Only the digest decision reads the live category. Ask for a review in WhatsApp Manager → Message templates → Template Category Updates.

#### Senders

- Each sender in `src/send/` passes a type-checked `whatsappTemplate(name, params, path)`, or `null` on purpose.
- On the Cloud API, a `null` template is not sent on WhatsApp; it does not fall back to GoWA. So admin-composed messages and GoWA-text reports reach WhatsApp only while the Cloud API is off.

#### Send log and errors

- The Cloud API has no idempotency key, so `sendWhatsAppNotification()` claims the message key in `private.whatsapp_message` before sending. A claim stuck in `sending` without a Meta message ID for 5 minutes is taken over by a retry, so a lost response can mean a second delivery.
- The row never stores the phone or text. Transient table, no seed records.
- Transient errors (throttling, 5xx, timeouts; `isTransientCloudError()`) release the claim and throw so the job retries. Permanent errors mark the row `failed` and return `rejected`.

#### Digests on the Cloud API

- A batch whose rows merge into one row is sent as that single message.
- Otherwise it is sent as the `notifications_summary` template while Meta holds it as UTILITY.
- If Meta moves it to MARKETING, each message goes out as its own template, unless there are more than 5, when the marketing summary is cheaper.
- If `notifications_summary` is not approved, each message goes out on its own.

#### Webhook

`/api/whatsapp/cloud/webhook`. Subscribe the app to the `messages` field. `GET` answers Meta's subscription check; `POST` checks `X-Hub-Signature-256`.

- A processing error returns 500 so Meta retries.
- It ignores changes for any other `phone_number_id`, because the business account may hold other numbers.
- It moves send-log statuses forward.
- Incoming messages get a fixed auto-reply, once per sender per India day, inside Meta's 24-hour window. The reply's key is an HMAC of the sender's number, so the log holds nothing that reveals the number.

#### Group invites

With the Cloud API on, adding someone to a group sends the `group_invite` template instead (`addOrInviteToWhatsAppGroup()`), unless GoWA already lists them, at most once per group per India day. Why: adding people who have not saved the number is a strong ban signal for the GoWA number. Removals stay automatic.

- The button opens `/whatsapp-groups/$groupId/join`, which fetches the invite link from GoWA and redirects, because Meta does not allow chat.whatsapp.com links in buttons.
- `getWhatsAppGroupJoinLink` returns the link only to people entitled now. Anyone else gets `not_member` without the group name.
- Invites skip people who turned off WhatsApp for the Teams topic (team groups) or Events topic (event and app-wide groups).

### GoWA gateway

`packages/whatsapp` wraps the GoWA REST API, pinned to one image version in both Compose files.

- The gowa-ui dashboard follows upstream releases, not the pinned image. See [deployment](../../DEPLOYMENT.md#whatsapp-gateway-optional).
- Group JIDs look like `120363012345678901@g.us`; admins paste them from the WhatsApp Web URL.
- Group jobs are idempotent and retry-safe.
- GoWA does not guarantee atomic idempotency, so text delivery stays at-least-once.

### RSVP polls

Events with `postRsvpPoll` get a WhatsApp poll in their group `rsvpPollLeadMinutes` before start (`send-event-rsvp-polls`).

- GoWA posts `message` webhooks to `/api/whatsapp/webhook`, signed with `WHATSAPP_WEBHOOK_SECRET`.
- `resolved`, `partially_resolved` and `definition_missing` votes count because the app stores its own Yes/No hashes. Missing hashes and `decrypt_failed` are ignored; a decrypted empty array clears the RSVP.
- Yes adds the user as an event member; no or a cleared vote removes them.
- Kalakriti-managed or Edition-linked events reject votes before any write, so webhooks cannot bypass Edition enrolment.
- Locally, GoWA calls the Vite server at `host.docker.internal` directly.

## Event self-join and leave

Leaving notifies team leads with a key that includes `leftAt`, so leave, rejoin and leave again sends twice.
