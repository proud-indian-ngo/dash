# Recurring Events (RRULE)

> **Load when**: `teamEvent`, RRULE, recurrence, `seriesId`, `originalDate`, materialize, exdate, expand, `VirtualOccurrence`, series parent, "this and following".
> **Related**: `data-layer.md`

## Data Model

RFC 5545 RRULE-based. `teamEvent` table, three recurrence columns:

| Column | Type | Purpose |
|---|---|---|
| `recurrenceRule` | `jsonb` | `{ rrule: string, exdates?: string[] }` on series parent; null for standalone + exceptions |
| `seriesId` | `text` | FK → series parent; null for standalone + series parents |
| `originalDate` | `text` | ISO date (YYYY-MM-DD) — which occurrence this exception replaces |

- **Series parent**: `recurrenceRule` set, `seriesId: null`
- **Exception** (materialized): `seriesId` set, `originalDate` set
- **Standalone**: all three null

## Client-Side Expansion

Virtual occurrences expanded client-side via `expandSeries()` from `@pi-dash/zero/rrule-utils`. Takes date range → `VirtualOccurrence[]`. **No DB rows** exist for these. Only when user modifies a specific occurrence (edit, cancel, add member) does it "materialize" into an exception row via `materialize` mutator.

Zero queries filter `seriesId IS NULL` → only series parents + standalone events sync. Exceptions fetched via `exceptions` relation on series parent.

### Team detail display range

`buildEventDisplayRows` (`apps/web/src/components/teams/events/events-table-helpers.tsx`) expands each series over its **own** range: `[event.startTime, ruleUntil ?? callerRangeEnd]`. Bounded series (with `UNTIL`) always render every occurrence regardless of the caller's window; unbounded series are capped by the caller's `rangeEnd`. Exceptions have no upper bound — see "Post-split orphan exceptions" below.

## Edit/Cancel Scope

Google Calendar-style scope selection ("This event" / "This and following" / "All events"):

| Mode | Edit behavior | Cancel behavior |
|---|---|---|
| `this` | Creates/updates exception row | Creates cancelled exception (exdate) |
| `following` | Truncates original series UNTIL, creates new series | Truncates original UNTIL, cancels exceptions on/after date |
| `all` | Updates series parent directly | Cancels series parent + all exceptions |

Mutators: `teamEvent.updateSeries`, `teamEvent.cancelSeries`, `teamEvent.materialize`.

### UNTIL boundary

`buildTruncatedRRule` (`packages/zero/src/mutators/team-event-series.ts`) sets `UNTIL=<splitDate>T000000Z`. Any occurrence at or after `splitDate 00:00Z` is excluded (belongs to the new series); earlier occurrences stay on the old series. Using midnight UTC keeps the boundary TZ-clean regardless of the series' wall-clock time.

### Orphaned exceptions

Series edits like `all` and `following` can shift the parent's DTSTART or truncate its UNTIL, leaving materialized exception rows whose `originalDate` or `startTime` no longer lines up with the current RRULE expansion. Examples:

- `updateSeriesFollowing` does **not** migrate exceptions with `originalDate >= splitDate` to the new series — they stay on the old parent, past its truncated UNTIL.
- `updateSeriesAll` can move the parent's `startTime` forward, leaving exceptions whose `startTime` is before the new DTSTART.

To keep them visible, the team detail display applies **no range filter** to exception rows — every non-cancelled exception renders, regardless of how its timestamps relate to the current RRULE.

## Self-Join Materialization

`teamEvent.joinAsMember` lets regular team members self-join an event without `events.edit` or team-lead perms. For a virtual occurrence, client passes `{occDate, materializedId}` — server materializes the exception row server-side (bypasses `teamEvent.materialize` perm gate) and inserts the `teamEventMember` row pointing to it. Uses the (`seriesId`, `originalDate`) unique index to dedupe concurrent joins.

Auth gate: must be a member of `event.teamId` via `teamMember` table.

## Interest and the public feed

Interest is per session. `eventInterest.create` takes optional `occDate` + `materializedId`: the date is validated with `findOccurrence` (`@pi-dash/shared/rrule-expand`) and the session is materialized through `resolveJoinTarget`, exactly like self-join, so the interest and its approval land on that session's row. Without `occDate`, a series parent that has started is rejected. The event page's "Show Interest" dialog and the `/events` cards pass the virtual occurrence's date (or the existing exception id) and the dialog opens the session afterwards. Website sign-ups (`/register?interestEventId=&occDate=`) do the same server-side on email verification. `parseRecurrenceRule` also accepts rules stored as a JSON string (Drizzle on bun-sql writes jsonb that way). The public events feed (`@pi-dash/shared/public-events`) expands series server-side: it applies `exdates`/`excludeRules`, lets every exception row (cancelled ones included) replace its virtual date, lists non-cancelled public exceptions on their own ids, and inherits the parent's `publicArea` when an exception has none. A cancelled or private parent hides all of its occurrences, and Kalakriti-managed events are never listed. Exception rows are loaded only when they start in the window or replace a date in it.

## Volunteer Inheritance

Series parents have an `inheritVolunteers` boolean column (default `false`). When `true`, all materialized occurrences copy `teamEventMember` rows from the series parent.

Three materialization paths check this flag:

| Path | File | Trigger |
|---|---|---|
| Background job | `packages/jobs/src/lib/materialize-occurrences.ts` | Cron: past occurrences with members |
| `materialize` mutator | `packages/zero/src/mutators/team-event.ts` | UI: edit/add-member on virtual occurrence |
| `resolveJoinTarget` | `packages/zero/src/mutators/team-event.ts` | Self-join on virtual occurrence |

UI: "Inherit volunteers" checkbox in event form, visible only when recurrence is configured. The setting propagates to exceptions via `buildExceptionInsert` and to new series via `updateSeriesFollowing`.

## RRULE Utilities

`packages/zero/src/lib/rrule-utils.ts` → exported as `@pi-dash/zero/rrule-utils`:

- `expandSeries()` — expand RRULE into virtual occurrences in date range
- `rruleToFormState()` / `formStateToRRule()` — convert between RRULE strings + UI form state
- `rruleToLabel()` — human-readable description
- `toISODate()` — date formatting helper
