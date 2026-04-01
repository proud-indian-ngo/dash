# Recurring Events: RRULE + Virtual Expansion

**Date**: 2026-04-01
**Status**: Approved

## Context

Repeating events currently use a parent-child materialization model: a parent row holds a simple frequency enum (`weekly | biweekly | monthly`), and a daily cron job generates child rows for each occurrence. This creates several problems:

- **Clunky UX**: Expandable subtable with pagination to see occurrences
- **Limited recurrence**: Only 3 fixed frequencies, immutable after creation
- **Row explosion**: Every occurrence is a DB row, even if never interacted with
- **Propagation issues**: Adding a member to the series requires cron to copy to future children

## Design: RRULE + Virtual Expansion

Replace the parent-child materialization model with RFC 5545 RRULE strings and client-side virtual expansion. Only materialize occurrence rows when they accumulate state (attendance, photos, member overrides, financial associations).

## Data Model

### `teamEvent` table changes

**Add columns**:
- `seriesId` (UUID, nullable, FK → `teamEvent.id`) — null for standalone/series parent, set for exceptions
- `originalDate` (date, nullable) — on exception rows, the date this exception replaces

**Replace `recurrenceRule`** from `{ frequency, endDate? }` to `{ rrule: string; exdates?: string[] }`:
- `rrule`: RFC 5545 string (e.g., `FREQ=WEEKLY;BYDAY=SA;UNTIL=20260601`)
- `exdates`: ISO date strings for excluded dates

**Drop columns**: `parentEventId`, `copyAllMembers`
**Drop rows**: All existing child event rows (where `parentEventId` was set)

### Three row types

| Type | `recurrenceRule` | `seriesId` | `originalDate` |
|---|---|---|---|
| Standalone event | `null` | `null` | `null` |
| Series parent | `{ rrule, exdates? }` | `null` | `null` |
| Exception | `null` | parent's ID | date it overrides |

### Member inheritance

- Members on series parent = default participants for all virtual occurrences
- Members on exception row = overridden participant list for that occurrence
- No cron job needed — virtual occurrences inherit the series member list

## Recurrence Engine

### Library: `rrule.js` (client + server)

### Supported patterns

| Pattern | RRULE |
|---|---|
| Every Saturday | `FREQ=WEEKLY;BYDAY=SA` |
| Every Saturday except 3rd | `FREQ=WEEKLY;BYDAY=SA` + exdates |
| Mon/Wed/Fri | `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| Biweekly Tuesday | `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU` |
| First Saturday of month | `FREQ=MONTHLY;BYDAY=1SA` |
| Daily for 30 days | `FREQ=DAILY;COUNT=30` |
| Every 3 days | `FREQ=DAILY;INTERVAL=3` |

### Expansion function

```
expandSeries(series, rangeStart, rangeEnd) → VirtualOccurrence[]
```

1. Parse RRULE → generate dates in `[rangeStart, rangeEnd]`
2. Remove dates in `exdates`
3. Remove dates that have a materialized exception row
4. Return virtual occurrences with inherited fields

### Range-bounded expansion

- Events table: next 4 weeks (adjustable range picker)
- Dashboard widget: next 5 occurrences
- Dropdowns (vendor payment linking): next 3 months + "Show more"
- Detail page: one occurrence forward/backward

### Materialization trigger

An occurrence materializes (exception row created) when:
- User edits that specific occurrence
- Volunteer is added/removed from that occurrence
- Attendance is marked
- Photo/update is posted
- Financial record (reimbursement, vendor payment) is linked
- Occurrence is cancelled individually

Materialization is automatic, transactional, and invisible to the user.

### Cron job replacement

Current `create-recurring-events` daily job is **removed**. Replaced by:
- Notification job: expands RRULE to find tomorrow's occurrences, sends reminders (no row creation)

## Editing Semantics (Google Calendar Style)

### Three edit modes

**"This event"**: Materialize (if virtual) → apply changes to exception row only.

**"This and following events"**: Split the series:
1. Truncate original RRULE with `UNTIL=<day before split>`
2. Create new series from split date with edited fields + continued pattern
3. Re-parent exceptions on/after split date to new series

**"All events"**: Update series parent. Prompt: keep or reset modified occurrences.

### Cancellation modes

- **This event**: Materialize + set `cancelledAt`, or add to `exdates`
- **This and following**: Truncate RRULE with `UNTIL`
- **All events**: Cancel series parent + all exceptions

### Recurrence is now editable

Change frequency, days, interval, end date at any time via "All events" or "This and following."

## UI Changes

### Events table

- **Flat list** of occurrences within a date range (no expand/collapse subtable)
- Series events show `RepeatIcon` + recurrence label
- Default range: upcoming 4 weeks with range picker
- Row actions → "This event / This and following / All events" prompt

### Event creation form

- Rich recurrence builder: frequency, interval, day picker, monthly options
- End conditions: Never / After N occurrences / On date
- **Preview**: Next 5 occurrence dates shown below picker

### Event detail page

- Series info card with link to series parent
- "← Previous / Next →" occurrence navigation
- Virtual occurrences show inherited members, empty state for attendance/photos

### Events list page (`/events`) — visibility rethink

**Current**: Shows only public events. Private events only visible under team → events.

**New**: Unified event list showing:
1. All public events (expanded occurrences)
2. Private events where user is a member of the event OR a member of the event's team

Query returns series parents + exceptions the user can access. Client expands RRULE for the combined list. Tabs or filter to toggle "All events" / "My events" / "Public".

### Dashboard upcoming events widget

Same visibility rules — include private events the user has access to. Expands RRULE for next 5 occurrences across all accessible series.

## Migration

Clean-cut (no backwards compatibility needed):

1. Delete all child event rows (where `parentEventId` is set)
2. Convert parent `recurrenceRule` frequency → RRULE string
3. Drop `parentEventId`, `copyAllMembers` columns
4. Add `seriesId`, `originalDate` columns
5. Regenerate Zero schema

## Key Files to Modify

- `packages/db/src/schema/team-event.ts` — schema changes
- `packages/zero/src/schema.ts` — regenerate
- `packages/zero/src/mutators/team-event.ts` — create/update/cancel with RRULE + edit modes
- `packages/zero/src/queries/team-event.ts` — query changes
- `packages/jobs/src/handlers/create-recurring-events.ts` — replace with notification-only job
- `packages/jobs/src/lib/recurrence.ts` — replace with rrule.js-based expansion
- `apps/web/src/components/teams/events/events-table.tsx` — flat occurrence list
- `apps/web/src/components/teams/events/events-table-columns.tsx` — remove expand, update recurrence column
- `apps/web/src/components/teams/events/event-occurrences-subtable.tsx` — remove (replaced by flat list)
- `apps/web/src/components/teams/events/event-form-dialog.tsx` — rich recurrence builder
- `apps/web/src/components/teams/events/event-detail.tsx` — series nav, virtual occurrence display
- `apps/web/src/components/teams/events/event-details-card.tsx` — RRULE display
- `apps/web/src/components/teams/events/events-table-helpers.tsx` — expansion utilities
- `apps/web/src/components/dashboard/upcoming-events.tsx` — expand RRULE for widget
- `apps/web/src/components/events/public-events-table.tsx` — show expanded occurrences

## New Shared Utilities

- `packages/jobs/src/lib/rrule-expand.ts` (or shared package) — `expandSeries()`, `materializeOccurrence()`, `splitSeries()`, RRULE↔UI conversion helpers
