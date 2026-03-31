# Photo Approval Batch Notifications — Design

**Date:** 2026-03-31
**Status:** Approved

## Context

When an admin approves or rejects photos in bulk, `approveBatch` enqueues one
`notify-photo-approved` pg-boss job per photo. Each job fires immediately,
sending a separate inbox, email, and WhatsApp notification to the volunteer.
Uploading or approving 10 photos generates 10 notifications — notification spam
that hurts trust and clarity.

**Goal:** Collapse per-photo approval/rejection notifications into one summary
notification per volunteer × event within a 2-minute burst window.
"3 of your photos for [Event] have been approved."

## Approach

**Delayed batch handler** — add a 2-minute `startAfter` delay to existing
enqueue calls and update the pg-boss handler to group jobs by `uploaderId ×
eventId`, sending one notification per group.

No schema changes. No new job types. No new packages.

## Architecture

### Files changed

| File | Change |
|------|--------|
| `packages/zero/src/mutators/event-photo.ts` | Add `startAfter: 2` option to `enqueue("notify-photo-approved", ...)` and `enqueue("notify-photo-rejected", ...)` |
| `packages/jobs/src/handlers/index.ts` | Add `batchSize: 50` to `boss.work` calls for both photo handlers |
| `packages/jobs/src/handlers/notify-event-photo.ts` | Rewrite handlers to group by `uploaderId × eventId` and send batch notifications |
| `packages/notifications/src/send/event-photo.ts` | Add `notifyPhotosApproved` and `notifyPhotosRejected` batch variants |
| `packages/env/src/index.ts` | Add `PHOTO_NOTIFICATION_DELAY_SECONDS` env var (default: 120) |
| `packages/e2e/tests/events/photo-notifications.spec.ts` | New E2E test file |

## Data Flow

```
approve/approveBatch mutator
  → asyncTask: enqueue("notify-photo-approved", payload, { startAfter: 2 })
                                                          ^^^^^^^^^^^^^^^^^ delay per photo

2 minutes later — pg-boss polls:
  handleNotifyPhotoApproved(jobs: Job[]) — up to 50 at once
    → group by uploaderId × eventId
    → for each group:
        count === 1 → notifyPhotoApproved(...)         // unchanged message
        count  > 1 → notifyPhotosApproved(count, ...)  // "3 photos approved"
```

## Notification Text

| Scenario | Title | Body |
|----------|-------|------|
| 1 photo approved | "Photo Approved" | "Your photo for [Event] has been approved." |
| N photos approved | "Photos Approved" | "3 of your photos for [Event] have been approved." |
| 1 photo rejected | "Photo Rejected" | "Your photo for [Event] was rejected." |
| N photos rejected | "Photos Rejected" | "3 of your photos for [Event] were rejected." |

`clickAction` → `/events/{eventId}` in all cases.

## Idempotency

Batch notifications use an idempotency key derived from the sorted `photoId`
list: `photos-approved-{sha256(sortedPhotoIds.join(","))[0..12]}`. This ensures
pg-boss retries send the same notification without duplicating on Courier/WhatsApp.

## Error Handling

- **Job failure:** pg-boss retries up to 3× with exponential backoff (existing config). Permanent failure loses that photo's notification — same as today.
- **Partial batch retry:** Idempotency key on batch notification prevents duplicates on retry.
- **WhatsApp failure:** Caught and logged with `log.error()`; does not fail the job. Inbox/email still delivered.
- **Empty group (defensive):** Log warning and skip — should never occur.

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PHOTO_NOTIFICATION_DELAY_SECONDS` | `120` | Delay before photo notification jobs run. Set to `5` in E2E to avoid 2-min wait. |

## Testing

### Unit tests (Vitest)
- Handler grouping logic: `Job[]` with mixed `uploaderId × eventId` → correct group count
- Single-photo path → calls `notifyPhotoApproved` (singular)
- Multi-photo path → calls `notifyPhotosApproved` with correct count
- Mixed approved+rejected in same batch → separate group sends

### E2E tests (`packages/e2e/tests/events/photo-notifications.spec.ts`)
- Admin approves 3 photos via batch → inbox shows "3 of your photos for [Event] have been approved"
- Admin approves 1 photo → inbox shows singular "Your photo for [Event] has been approved"
- Admin rejects 2 photos → inbox shows "2 of your photos for [Event] were rejected"
- Uses `PHOTO_NOTIFICATION_DELAY_SECONDS=5` in test environment

## Task IDs

| Task | ID |
|------|----|
| Implement delay + env var | #7 |
| Rewrite batch handler | #8 |
| Add batch notification variants | #9 |
| Write unit tests | #10 |
| Write E2E tests | #11 |
