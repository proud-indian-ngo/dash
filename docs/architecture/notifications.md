# Notifications

> **Load when**: notification batching or digests, the Notification delivery page, `held_notification`, `notify-*` handlers, topic preferences, email templates, unsubscribe, bounces, WhatsApp Cloud API or templates, GoWA, polls, group invites.
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

### Event reminder claims

Pre-event reminders and post-event nudges claim their event and interval before recipient reads or delivery. A thrown read or delivery releases only that attempt's claim, so the cron can retry while the event remains in its eligibility window. Participant fan-out waits for every attempt, then fails the run if any delivery failed.

This is bounded retry protection, not durable delivery state. A process crash can leave a stale claim, a retry outside the cron eligibility window is skipped, and an ambiguous GoWA result can still deliver more than once. This fix adds no durable job state or schema change; addressing those cases requires one.

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
- Every row stamped sent without a send records why: a give-up sets `attempts` to `MAX_ATTEMPTS`, a kill-switch drop clears `batch_id`, and a message already read in the inbox sets `skipped_read`. The delivery page reads these.

Held content is cleared once sent and rows are deleted after 90 days, so the [delivery page](#delivery-page) can read them. These are transient tables with no seed records.

### Idempotency keys

The inbox, held messages and the WhatsApp send log each dedupe by key for up to 90 days, so a key that repeats for a new event silently drops the second notification. A key that can recur (re-added to a team, a role changed back, a request reviewed again) ends in a row id or a timestamp captured where the action happens and passed in the job payload, as `team-member-removed-…-${removedAt}` does. A retried job reuses the payload, so it still dedupes.

### Digest rows

Every sender in `src/send/` passes a `DigestRow`. `buildDigest()` collapses repeat updates to one record and adds the topic to the subject, so digests of different topics do not thread together.

## Delivery page

`/notification-delivery` shows each person's copy of each notification over 90 days, the send logs' retention. It shows inbox and WhatsApp message text, so it has its own permission, `notifications.view_delivery`, rather than `jobs.manage`. The private tables aren't in Zero, so server functions page it; statuses are SQL `CASE` columns, so filters, paging and the total run in Postgres.

- A row is an inbox row with its `-inbox` suffix stripped, a held message whose inbox copy was off, or a Cloud API or gateway send with no inbox copy. A send keyed `${key}-whatsapp-${userId}` was a notification with the inbox off ("Inbox off"); other keys (group invites, Social digests) never had one. These show the template's `label` as title, or a gateway message's first line. Summaries have no row; their messages read "Sent in summary".
- Every other [GoWA send](#gowa-log) is a row of its own, keyed `gowa-${id}`, with no inbox or email: one per group post, recipient the group's name, and one per scheduled direct message. The title is what sent it plus the event's name.
- "Delivered by" says how the WhatsApp copy went: "WhatsApp API" (Cloud API), "WhatsApp gateway" (GoWA to one person) or "WhatsApp group" (a group post).
- Email reads the [email log](#email-log), joined on the notification key and user, or on `digest-${batchId}` for "Sent in summary". A send with no log row (sent before the log existed, or a failed log write) reads "Not tracked".
- "Off" and "No WhatsApp" read the recipient's preference and phone as they are now, so they appear only where nothing was sent.
- A gateway message to one person reads Sent, Delivered or Read from its receipts, or Failed. A group post shows "Delivered to 48 · Read by 21" instead, counting distinct people; a read counts as delivered. The group's size at send time isn't known, so there is no "of 60". The sheet lists who read it and who received it, by dashboard name where the receipt's phone matches a user, else GoWA's display name, else the number masked ("+91 •••• ••686"). Full numbers never reach the browser.
- The stats count gateway direct messages with Cloud API ones as delivered, and every failed gateway send as failed. Group posts aren't counted as delivered, since a post has no single recipient.
- Suppression is the address's current state, compared with the send time.
- The detail sheet renders the WhatsApp template from the header, body and `params` stored at send time (templates are edited in place under the same name), falling back to today's definition for older rows. A gateway message shows the text sent, with its attachment count. Email content isn't kept.

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

### Email log

`private.email_message` holds one row per notification email per recipient: Resend's email id, the notification key (or `digest-${batchId}`), the user and a delivery status. It stores no address, subject or content. Rows are pruned after 90 days in the flush job's hourly step, with the WhatsApp log.

- The send writes the row once Resend accepts the email; a failed write is logged and never fails or resends the email. A retried send that Resend dedupes returns the same ids, so the insert upserts.
- Notification email carries the Resend tag `category: notification`; auth, receipt and account-deleted email don't, and stay unlogged. The webhook updates only tagged events, creating the row if an event beats the send's insert, so the race loses nothing.
- Status moves forward only: sent, then delayed, then delivered. Bounced, complained, failed and suppressed are terminal; a complaint can follow delivery. Opens and clicks are ignored.

### Bounces and complaints

Resend posts events to `POST /api/email/webhook`, verified with `RESEND_WEBHOOK_SECRET`. A processing error returns 500 so Resend retries.

- Permanent bounces and spam complaints add the address to `private.email_suppression`. A hard bounce replaces a complaint, never the reverse.
- Notification email skips every suppressed address. Verification and password-reset email skip hard bounces only, because someone who reported spam still asked for those.
- `users.edit` holders can **Resume email** from the user sheet (audited).

## WhatsApp

### Cloud API

Messages to people use Meta's Cloud API once `WHATSAPP_CLOUD_ACCESS_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set. Without them everything goes through GoWA. Groups, RSVP polls and scheduled messages always use GoWA.

#### Templates

Meta delivers business-initiated messages only as approved templates. The social digest template is covered in `social-api.md`.

- `packages/whatsapp/src/templates.ts` lists them. Its test enforces Meta's rules: no parameter at the start or end (`{{x}}.` counts as the end), at least 2.5 fixed words per parameter, no chat.whatsapp.com buttons.
- Layout: a static text header (at most 60 characters, no parameter, markdown or emoji), then a body that opens with a plain sentence and lists two or more facts as `*Label:* {{value}}` lines after a blank line. The test also rejects a line that is only a parameter, unpaired `*`, and two blank lines in a row; the send log uses three new lines to separate the stored header from the body.
- `bun run whatsapp:templates submit` creates missing templates on Meta; `status` shows review state and category. Both need the production `APP_URL`, because a button's link is fixed at approval.
- Change an existing template in place with `edit`: it replaces the components of each template whose header, body, footer or buttons differ from Meta's copy, keeping the name. Meta allows it only for APPROVED, REJECTED or PAUSED templates, never changes an approved template's category, and limits an approved one to one edit a day and 10 in 30 days. An edited template is PENDING until Meta re-approves it, and can't be sent meanwhile, so run `edit --dry-run`, then `edit --limit 1` as a canary and check `status` before editing the rest. The request must carry the template's current `category` and `parameter_format`; without them Meta answers with error subcode 2388039, "status can't be changed".
- The send log stores the deployed copy, so messages sent between the edit and the deploy can show the other version. A new name is needed only for a new template; Meta blocks a deleted name for about 30 days.
- Meta can move a template it reads as promotional to MARKETING, during review or after approval. Only the digest decision reads the live category. Ask for a review in WhatsApp Manager → Message templates → Template Category Updates.

#### Senders

- Each sender in `src/send/` passes a type-checked `whatsappTemplate(name, params, path)`, or `null` on purpose.
- On the Cloud API, a `null` template is not sent on WhatsApp; it does not fall back to GoWA. So admin-composed messages and GoWA-text reports reach WhatsApp only while the Cloud API is off.

#### Send log and errors

- The Cloud API has no idempotency key, so `sendWhatsAppNotification()` claims the message key in `private.whatsapp_message` before sending. A claim stuck in `sending` without a Meta message ID for 5 minutes is taken over by a retry, so a lost response can mean a second delivery.
- The row never stores the phone. It keeps the template's body and parameter values as sent (`template_body` and `params`, null for a free-form reply) so the delivery page can show what was sent. Transient table, no seed records.
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
- The [weekly group scan](teams-and-events.md#whatsapp-groups) sends `group_join_reminder` instead, with the same button and topic rule. So someone who turned off the Events topic gets no reminder and is still deactivated.
- Invites skip people who turned off WhatsApp for the Teams topic (team groups) or Events topic (event and app-wide groups).

### GoWA gateway

`packages/whatsapp` wraps the GoWA REST API, pinned to one image version in both Compose files.

- The gowa-ui dashboard follows upstream releases, not the pinned image. See [deployment](../../DEPLOYMENT.md#whatsapp-gateway-optional).
- Group JIDs look like `120363012345678901@g.us`; admins paste them from the WhatsApp Web URL.
- Group jobs are idempotent and retry-safe.
- GoWA does not guarantee atomic idempotency, so text delivery stays at-least-once.

### Scheduled delivery

Scheduled WhatsApp jobs use their message and recipient IDs to reload the stored text, attachments, recipient type and current user phone or group JID. Queued content and addresses never authorize delivery or signed attachment access. The recipient must belong to that message and remain pending or failed; sent and cancelled rows and obsolete message revisions are skipped. Dead letters apply the same checks and cannot overwrite a sent or cancelled recipient. Delivery remains at-least-once if the gateway accepts a send before the worker can record success.

### GoWA log

`private.gowa_message` holds one row per GoWA send for the [delivery page](#delivery-page): group posts (new event, reminder, update, weekly digest, RSVP poll, cancellation), scheduled messages, and notifications while the Cloud API is off. It keeps the text we composed, the group's JID or the user (never a phone), and the event or scheduled message it came from. A media send is one row; `gowa_message_part` holds a WhatsApp message ID per attachment, and receipts roll up across them.

- Each send helper returns GoWA's `results.message_id`. The sender logs after GoWA accepts the message; `logGowaSend()` logs a failed write with evlog and never fails or resends the message. A retry GoWA deduped returns an ID already logged, so it adds nothing. Only a scheduled message that exhausts its retries is logged as failed; other senders retry as before and log nothing until one succeeds.
- GoWA posts `message.ack` to the same webhook. Each one upserts `gowa_receipt` per message ID and person JID in a single statement, with no user lookup: people are matched by phone when the page reads. Delivered sets `delivered_at`, read sets `read_at` and `delivered_at` if unset, and each time is set once. Receipt types other than delivered and read are ignored.
- A receipt is stored without checking the send's row, because it can beat the send's insert; the page joins on the message ID. Receipts no send has claimed within an hour (messages sent from the phone itself) are pruned.
- Sends and receipts are pruned after 90 days in the flush job's hourly step. Transient tables, no seed records.

### RSVP polls

Events with `postRsvpPoll` get a WhatsApp poll in their group `rsvpPollLeadMinutes` before start (`send-event-rsvp-polls`).

- GoWA posts `message` webhooks to `/api/whatsapp/webhook`, signed with `WHATSAPP_WEBHOOK_SECRET`.
- `resolved`, `partially_resolved` and `definition_missing` votes count because the app stores its own Yes/No hashes. Missing hashes and `decrypt_failed` are ignored; a decrypted empty array clears the RSVP.
- Yes adds the user as an event member; no or a cleared vote removes them.
- An event has one poll row. Cancelling closes it with a notice in the group. Post poll on the event page replaces a closed poll, with its votes, so a restored event can poll again; one closed because the event started is kept.
- Kalakriti-managed or Edition-linked events reject votes before any write, so webhooks cannot bypass Edition enrolment.
- Locally, GoWA calls the Vite server at `host.docker.internal` directly.

## Event self-join and leave

Leaving notifies team leads with a key that includes `leftAt`, so leave, rejoin and leave again sends twice.
