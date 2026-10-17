# Shared (`packages/shared`)

> **Load when**: `@pi-dash/shared`, client/server constant boundary, money and paise helpers, `ALLOWED_IMAGE_TYPES`, upload limits, event reminder presets, `REMINDER_PRESET_MINUTES`, RRULE expansion, volunteer age.
> **Related**: `data-layer.md`, `editor.md`

Constants, types and pure functions used by both client and server. Each file is imported by path, `@pi-dash/shared/<file>`; there is no barrel.

| File | Holds |
|---|---|
| `constants.ts` | Upload size limits and allowed MIME types (`ALLOWED_IMAGE_TYPES` and others), city and status value lists |
| `money.ts` | `rupeesToPaise`, `tryRupeesToPaise`, `paiseToRupees`, `formatPaise`, `sumPaise`, `assertSafePaise`, `paiseSchema`, `positivePaiseSchema` (rules in `data-layer.md`) |
| `event-reminders.ts` | `REMINDER_PRESET_MINUTES`, `RSVP_POLL_LEAD_PRESET_MINUTES`, `DEFAULT_RSVP_POLL_LEAD_MINUTES` |
| `scheduled-message.ts` | `MAX_RECIPIENT_RETRIES`, derived message status |
| `rrule-expand.ts` | `expandSeries`, `findOccurrence`, `parseRecurrenceRule` (`recurring-events.md`) |
| `volunteer-age.ts` | `MIN_VOLUNTEER_AGE` (18), `isVolunteerAgeEligible` (form, local calendar), `isVolunteerAgeEligibleOnServer` (UTC, one day of slack), `latestVolunteerDob` |

Domain modules (income, ledger, receipts, Kalakriti, social API, public events and others) are listed in the owning chapters.

Client code imports from `@pi-dash/shared`, never `@pi-dash/db/schema/shared`, which pulls server-only dependencies into the bundle.
