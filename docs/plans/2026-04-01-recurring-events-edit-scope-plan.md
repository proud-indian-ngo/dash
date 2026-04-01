# Recurring Events: Google Calendar-Style Edit/Cancel Scope UI

**Date**: 2026-04-01
**Status**: Planned
**Depends on**: RRULE + Virtual Expansion (implemented on `feat/rrule-recurring-events`)

## Context

The `updateSeries` and `cancelSeries` mutators with "this/following/all" modes are built and tested. The UI currently uses the simple `update` and `cancel` mutators, bypassing the scope selection. This plan wires the scope prompt into every edit/cancel interaction for recurring events.

## Files to Create

### `apps/web/src/components/teams/events/edit-scope-dialog.tsx`

Reusable dialog that asks "This event / This and following / All events".

```ts
type EditScope = "this" | "following" | "all";
interface EditScopeDialogProps {
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: EditScope) => void;
  open: boolean;
  title: string; // "Edit recurring event" or "Cancel recurring event"
}
```

Three buttons stacked vertically: "This event only", "This and following events", "All events in the series".

## Files to Modify

### 1. `apps/web/src/components/teams/events/event-detail.tsx`

**Edit flow:**
- Current: "Edit" button → opens `EventFormDialog` directly
- New: "Edit" button → if recurring, show `EditScopeDialog` first → then open form
- Track `editScope` state: `{ scope: EditScope; occDate?: string } | null`
- On scope selected:
  - `"this"`: If virtual, materialize first (already built). Open form targeting the exception.
  - `"following"`: Open form. On submit, call `updateSeries({ mode: "following", originalDate, newSeriesId: uuidv7(), ... })`
  - `"all"`: Open form targeting the series parent. On submit, call `updateSeries({ mode: "all", ... })`
- Non-recurring events: skip scope dialog, open form directly (current behavior)

**Cancel flow:**
- Current: "Cancel Event" → confirm dialog → `cancel` mutator
- New: "Cancel Event" → if recurring, show `EditScopeDialog` (title: "Cancel recurring event") → then confirm
- On scope selected:
  - `"this"`: `cancelSeries({ mode: "this", originalDate, newExceptionId })` — already wired for virtual occurrences, extend for materialized exceptions
  - `"following"`: `cancelSeries({ mode: "following", originalDate })`
  - `"all"`: `cancelSeries({ mode: "all" })`
- Non-recurring events: skip scope dialog, confirm directly (current behavior)

**Key detail:** `isRecurring` = `!!event.recurrenceRule || !!event.seriesId`. Series parents have `recurrenceRule`; exceptions have `seriesId`. Both need the scope prompt.

### 2. `apps/web/src/components/teams/events/event-form-dialog.tsx`

**Add props:**
- `editScope?: EditScope` — determines which mutator to call on submit
- `originalDate?: string` — the occurrence date being edited (for "this" and "following")

**Submit logic change:**
- If `editScope === "all"`: call `mutators.teamEvent.updateSeries({ mode: "all", recurrenceRule, ...fields })`
- If `editScope === "following"`: call `mutators.teamEvent.updateSeries({ mode: "following", originalDate, newSeriesId: uuidv7(), recurrenceRule, ...fields })`
- If `editScope === "this"`: call `mutators.teamEvent.updateSeries({ mode: "this", originalDate, newExceptionId: uuidv7(), ...fields })`
- If no `editScope` (non-recurring): call `mutators.teamEvent.update(...)` as today

**Recurrence field visibility:**
- `editScope === "all"`: Show recurrence builder (can change the pattern)
- `editScope === "following"`: Show recurrence builder (new series gets its own pattern)
- `editScope === "this"`: Hide recurrence builder (editing a single occurrence)
- No editScope (create mode): Show recurrence builder

### 3. `apps/web/src/components/teams/events/event-actions-menu.tsx`

Currently uses void callbacks. No change needed — the scope dialog is handled by the parent (event-detail or team-detail).

### 4. `apps/web/src/components/teams/team-detail.tsx`

**Edit from table:**
- Current: row action "Edit" → opens `EventFormDialog` directly
- New: row action "Edit" → if the row is a recurring occurrence (`row.seriesId`), show `EditScopeDialog` → then open form
- Track `editScope` state alongside the current `editEvent` dialog data

**Cancel from table:**
- Current: row action "Cancel" → confirm dialog → `cancel` mutator
- New: row action "Cancel" → if recurring, show scope dialog → then confirm with correct mode

### 5. `apps/web/src/components/teams/events/event-members-section.tsx`

"Add Volunteer" from a virtual occurrence already materializes via `onBeforeAdd` (implemented). No additional changes needed.

## Implementation Order

1. **Create `EditScopeDialog`** — self-contained component
2. **Wire into `event-detail.tsx`** — edit + cancel flows with scope state
3. **Update `event-form-dialog.tsx`** — accept `editScope` + `originalDate`, switch mutator on submit
4. **Wire into `team-detail.tsx`** — edit + cancel from table row actions
5. **E2E test** — edit scope dialog appears for recurring events, "This event only" creates exception

## Edge Cases

- **Exception row (already materialized):** `event.seriesId` is set, `event.recurrenceRule` is null. Clicking "Edit" should still show scope dialog since it's part of a series. "This event" edits the exception directly. "All events" navigates to/edits the series parent.
- **Standalone event:** No scope dialog, straight to edit/cancel.
- **Virtual occurrence with occDate:** Needs materialization before "this" edits. Already built.
- **"Following" creates a new series:** The form needs to submit the new series' recurrence rule. Pre-fill from the original series.

## Testing

- Open detail for a recurring event occurrence → click Edit → scope dialog appears
- Select "This event only" → form opens → submit → only that occurrence changes
- Select "All events" → form opens with recurrence builder → submit → series parent updated
- Cancel "This and following" → occurrences after the selected date disappear
- Standalone event edit → no scope dialog, direct edit as before
