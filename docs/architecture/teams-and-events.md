# Teams and events

> **Load when**: teams, team leads, event members, team or event WhatsApp groups, `teamEvent` mutators, `/events`, attendance, event updates, photos, feedback, interest, `unoriented_volunteer`, home dashboard, Analytics, Scheduled messages, Settings > WhatsApp groups.
> **Related**: `recurring-events.md`, `authorization.md`, `notifications.md`, `jobs.md`, `file-uploads.md`, `auth.md`

The volunteer side of the dashboard: teams, the events they run, and what happens around an event. Start at `packages/zero/src/mutators/team-event.ts`.

## Team leads

A team lead is a `teamMember` row with `role: "lead"`. It is unrelated to the custom `team_lead` role. Most event mutators call `assertHasPermissionOrTeamLead()` ([authorization](authorization.md)), so a lead can do on their own team's events what the global permission allows everywhere. The permission descriptions say "also granted to team leads" where this applies. The client mirrors it as `hasPermission("id") || isLead`.

## Teams

| Action | Who |
|---|---|
| See the teams you belong to (`/teams`) | `teams.view_own` |
| See every team | `teams.view_all` |
| Create a team | `teams.create` |
| Edit name, description, programme, WhatsApp group | `teams.edit` |
| Delete a team | `teams.delete` |
| Add or remove members, make or unmake leads | `teams.manage_members` or a lead of that team |

- Without `teams.view_all`, queries return only teams you are a member of, including `team.byId`.
- A lead cannot remove another lead; only `teams.manage_members` can.
- The add-member picker lists only active users who are not `unoriented_volunteer`. The mutator does not check this.
- A team may point only at an active programme.
- Delete is blocked while any reimbursement or vendor payment is charged to one of the team's events, or while the books hold a ledger entry for one. Why: those records must keep their event. Delete cascades the team's events.

### Team WhatsApp group

- Creating a group makes it in GoWA with only the creator's phone, then adds everyone else already on the team.
- Linking or switching a group adds the current members. The old group keeps its members.
- Member add and remove jobs look up the team's current group when the job runs.
- `whatsappGroupId: null` unlinks the group and removes no one; `undefined` leaves it unchanged.
- One owner per group: when the group changes, the server pass refuses a group used by another team or event, or by an app-wide group. Why: removing a member would remove them from the other owner's group. An event's own series shares its group. Links made before this rule keep working until changed (`whatsapp-group-link.ts`).

