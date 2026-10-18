# Recurring events (RRULE)

> **Load when**: RRULE, recurrence, `seriesId`, `originalDate`, materialise, exdates, `excludeRules`, `expandSeries`, "this and following", `inheritVolunteers`, public events feed.
> **Related**: `data-layer.md`

## Model

RFC 5545 RRULEs on the `teamEvent` table:

- Series parent: `recurrenceRule` set, `seriesId` null.
- Exception (materialised occurrence): `seriesId` and `originalDate` set.
- Standalone: all null.

`parseRecurrenceRule` also accepts a rule stored as a JSON string, as older bun-sql writes left it (see jsonb in `data-layer.md`).

## Expansion

`expandSeries()` in `packages/shared/src/rrule-expand.ts` turns a rule into virtual occurrences for a range. Virtual occurrences have no rows. An occurrence becomes an exception row only when someone edits it, cancels it, adds a member or shows interest.

Recurrence validation runs both when a team-event mutation accepts a rule and immediately before expansion. Rules may be daily, weekly, monthly or yearly, with one time per date; compound recurrence sets and sub-daily frequencies are rejected because occurrence identity is an ISO date. Rule text, excluded dates and exclusion rules are size-bounded. Expansion also fails explicitly when a requested range would produce more than 10,000 dates instead of returning a partial series.

Zero queries sync only rows with `seriesId IS NULL` (parents and standalone events). Exceptions come through the parent's `exceptions` relation.

### First session

The series' first session is the parent row itself (`seriesStartDate`, its UTC start date), unless a saved row sits on that date (a start-date row):

- No start-date row: self-join, interest and website sign-ups on that date (or on the parent without a date) land on the parent, `materialize` refuses the date, and an event link with that `occDate` opens the parent, where attendance and the recap are recorded.
- A live start-date row (made by a `following` split, or by older code): it is the first session. Joins, interest and sign-ups for the date resolve to it, a start-date `occDate` link opens it, and the parent's page shows "Open this session" instead of join, interest, attendance or the recap.
- A cancelled start-date row: the first session is cancelled. The parent's page shows "First session cancelled", and joins for the date are refused.

`startDateRow` (`apps/web/src/lib/event-display-utils.ts`) finds the row for the page.

## Team page display

`buildEventDisplayRows`:

- Expands each series over `[startTime, UNTIL ?? caller's rangeEnd]`.
- Applies no range filter to exceptions: every non-cancelled exception renders. Series edits can orphan exceptions (see below), and this keeps them visible.
- A start-date row replaces the parent's own first-session line, so the date shows once (not at all when that row is cancelled).
- An exception row keeps `event` as the series parent (for recurrence and edit scopes) and carries the occurrence as `exception`. Displayed details, search and filters read `getRowDetails(row)`, the occurrence's own record.

## Edit and cancel scope

"This event", "This and following", "All events", as in Google Calendar.

| Scope | Edit | Cancel |
|---|---|---|
| `this` | Creates or updates an exception | Creates a cancelled exception |
| `following` | Truncates the series with UNTIL, starts a new series and moves the saved sessions on or after the date to it | Truncates UNTIL, cancels saved sessions keyed on or after the date that haven't started; a started one stays as an orphaned exception |
| `all` | Updates the series parent | Cancels the upcoming sessions ("All upcoming events"; see below) |

