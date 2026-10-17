# Teams and events

> **Load when**: teams, team leads, `teamMember`, team or event WhatsApp group, `teamEvent` mutators, event members, self-join, `/events`, attendance, event updates, event photos, event feedback, event interest, `unoriented_volunteer`, home dashboard, Analytics, Scheduled messages, Settings > WhatsApp groups.
> **Related**: `recurring-events.md`, `authorization.md`, `notifications.md`, `jobs.md`, `file-uploads.md`, `editor.md`, `social-api.md`, `auth.md`

The volunteer side of the dashboard: teams, the events they run, and what happens around an event. Code lives in `apps/web/src/components/teams/` (team page and `events/`), `apps/web/src/components/events/` (the `/events` agenda), `apps/web/src/routes/_app/{teams,events}/`, and the Zero mutators and queries in `packages/zero/src/{mutators,queries}/` (`team`, `team-event`, `event-interest`, `event-photo`, `event-update`, `event-feedback`, `event-immich-album`).

## Team leads

A team lead is a `teamMember` row with `role: "lead"`. It is unrelated to the custom `team_lead` role. Most event mutators call `assertHasPermissionOrTeamLead()` ([authorization](authorization.md)), so a lead can do on their own team's events what the global permission allows everywhere. The permission descriptions in `packages/db/src/permissions.ts` say "also granted to team leads" where this applies. The client mirrors it as `hasPermission("id") || isLead` (`resolveEventDetailPermissions` in `routes/_app/events/$id.tsx`).

## Teams

| Action | Who |
|---|---|
| See the teams you belong to (`/teams`) | `teams.view_own` |
| See every team | `teams.view_all` |
| Create a team | `teams.create` |
| Edit name, description, programme, WhatsApp group | `teams.edit` |
| Delete a team | `teams.delete` |
| Add or remove members, make or unmake leads | `teams.manage_members` or a lead of that team |

- The `/teams` route needs either view permission. Without `teams.view_all`, queries return only teams you are a member of, including `team.byId`.
- A lead cannot remove another lead; only `teams.manage_members` can.
- The add-member picker lists only active users who are not `unoriented_volunteer`. The mutator does not check this.
- A team may point only at an active programme.
- Delete is blocked while any reimbursement or vendor payment is charged to one of the team's events, or while the books hold a ledger entry for one. Why: those records must keep their event. Delete cascades the team's events.
- Adding, removing, role changes, edits and deletion each enqueue a `notify-*` job.

### Team WhatsApp group

`team.whatsappGroupId` points at a `whatsappGroup` row. The team form can link an existing group or tick "create a group".

- Create enqueues `whatsapp-create-group`. It creates the group in GoWA with only the creator's phone, stores the `whatsappGroup` row, links it, then enqueues `whatsapp-add-members` for everyone else already on the team.
- Linking or switching a group enqueues `whatsapp-add-members` for the current members. The old group keeps its members.
- Adding a member enqueues `whatsapp-add-member-team`; removing enqueues `whatsapp-remove-member-team`. Both look up the team's current group when the job runs.
- "None" sends `whatsappGroupId: null`, which unlinks the group and removes no one; `undefined` leaves it unchanged.
- One owner per group: when the group changes, the server pass refuses a group used by another team or event, or by an app-wide group. Why: removing a member would remove them from the other owner's group. An event's own series shares its group. Links made before this rule keep working until changed (`whatsapp-group-link.ts`).

