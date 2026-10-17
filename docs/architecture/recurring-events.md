# Recurring events (RRULE)

> **Load when**: `teamEvent`, RRULE, recurrence, `seriesId`, `originalDate`, materialize, exdate, `excludeRules`, `expandSeries`, `VirtualOccurrence`, series parent, "this and following", `inheritVolunteers`.
> **Related**: `data-layer.md`

## Model

RFC 5545 RRULEs on the `teamEvent` table:

| Column | Type | Purpose |
|---|---|---|
| `recurrenceRule` | `jsonb` | `{ rrule, exdates?, excludeRules? }` on a series parent; null otherwise |
| `seriesId` | `text` | The series parent, on exceptions only |
| `originalDate` | `text` | ISO date (YYYY-MM-DD) of the occurrence an exception replaces |
| `inheritVolunteers` | `boolean` | Series parent only (default `false`): materialised occurrences copy the parent's `teamEventMember` rows |

- Series parent: `recurrenceRule` set, `seriesId` null.
- Exception (materialised occurrence): `seriesId` and `originalDate` set.
- Standalone: all null.

`excludeRules` are RRULEs for dates to skip (for example every third Saturday). `parseRecurrenceRule` also accepts a rule stored as a JSON string, as older bun-sql writes left it (see jsonb in `data-layer.md`).

## Expansion

`expandSeries()` and `findOccurrence()` in `packages/shared/src/rrule-expand.ts` turn a rule into `VirtualOccurrence`s (date, start, end) for a range. Virtual occurrences have no rows. An occurrence becomes an exception row only when someone edits it, cancels it, adds a member or shows interest.

Zero queries sync only rows with `seriesId IS NULL` (parents and standalone events). Exceptions come through the parent's `exceptions` relation.

Form and label helpers are in `packages/zero/src/lib/rrule-utils.ts` (`@pi-dash/zero/rrule-utils`): `rruleToFormState`/`formStateToRRule`, `rruleToLabel`, `truncateRRule`, exclude-rule builders and labels, `toISODate`.

## Team page display

`buildEventDisplayRows` (`apps/web/src/components/teams/events/events-table-helpers.tsx`):

- Expands each series over its own range, `[startTime, UNTIL ?? caller's rangeEnd]`. Bounded series show every occurrence; unbounded ones stop at the caller's range end.
- Applies no range filter to exceptions: every non-cancelled exception renders. Series edits can orphan exceptions (see below), and this keeps them visible.
- An exception row keeps `event` as the series parent (for `seriesId`, recurrence and edit scopes) and carries the occurrence as `exception`. Name, location, city (cost centre), visibility, search and filters read `getRowDetails(row)`, the occurrence's own record.

## Edit and cancel scope

"This event", "This and following", "All events", as in Google Calendar. Mutators: `teamEvent.updateSeries`, `teamEvent.cancelSeries`, `teamEvent.materialize`.

| Scope | Edit | Cancel |
|---|---|---|
| `this` | Creates or updates an exception | Creates a cancelled exception |
| `following` | Truncates the series with UNTIL, creates a new series | Truncates UNTIL, cancels exceptions on or after the date |
| `all` | Updates the series parent | Cancels the parent and all exceptions |

- `buildTruncatedRRule` (`packages/zero/src/mutators/team-event-series.ts`) sets `UNTIL=<splitDate>T000000Z`. Midnight UTC keeps the boundary timezone-clean whatever the series' wall-clock time.
- Orphaned exceptions: `following` does not move exceptions on or after the split to the new series, and `all` can move the parent's start past existing exceptions. Their dates then no longer match the expansion.
- A programme change applies forward only. `updateSeries` rejects it in `all` scope, so callers split (`following`) or use `this`. Every path that writes an occurrence copies `programmeId` and `costCentreId` from the series: `buildExceptionInsert`, the following-split insert, self-join, both background materialisers; `register-interest-db.ts` copies all columns.

### Edit form prefill

Both the team table and the event page prefill through `buildScopedEditInitialValues` (`event-form-initial-values.ts`):

- "This event": the occurrence's own values; partners and volunteer target fall back to the series' when the occurrence has none.
- "This and following" and "All events": the series parent's values, since they save to the parent.
- Times: "This event" and "This and following" use the occurrence's start and end; "All events" keeps the parent's, because `expandSeries` starts the series there.
- The recurrence rule always comes from the parent.
- On the event page the parent loads by a separate query. Until it arrives the dialog disables the two series scopes and the builder returns null for them, so an occurrence's values never save over the series.

## Materialisation paths

| Path | Where | Trigger |
|---|---|---|
| `materialize` mutator | `packages/zero/src/mutators/team-event.ts` | Edit or add member on a virtual occurrence |
| `resolveJoinTarget` | `packages/zero/src/mutators/team-event.ts` | Self-join or interest on a virtual occurrence |
| Background job | `packages/jobs/src/lib/materialize-occurrences.ts` | Cron, for past occurrences with members |
| RSVP-poll materialiser | `packages/jobs/src/handlers/send-event-rsvp-polls.ts` | RSVP poll for a virtual occurrence |
| Website sign-up | `packages/auth/src/register-interest-db.ts` | Interest filed on email verification |

All honour `inheritVolunteers`. The "Inherit volunteers" checkbox shows only when recurrence is set; the flag carries to exceptions through `buildExceptionInsert` and to new series through `updateSeriesFollowing`.

## Self-join

`teamEvent.joinAsMember` lets members of `event.teamId` join without `events.edit` or team-lead rights. For a virtual occurrence the client passes `{ occDate, materializedId }`; the server materialises the exception (bypassing the `materialize` permission) and inserts the `teamEventMember` row. The unique index on (`seriesId`, `originalDate`) dedupes concurrent joins.

## Interest

- Interest is per session. `eventInterest.create` takes optional `occDate` and `materializedId`, validates the date with `findOccurrence` and materialises through `resolveJoinTarget`, so the interest and its approval land on that session's row.
- Without `occDate`, interest on a series parent that has started is rejected.
- The event page's "Show Interest" dialog and `/events` rows pass the occurrence date (or existing exception id); the dialog then opens the session.
- Website sign-ups (`/register?interestEventId=&occDate=`) do the same server-side on email verification (`auth.md`).

## Public feed

`packages/shared/src/public-events.ts` expands series server-side:

- applies `exdates` and `excludeRules`;
- every exception row, cancelled ones included, replaces its virtual date; non-cancelled public exceptions are listed under their own ids;
- an exception without `publicArea` inherits the parent's;
- a cancelled or private parent hides all its occurrences; Kalakriti-managed events are never listed;
- exception rows load only when they start in the window or replace a date in it.

Cities are cost centres (`finance-and-programmes.md`):

- `?city=` takes an active cost centre code in any case (`BLR`); without it every active centre lists. An unknown or inactive code is a 400 naming the active codes. `bangalore` and `bengaluru` are deprecated aliases of `BLR` until the website moves to codes (`normalisePublicCityCode`). Active codes come from `getPublicCostCentres` (`packages/db/src/queries/public-events.ts`), cached as `caching.md` describes.
- Each event's `city` is the code and `cityName` the centre's name. The area label appends that name ("Iblur, Bangalore") unless the public area already names the city (Bangalore and Bengaluru, Mumbai and Bombay count as one).
- Inactive centres' events never list, and the register page shows no session summary for a sign-up link to one.
- `/api/public/openapi.json` is built per request from the active codes; a database failure returns 500.
