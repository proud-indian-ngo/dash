# Event Reminders & Weekly Digest

## Context

pi-dash has scheduled posts (admin-created one-off WhatsApp messages) and a few cron-based reminders (feedback deadline, stale requests, photo approval). But there's no automated event reminder system — nothing says "your event is tomorrow" or "happening in 2 hours." There's also no weekly digest of upcoming events for the orientation and all-volunteers WhatsApp groups.

This design adds:
1. **Configurable pre-event reminders** — admins pick preset intervals per event
2. **Weekly upcoming events digest** — Monday morning WhatsApp to global groups
3. **Post-event nudges** — feedback, attendance, and photo upload reminders

## Schema Changes

### `team_event.reminder_intervals` (JSONB column)

Array of minutes-before-event values. Presets: `10080` (1 week), `4320` (3 days), `1440` (1 day), `120` (2 hours), `30` (30 min). Nullable — null/empty means no reminders.

### `event_reminder_sent` (new table)

Idempotency tracking. Prevents duplicate sends if cron runs twice.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| eventId | uuid FK → team_event (cascade) | |
| instanceDate | text, nullable | ISO date for recurring instances |
| intervalMinutes | integer | Positive = pre-event, negative sentinels for post-event |
| sentAt | timestamp | |

Unique index: `(eventId, COALESCE(instanceDate, '__none__'), intervalMinutes)`

Negative sentinel values for post-event nudges:
- `-360` = feedback nudge (6h post)
- `-1440` = attendance reminder (24h post)
- `-1441` = photo upload nudge (24h post)

## Cron Jobs

### 1. `process-event-reminders` — every 15 min (`*/15 * * * *`)

- Queries non-cancelled events with `reminder_intervals IS NOT NULL`, `startTime` within 7 days
- Expands recurring series via `expandSeries()` from `rrule-utils.ts`
- For each event/occurrence + interval: if `reminderTime = startTime - interval` falls in `[now - 15min, now]` and no `event_reminder_sent` row → send
- **Routing:** event has WhatsApp group → `sendWhatsAppGroupMessage()`. Otherwise → `sendMessage()` per participant
- Topic: `EVENTS_SCHEDULE`

### 2. `send-weekly-events-digest` — Monday 7 AM UTC (`0 7 * * 1`)

- Queries all non-cancelled events this week (Mon-Sun), including rrule expansions
- Formats as numbered WhatsApp list with name, date/time, location
- Includes CTA: "View events and register your interest: {APP_URL}/events/public"
- Sends to `orientation_group_id` and `all_volunteers_group_id` via `getGroupJidByConfigKey()`
- Idempotency: `weekly-digest-{YYYY-MM-DD}`

Format:
```
*Upcoming Events This Week*

1. Team Standup
   Mon, Apr 7 at 2:00 PM | Office

2. Volunteer Training
   Wed, Apr 9 at 10:00 AM | Online

Interested? View events and register your interest:
https://app.pidash.org/events/public
```

### 3. `process-post-event-reminders` — hourly (`0 * * * *`)

Single handler, three nudge types:

| Nudge | Window | Condition | Recipients | Topic |
|-------|--------|-----------|------------|-------|
| Feedback | 6-7h after endTime | feedbackEnabled=true, not yet submitted | Event members | EVENTS_FEEDBACK |
| Attendance | 24-25h after endTime | No member has attendance marked | Creator + team leads | EVENTS_SCHEDULE |
| Photo upload | 24-25h after endTime | Zero event_photo rows | Event members | EVENTS_PHOTOS |

All route through `sendMessage()`/`sendBulkMessage()` — individual notifications, not group messages.

## UI Changes

**Event form** (`event-form-dialog.tsx`):
- Add `reminderIntervals: z.array(z.number()).optional()` to schema
- New `ReminderIntervalsField` component using `ToggleGroup` multi-select
- Presets: `[1 week] [3 days] [1 day] [2 hours] [30 min]`
- Placed below feedback fields

## Notification Functions

Added to `packages/notifications/src/send/reminders.ts`:
- `notifyEventReminder(eventId, eventName, intervalMinutes, location, startTime, userId)`
- `notifyEventReminderGroup(eventId, eventName, groupJid, intervalMinutes, location, startTime)`
- `notifyFeedbackNudge(eventId, eventName, userId)`
- `notifyAttendanceNotMarked(eventId, eventName, userId)`
- `notifyPhotoUploadNudge(eventId, eventName, userIds)`

## Files Changed

| File | Action |
|------|--------|
| `packages/db/src/schema/team-event.ts` | Add `reminderIntervals` column |
| `packages/db/src/schema/event-reminder.ts` | **New** — tracking table |
| `packages/db/src/schema/index.ts` | Export new schema |
| `scripts/seed.ts` | Add seed data for event_reminder_sent |
| Migration SQL + snapshot | **New** |
| `packages/zero/src/schema.ts` | Regenerate |
| `packages/zero/src/mutators/team-event.ts` | Add `reminderIntervals` to create/update |
| `packages/shared/src/event-reminders.ts` | **New** — preset constants |
| `packages/jobs/src/enqueue.ts` | 3 new payload types |
| `packages/jobs/src/schedules.ts` | 3 new cron schedules |
| `packages/jobs/src/handlers/index.ts` | Register 3 handlers |
| `packages/jobs/src/handlers/process-event-reminders.ts` | **New** |
| `packages/jobs/src/handlers/send-weekly-events-digest.ts` | **New** |
| `packages/jobs/src/handlers/process-post-event-reminders.ts` | **New** |
| `packages/notifications/src/send/reminders.ts` | 5 new notification functions |
| `apps/web/src/components/teams/events/event-form-dialog.tsx` | Add reminder field |
| `apps/web/src/components/teams/events/reminder-intervals-field.tsx` | **New** |

## Verification

1. Create event with reminder intervals → verify `reminder_intervals` persisted in DB
2. Trigger `process-event-reminders` manually → verify WhatsApp group message or individual sends
3. Trigger `send-weekly-events-digest` manually → verify message in orientation/all-volunteers groups
4. Create event with feedbackEnabled, advance endTime → trigger `process-post-event-reminders` → verify feedback nudge
5. Same for attendance and photo nudges
6. Recurring event: verify reminders fire for each occurrence independently
7. Cancel event → verify all reminders skip it
