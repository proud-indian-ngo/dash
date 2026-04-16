# Shared (`packages/shared`)

> **Load when**: `@pi-dash/shared`, `ALLOWED_IMAGE_TYPES`, event reminder presets, `REMINDER_PRESET_MINUTES`, client/server constant boundary, cross-package constants.
> **Related**: `data-layer.md`, `editor.md`

Cross-package constants, types, and utilities used by both client and server code.

| File | Contents |
|---|---|
| `src/constants.ts` | `ALLOWED_IMAGE_TYPES`, city values, status enums |
| `src/event-reminders.ts` | `REMINDER_PRESET_MINUTES`, `RSVP_POLL_LEAD_PRESET_MINUTES`, `DEFAULT_RSVP_POLL_LEAD_MINUTES` |
| `src/scheduled-message.ts` | `MAX_RECIPIENT_RETRIES`, scheduling constants |
| `src/rrule-expand.ts` | RRULE expansion with exclusion pattern support |

**Import rule**: Client-safe code imports from `@pi-dash/shared`, **not** `@pi-dash/db/schema/shared`. The latter pulls server-only deps into the client bundle.