Invites instead of adds on the Cloud API, group JIDs and join links are in [notifications](notifications.md#group-invites).

## Events

An event (`teamEvent`) belongs to one team. It is created from the team page and opened at `/events/$id`. This chapter covers one-time events; series, occurrences, materialisation, edit scopes and per-session interest are in [recurring events](recurring-events.md).

### Visibility

`restrictToAccessibleEvents()` (`packages/zero/src/queries/team-event.ts`):

- `events.view_all` sees every event.
- `events.view_own` sees public events (`isPublic`), events they are a member of, and every event of their teams.
- Without either, queries return nothing.

`/events` has no route guard; every role except `external_user` holds `events.view_own`. It shows the accessible, non-cancelled agenda, and reviewers see a count of pending interest per event. The public website feed is separate ([public feed](recurring-events.md#public-feed)).

### Event actions

| Action | Permission (or a lead of the event's team) | Rules |
|---|---|---|
| Create | `events.create` | End after start. A start in the past needs `events.create_backdated` or lead |
| Edit | `events.edit` | Also toggles feedback and sets its deadline |
| Cancel | `events.cancel` | A lead without the permission cannot cancel an event that has started |
| Add or remove members | `events.manage_members` | Picker lists active users |
| Mark attendance | `events.manage_attendance` | Only after start |
| Approve or reject photos, delete any photo, delete the Immich album | `events.manage_photos` | |
| Approve or reject interest | `events.manage_interest` | |
| View feedback responses | `events.manage_feedback` | |
| Approve or reject updates | `event_updates.approve` | |

Kalakriti-managed events reject most of these mutators; their volunteers are managed from the Edition ([Kalakriti](kalakriti-registration.md)).

Creating an event that does not start in the past notifies the team (`notify-event-created`). Editing notifies members. Ticking "create a group", linking, switching, "None" and the one-owner rule work as for teams, with `entityType: "event"`. The event's own `teamEventMember` rows are added; team members are not. Changing a series' group with "All events" also moves its saved occurrences that were still on the old group (or had none, when the series had none), and clears them on "None"; their members join the same add task. Occurrences given their own group keep it.

### Members and self-join

Event members are `teamEventMember` rows.

- Members of the event's team join themselves with `teamEvent.joinAsMember`, without `events.manage_members`. The event must not have started.
- `teamEvent.leaveEvent` lets a member leave before the start, and notifies the leads.
- Anyone else gets in through interest (below), an admin add, a "Yes" on the WhatsApp RSVP poll ([notifications](notifications.md)), or a `/register?eventId=` sign-up link ([auth](auth.md#link-parameters)).
- Every add path enqueues `whatsapp-add-member` when the event has its own `whatsappGroupId`; removal and leaving enqueue `whatsapp-remove-member`. The team's group is not touched.

### Attendance

Attendance is per member row: `attendance` (`present`, `absent` or null) with `attendanceMarkedAt` and `attendanceMarkedBy`. `markAttendance` sets one; `markAllPresent` marks every member present. Both refuse before the event starts. For a series, attendance lives on each materialised occurrence, since only occurrence rows have members.

### Interest

Volunteers who are not on the team ask to join a public event.

1. `eventInterest.create` needs a public, non-cancelled event that has not started. It rejects team members (they self-join), existing event members, a second request, and anyone holding `events.manage_interest`. It notifies the team's leads.
2. A lead or `events.manage_interest` approves or rejects. Approval inserts the `teamEventMember` row and enqueues `whatsapp-add-member` if the event has a group; both outcomes notify the volunteer.
3. The volunteer can cancel a pending request, which deletes it.
4. `expire-event-interests` marks requests still pending at the event's start `expired` ([jobs](jobs.md#schedules)).

Approve, reject and cancel all require `pending`. Pending requests are visible to `events.manage_interest` everywhere and to leads for their teams' events. Website sign-ups file interest after email verification ([auth](auth.md#link-parameters)).

### Event updates

Rich-text posts on an event's Updates tab, stored as Plate JSON in `eventUpdate.content` (up to 50,000 characters) and edited with the Plate editor ([editor](editor.md)).

- Posting opens when the event starts.
- A lead or `event_updates.create` posts approved, and the event's other members are notified.
- An event member without either posts `pending`; approvers are notified and approve or reject it with `event_updates.approve`.
- Only leads and `event_updates.create` may add new images. Others can keep images already in the content but not add any (`packages/zero/src/lib/event-update-content.ts`).

| Edit or delete | Rule |
|---|---|
| Edit own | `event_updates.edit_own`, and not once approved |
| Edit any, including approved | `event_updates.edit_all` |
| Delete own pending or rejected | Always allowed to the author |
| Delete own approved | `event_updates.delete_own` |
| Delete any | `event_updates.delete_all` |

Rejected updates can't be edited. Approvers see all pending updates; leads see their teams'; authors see their own.

### Event photos

Photos open when the event starts.

- An event member uploads to R2 and the photo is `pending`. A lead or `events.manage_photos` uploads `approved`.
- Approval, single or batch, enqueues `immich-sync-photo` and notifies the uploader.
- A lead or `events.manage_photos` can also upload photos and videos straight to Immich (`uploadPhotoToImmich` in `apps/web/src/functions/immich-upload.ts`, 20 MB images, 500 MB videos). That photo carries `immichAssetId` and no R2 key.
- The uploader may delete their own pending photo; anything else needs a lead or `events.manage_photos`.
- `doNotUse` on an approved photo (skip it in social posts) needs `events.manage_photos`, a lead, or `events.manage_attendance`, because the toggle sits in the lead's social recap ([Social API](social-api.md)).

Storage, the sync job, deletion and media access are in [file uploads](file-uploads.md#immich-event-photos).

### Anonymous feedback

Leads and editors enable feedback per event (`feedbackEnabled`), with an optional `feedbackDeadline`, in the event form.

- The window opens when the event ends (`endTime`, or `startTime` if there is none) and closes at the deadline. With no deadline it stays open.
- Only event members can submit, once each, up to 5,000 characters, with no new images. They can edit their response until the deadline.
- Anonymity: `eventFeedback` holds the text and no user. `eventFeedbackSubmission` links user to response and is never synced to clients; duplicate and ownership checks run on the server pass only. Members read their own response through `getMyEventFeedback` (`apps/web/src/functions/event-feedback.ts`).
- `events.manage_feedback` grants only reading every event's responses; a lead reads their teams'. Nobody sees who wrote what.
- Turning feedback on after an event has ended notifies members at once. Turning it on earlier sends nothing at the end; the hourly feedback nudge covers that.

### Event schedules

| Job | When | Does |
|---|---|---|
| `process-event-reminders` | every 15 min | Pre-event reminders at the event's `reminderIntervals`, to participants, the group or both (`reminderTarget`) |
| `send-event-rsvp-polls` | every 15 min | WhatsApp RSVP poll `rsvpPollLeadMinutes` before start (default 3 days) when `postRsvpPoll` is on |
| `process-post-event-reminders` | hourly | Feedback nudge 6 hours after the end to members who haven't responded; with `postEventNudgesEnabled`, 24 hours after the end, an attendance reminder to leads and the creator if none is marked, and a photo nudge to members if none was uploaded |
| `remind-feedback-deadline` | daily 09:00 | Members who haven't responded, when the deadline is within 24 hours |
| `remind-photo-approval` | daily 10:00 | Leads and `events.manage_photos` holders, about pending photos |
| `send-weekly-events-digest` | Monday 07:00 | Upcoming events digest |

All times are IST; see [jobs](jobs.md).

## Orientation

`unoriented_volunteer` is the default for new users. It grants only `events.view_own` (`UNORIENTED_VOLUNTEER_PERMISSIONS`).

- They see the welcome dashboard, `/events` and the events they can access. They can show interest, and once an event member they can upload photos, post pending updates and give feedback.
- They cannot see teams, submit requests or vendors, or be picked as team members. The nav shows only what their permissions allow.
- They sit in the orientation WhatsApp group.

A volunteer becomes oriented when an admin with `users.edit` changes their role to `volunteer` on `/users`, or when Kalakriti enrolment promotes them. Either path enqueues `whatsapp-manage-orientation`, which adds them to the all-volunteers group and removes them from the orientation group. Details are in [auth](auth.md#orientation).

## WhatsApp groups

Settings > WhatsApp groups (`routes/_app/settings/whatsapp-groups.tsx`, `components/settings/sections/whatsapp-groups-section.tsx`) needs `settings.whatsapp_groups`. It registers groups by name and JID for teams, events, scheduled messages and the app-wide groups. Deleting a group also deletes any app-config row pointing at it.

The "New volunteer group" and "Orientation completed group" pickers on the same page write `orientation_group_id` and `all_volunteers_group_id`, which needs `settings.app_config`.

`scan-whatsapp-groups` (Monday 06:00) compares those two groups with users. It deactivates active users on WhatsApp who are in neither group, reactivates inactive, unbanned users who are in one, and reports unregistered numbers to `system.alerts` holders. It aborts if the groups return no participants, so a GoWA outage can't deactivate everyone.

`/whatsapp-groups/$groupId/join` is the landing page for group invite buttons ([notifications](notifications.md#group-invites)).

## Other pages

| Page | For | Who | Code |
|---|---|---|---|
| Home (`/`) | Pending reviews (requests, vendor payments, event photos, updates, interest), my teams, recent activity, upcoming events and stat cards. People without `requests.view_own` get a welcome card instead; `external_user` is redirected to `/kalakriti` | Every signed-in user; each panel follows its permission or team leadership | `routes/_app/index.tsx`, `components/dashboard/`, `components/stats/` |
| Analytics (`/analytics`) | Spending charts over reimbursements, advances and vendor payments, by date range and city | `requests.view_all` | `routes/_app/analytics.tsx`, `components/analytics/`, `lib/stats.ts` |
| Scheduled messages (`/scheduled-messages`) | WhatsApp messages with attachments to up to 10 groups or users at a set time. Each recipient is a `send-scheduled-whatsapp` job delayed to `scheduledAt`; a failed recipient can be retried up to 3 times (`MAX_RECIPIENT_RETRIES`); a message with pending recipients must be cancelled before deletion | `messages.schedule` | `routes/_app/scheduled-messages.tsx`, `packages/zero/src/mutators/scheduled-message.ts` |
