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

## Edit/Cancel Scope

Google Calendar-style scope selection ("This event" / "This and following" / "All events"):

| Mode | Edit behavior | Cancel behavior |
|---|---|---|
| `this` | Creates/updates exception row | Creates cancelled exception (exdate) |
| `following` | Truncates original series UNTIL, creates new series | Truncates original UNTIL, cancels exceptions on/after date |
| `all` | Updates series parent directly | Cancels series parent + all exceptions |

Mutators: `teamEvent.updateSeries`, `teamEvent.cancelSeries`, `teamEvent.materialize`.

## Self-Join Materialization

`teamEvent.joinAsMember` lets regular team members self-join an event without `events.edit` or team-lead perms. For a virtual occurrence, client passes `{occDate, materializedId}` — server materializes the exception row server-side (bypasses `teamEvent.materialize` perm gate) and inserts the `teamEventMember` row pointing to it. Uses the (`seriesId`, `originalDate`) unique index to dedupe concurrent joins.

Auth gate: must be a member of `event.teamId` via `teamMember` table.

## RRULE Utilities

`packages/zero/src/lib/rrule-utils.ts` → exported as `@pi-dash/zero/rrule-utils`:

- `expandSeries()` — expand RRULE into virtual occurrences in date range
- `rruleToFormState()` / `formStateToRRule()` — convert between RRULE strings + UI form state
- `rruleToLabel()` — human-readable description
- `toISODate()` — date formatting helper