- Truncation sets `UNTIL` to the second before the split date starts in UTC (`<day before>T235959Z`). UNTIL is inclusive, so this keeps a session at exactly midnight UTC on the split date off the old series, whatever the series' wall-clock time.
- Cancelling `all` (`cancelSeriesAll`) never cancels a session that has started. Before any has, it cancels the series row and every exception. After, it cancels every saved session that hasn't started, by its own start time, and truncates UNTIL as `following` does from the day after the last started first session or unsaved occurrence. When only saved sessions have started, the cut lands on the first date and the rule is left empty. The series row and started sessions stay live with their attendance and recaps; a started saved session past the new UNTIL stays as an orphaned exception. The series reads as ended, not cancelled. If the series row's first session is still ahead but a session saved before it (left by an `all` edit that moved the start) has started, it refuses and asks for cancelling one session at a time. When nothing upcoming is left to cancel (no saved session ahead and no unsaved one past the cut), it refuses with "This series has no upcoming sessions."
- Reminders and polls stop with the rule and the cancelled rows. Since nothing started is cancelled, a lead without `events.cancel` may use it.
- Every scope sends one notice to the members of the saved sessions it cancelled, and to the series' volunteers when it passes them on and unsaved sessions were dropped, and closes each cancelled row's RSVP poll. On the start date with no saved row, "This event" counts the series row as the session. The email and in-app notice name what was cancelled: the session and its date and time in India time for "This event", the sessions from that date onwards for `following`, the upcoming sessions for `all` on a started series. WhatsApp still sends `event_cancelled`, which names only the event.
- The series row cancels only through `cancelSeries`; plain `cancel` refuses it. Its page and its line in the team list open the scope dialog for the first date, where "This event" cancels the first session (a cancelled start-date row, or the live one).
- `following` on the series' own start date is every session, so `updateSeries` and `cancelSeries` treat it as `all`, and the scope dialogs offer only "This event" and "All events" there.
- Every `all` edit also applies to a live start-date row, since it is the first session, but only for what the edit changes on the series row (`changedSeriesArgs`: the dialog submits every field prefilled from the series), so the row keeps its own details otherwise. `sessionFieldsFrom` leaves out roster inheritance and the group, and copies times only while the series still starts on the row's date.
- A `following` split inserts the new series row with an empty roster, then moves the old series' saved sessions on or after the date to it with their own members, attendance, interest, recaps and cancellation, so no date is listed twice. The split day's row takes the submitted fields, since the edit came from it: with its times it becomes the new series' start-date row ([first session](#first-session)); when the new rule moves the first date (another weekday, or a time across UTC midnight), it keeps its own times and stays a distinct session. Later rows keep their own details.
- The WhatsApp group follows the continuing series: the old row's group is cleared before the new row takes it (`team_event_whatsappGroupId_uidx` allows one series row per group). First, on the server, the old series' unsaved sessions before the split day that haven't ended are saved with that group in SQL (series fields, no recap, the series' volunteers when it passes them on; `saveSeriesSessions` skips a date a materialiser saved meanwhile), so their reminders, polls and joins keep it; ended unsaved sessions stay unsaved. Moved sessions still on the old group take the new one, and their members are added to it when the group changes. Sessions left on the old series keep their stored group. A series whose own first session is still upcoming at the split loses the group on that session, since the series row is that session.
- Orphaned exceptions: `all` can move the parent's start past existing exceptions, and a split that changes the time or weekday leaves moved sessions on dates the new rule no longer produces. Their dates then no longer match the expansion.
- A programme change applies forward only. Once a session of the series has started or money is charged to it, `updateSeries` rejects it in `all` scope (the start-date `following` included), so callers split (`following` from a later session) or use `this`; before that, `all` may change it, and saved sessions still on the old programme move with it (one given its own programme keeps it). Charges count unless rejected or voided. Every path that writes an occurrence copies `programmeId` and `costCentreId` from the series: `buildExceptionInsert`, the following-split insert, self-join, both background materialisers; `register-interest-db.ts` copies all columns.

### Edit form prefill

Both the team table and the event page prefill through `buildScopedEditInitialValues`:

- "This event": the occurrence's own values; partners and volunteer target fall back to the series' when the occurrence has none.
- "This and following" and "All events": the series parent's values, since they save to the parent.
- Times: "This event" and "This and following" use the occurrence's start and end; "All events" keeps the parent's, because `expandSeries` starts the series there.
- The recurrence rule always comes from the parent.
- On the event page the parent loads by a separate query. Until it arrives the two series scopes are disabled, so an occurrence's values never save over the series.

## Materialisation paths

| Path | Where | Trigger |
|---|---|---|
| `materialize` mutator | `packages/zero/src/mutators/team-event.ts` | Edit or add member on a virtual occurrence |
| `resolveJoinTarget` | `packages/zero/src/mutators/team-event.ts` | Self-join or interest on a virtual occurrence |
| Background job | `packages/jobs/src/lib/materialize-occurrences.ts` | Cron, for past occurrences with members |
| RSVP-poll materialiser | `packages/jobs/src/handlers/send-event-rsvp-polls.ts` | RSVP poll for a virtual occurrence |
| Website sign-up | `packages/auth/src/register-interest-db.ts` | Interest filed on email verification |

All honour `inheritVolunteers` (materialised occurrences copy the parent's members). The flag carries to exceptions through `buildExceptionInsert` and to new series through `updateSeriesFollowing`.

## Self-join

For a virtual occurrence, `teamEvent.joinAsMember` materialises the exception (bypassing the `materialize` permission) and inserts the member row. The unique index on (`seriesId`, `originalDate`) dedupes concurrent joins.

## Interest

- Interest is per session. `eventInterest.create` takes an optional occurrence date, validates it with `findOccurrence` and materialises through `resolveJoinTarget`, so the interest and its approval land on that session's row.
- Without an occurrence date, interest on a series parent that has started is rejected.
- Website sign-ups (`/register?interestEventId=&occDate=`) do the same server-side on email verification (`auth.md`).

## Public feed

`packages/shared/src/public-events.ts` expands series server-side:

- applies `exdates` and `excludeRules`;
- every exception row, cancelled ones included, replaces its virtual date; non-cancelled public exceptions are listed under their own ids;
- an exception without `publicArea` inherits the parent's;
- a cancelled or private parent hides all its occurrences; Kalakriti-managed events are never listed;
- exception rows load only when they start in the window or replace a date in it.

Cities are cost centres (`finance-and-programmes.md`):

- `?city=` takes an active cost centre code in any case (`BLR`); without it every active centre lists. An unknown or inactive code is a 400 naming the active codes. `bangalore` and `bengaluru` are deprecated aliases of `BLR` until the website moves to codes. Active codes are cached as `caching.md` describes.
- Each event's `city` is the code and `cityName` the centre's name. The area label appends that name unless the public area already names the city (Bangalore and Bengaluru, Mumbai and Bombay count as one).
- Inactive centres' events never list, and the register page shows no session summary for a sign-up link to one.
- `/api/public/openapi.json` is built per request from the active codes; a database failure returns 500.