Invites instead of adds on the Cloud API, group JIDs and join links are in [notifications](notifications.md#group-invites).

## Events

An event (`teamEvent`) belongs to one team. This chapter covers one-time events; series, occurrences and edit scopes are in [recurring events](recurring-events.md).

### Visibility

`restrictToAccessibleEvents()` (`packages/zero/src/queries/team-event.ts`):

- `events.view_all` sees every event.
- `events.view_own` sees public events (`isPublic`), events they are a member of, and every event of their teams.
- Without either, queries return nothing.

`/events` has no route guard; every role except `external_user` holds `events.view_own`. The public website feed is separate ([public feed](recurring-events.md#public-feed)).

### Event actions

| Action | Permission (or a lead of the event's team) | Rules |
|---|---|---|
| Create | `events.create` | A start in the past needs `events.create_backdated` or lead |
| Edit | `events.edit` | Also toggles feedback and sets its deadline |
| Cancel | `events.cancel` | Only the permission cancels an event or series session that has started (one that didn't happen), and that cancel sends no notice; a lead without it cannot. For a series this applies to "This event" on the session's own start; "This and following" and "All upcoming events" never remove a started session ([recurring events](recurring-events.md#edit-and-cancel-scope)) |
| Add or remove members | `events.manage_members` | |
| Mark attendance | `events.manage_attendance` | Only after start |
| Approve or reject photos, delete any photo, delete the Immich album | `events.manage_photos` | |
| Approve or reject interest | `events.manage_interest` | |
| View feedback responses | `events.manage_feedback` | |
| Approve or reject updates | `event_updates.approve` | |

Kalakriti-managed events reject most of these mutators; their volunteers are managed from the Edition ([Kalakriti](kalakriti-registration.md)).

Creating an event that does not start in the past notifies the team. Event WhatsApp groups work as for teams. The event's own `teamEventMember` rows are added; team members are not. Changing a series' group with "All events" also moves its saved occurrences that were still on the old group (or had none, when the series had none), and clears them on "None". Occurrences given their own group keep it.

### Members and self-join

- Members of the event's team join themselves with `teamEvent.joinAsMember`, without `events.manage_members`, and can leave. Both only before the start.
- Anyone else gets in through interest (below), an admin add, a "Yes" on the WhatsApp RSVP poll ([notifications](notifications.md)), or a `/register?eventId=` sign-up link ([auth](auth.md#link-parameters)).
- Every add and remove path syncs the event's own WhatsApp group, if it has one. The team's group is not touched.

### Attendance

Attendance is set per member row, only after the event starts. For a series, the first session's attendance lives on the parent row, or on its start-date row when one exists ([first session](recurring-events.md#first-session)); every later session's lives on its materialised occurrence. On a past session not yet saved, the Volunteers tab offers "Mark attendance" to people who can open it (`events.edit` or a lead), which materialises it as the social recap does; others see a hint that a lead or editor must open it first.

### Interest

Volunteers who are not on the team ask to join a public event.

1. Interest needs a public, non-cancelled event that has not started. It rejects team members (they self-join), existing event members, a second request, and anyone holding `events.manage_interest`.
2. A lead or `events.manage_interest` approves or rejects. Approval adds the event member.
3. The volunteer can cancel a pending request, which deletes it.
4. `expire-event-interests` marks requests still pending at the event's start `expired` ([jobs](jobs.md#schedules)).

Pending requests are visible to `events.manage_interest` everywhere and to leads for their teams' events. Those reviewers also see each requester's phone, WhatsApp link and email inline, since leads rarely hold `users.view` and touch devices cannot open the hover card. Website sign-ups file interest after email verification ([auth](auth.md#link-parameters)).

### Event updates

Rich-text posts stored as Plate JSON ([editor](editor.md)).

- Posting opens when the event starts.
- A lead or `event_updates.create` posts approved, and the event's other members are notified.
- An event member without either posts `pending`; approvers approve or reject it with `event_updates.approve`.
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

- An event member's upload is `pending`. A lead or `events.manage_photos` uploads `approved`.
- Approval enqueues `immich-sync-photo`.
- A lead or `events.manage_photos` can also upload straight to Immich. That photo carries `immichAssetId` and no R2 key.
- The uploader may delete their own pending photo; anything else needs a lead or `events.manage_photos`.
- `doNotUse` on an approved photo (skip it in social posts) needs `events.manage_photos`, a lead, or `events.manage_attendance`, because the toggle sits in the lead's social recap ([Social API](social-api.md)).

Storage, the sync job, deletion and media access are in [file uploads](file-uploads.md#immich-event-photos).

### Anonymous feedback

- The window opens when the event ends (`endTime`, or `startTime` if there is none) and closes at the deadline. With no deadline it stays open.
- Only event members can submit, once each, with no new images. They can edit their response until the deadline.
- Anonymity: `eventFeedback` holds the text and no user. `eventFeedbackSubmission` links user to response and is never synced to clients; duplicate and ownership checks run on the server pass only. Members read their own response through a server function.
- `events.manage_feedback` grants only reading every event's responses; a lead reads their teams'. Nobody sees who wrote what.
- Turning feedback on after an event has ended notifies members at once. Turning it on earlier sends nothing at the end; the hourly feedback nudge covers that.

### Event schedules

| Job | When | Does |
|---|---|---|
| `process-event-reminders` | every 15 min | Pre-event reminders at the event's `reminderIntervals`, to participants, the group or both |
| `send-event-rsvp-polls` | every 15 min | WhatsApp RSVP poll `rsvpPollLeadMinutes` before start when `postRsvpPoll` is on |
| `process-post-event-reminders` | hourly | Feedback nudge 6 hours after the end; with `postEventNudgesEnabled`, 24 hours after the end, attendance and photo nudges when none exist |
| `remind-feedback-deadline` | daily 09:00 | Members who haven't responded, when the deadline is within 24 hours |
| `remind-photo-approval` | daily 10:00 | Leads and `events.manage_photos` holders, about pending photos |
| `send-weekly-events-digest` | Monday 07:00 | Upcoming events digest |

All times are IST; see [jobs](jobs.md).

## Orientation

`unoriented_volunteer` is the default for new users; its permissions and how a volunteer becomes oriented are in [auth](auth.md#orientation).

- They can show interest, and once an event member they can upload photos, post pending updates and give feedback.
- They cannot see teams, submit requests or vendors, or be picked as team members.

## WhatsApp groups

Settings > WhatsApp groups registers groups by name and JID for teams, events, scheduled messages and the app-wide groups. Deleting a group also deletes any app-config row pointing at it. Choosing the orientation and all-volunteers groups needs `settings.app_config`.

`scan-whatsapp-groups` (Monday 06:00) compares those two groups with users. It deactivates active users on WhatsApp who are in neither group, except accounts created in the last 30 days. From an account's second week, each scan sends the `group_join_reminder` template with a join-by date of creation plus 30 days; deactivation happens at the first scan after it. Reminders need the Cloud API; with it off nobody is re-added, because repeated adds are a ban signal. It reactivates inactive, unbanned users who are in one, and reports unregistered numbers to `system.alerts` holders. It aborts if the groups return no participants, so a GoWA outage can't deactivate everyone.

## Other pages

| Page | Who | Notes |
|---|---|---|
| Home (`/`) | Every signed-in user; each panel follows its permission or team leadership | People without `requests.view_own` get a welcome card; `external_user` is redirected to `/kalakriti` |
| Analytics (`/analytics`) | `requests.view_all` | Spending tab: reimbursements, advances and vendor payments, dated by when the money was spent (`spentAt`): a claim's expense date, a vendor payment's invoice date (unless rejected) else its first approved payment, an advance's submission. A vendor payment's date moves as it is paid and invoiced, and can differ from the books, which recognise vendor expenses on invoice acceptance. The home dashboard's spend totals use the same date. Outcomes tab: events held, children reached, volunteer hours and their value, with coverage notes and a breakdown by programme or team ([rules](finance-and-programmes.md#outcomes)) |
| Scheduled messages (`/scheduled-messages`) | `messages.schedule` | Each recipient is a `send-scheduled-whatsapp` job delayed to `scheduledAt`; a message with pending recipients must be cancelled before deletion |
