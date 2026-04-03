# Scheduled Message Recipients Table Design

**Goal:** Extract recipients from JSONB column into a dedicated `scheduled_message_recipient` table with per-recipient status tracking, error messages, and retry capability.

**Motivation:** Current design stores recipients as JSONB and has a single status for the entire message. When one recipient fails, the whole message is marked "failed" with no way to retry individual recipients or see which ones succeeded.

---

## Schema Changes

### New table: `scheduled_message_recipient`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `scheduled_message_id` | UUID | FK -> scheduled_message(id) ON DELETE CASCADE, NOT NULL |
| `recipient_id` | TEXT | NOT NULL (group ID or user ID) |
| `label` | TEXT | NOT NULL (display name) |
| `type` | ENUM `scheduled_message_recipient_type` | NOT NULL ("group" \| "user") |
| `status` | ENUM `scheduled_message_recipient_status` | NOT NULL, DEFAULT "pending" |
| `error` | TEXT | nullable (error message on failure) |
| `sent_at` | TIMESTAMP | nullable (when successfully sent) |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

### Parent `scheduled_message` changes

- **Remove** `status` column
- **Remove** `recipients` JSONB column
- Keep: `id`, `message`, `scheduledAt`, `attachments`, `createdBy`, `createdAt`, `updatedAt`

### Migration strategy

Data migration step:
1. Create new table and enums
2. For each existing scheduled_message row, insert recipient rows from JSONB array, copying the parent's status to each recipient
3. Drop `recipients` and `status` columns from parent

---

## Zero Schema

New `scheduledMessageRecipient` table with relationships:
- `scheduledMessage` -> `recipients` (one-to-many, sourceField: `["id"]`, destField: `["scheduledMessageId"]`)
- `scheduledMessageRecipient` -> `scheduledMessage` (many-to-one)

Queries updated to include `.related("recipients")`.

### Derived status (client-side)

```typescript
function deriveMessageStatus(recipients: ScheduledMessageRecipient[]): ScheduledMessageDerivedStatus {
  if (recipients.length === 0) return "pending";
  if (recipients.every(r => r.status === "cancelled")) return "cancelled";
  if (recipients.every(r => r.status === "sent")) return "sent";
  if (recipients.every(r => r.status === "failed")) return "failed";
  if (recipients.some(r => r.status === "sent") && recipients.some(r => r.status === "failed")) return "partial";
  return "pending";
}
```

"partial" is a new derived-only status (amber badge) — not stored in DB.

---

## Job Handler Changes

**Payload:** Add `recipientRowId` (UUID of `scheduled_message_recipient` row).

**On success:** Update recipient row: `status = "sent"`, `sentAt = now`.

**Dead letter:** Update recipient row: `status = "failed"`, `error = extractedErrorMessage`.

**Staleness check:** Still checks `parent.updatedAt > enqueuedAt`.

**Cancel check:** Check recipient row's own `status === "cancelled"` instead of parent.

---

## Mutator Changes

### `create`
1. Insert parent `scheduledMessage` (no status/recipients columns)
2. Insert `scheduledMessageRecipient` rows with `status: "pending"`
3. Server-side: resolve addresses, enqueue jobs with `recipientRowId`

### `update`
1. Verify all recipients are `pending`
2. Delete existing recipient rows
3. Update parent fields
4. Insert new recipient rows
5. Enqueue new jobs (stale check handles old)

### `cancel`
1. Update all recipients where `status === "pending"` -> `"cancelled"`
2. Already `sent`/`failed` recipients remain unchanged

### `delete`
1. Verify no recipients are `pending`
2. Delete parent (CASCADE deletes recipients)

### New: `retryRecipient`
1. Verify recipient exists and `status === "failed"`
2. Set `status = "pending"`, clear `error`
3. Resolve address, enqueue job with 1-minute delay

---

## UI Changes

### Main table
- Add expandable row with chevron column (using existing `getRowCanExpand` + `meta.expandedContent`)
- Status column uses `deriveMessageStatus()` — new "Partial" badge (amber)
- Recipients column shows count from related rows

### Expanded row: `RecipientSubTable`
- Inline table: Name, Type icon, Status badge, Error tooltip, Retry button (failed only)
- Not a full DataTableWrapper — lightweight inline table

### Detail sheet
- Replace static recipient badges with same RecipientSubTable

### Form dialog
- No changes to RecipientPicker UI — still picks `{id, label, type}`
- Mutator handles creating recipient rows

---

## Verification

1. `bun run db:generate` — generates migration
2. `bun run db:migrate` — applies migration (verify data migration)
3. `bun run zero:generate` — regenerates Zero schema
4. `bun run check:types` — type check passes
5. `bun run check` — linter passes
6. Manual test: create scheduled message, verify recipients appear in sub-table
7. Manual test: cancel message, verify only pending recipients cancelled
8. Manual test: trigger failure (invalid phone), verify retry button works
