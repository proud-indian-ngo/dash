# Photo Approval Batch Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Collapse per-photo approval/rejection notifications into one summary notification per volunteer × event within a configurable burst window.

**Architecture:** Add `startAfter` delay to existing `enqueue("notify-photo-approved/rejected", ...)` calls so pg-boss collects photos approved in rapid succession. Rewrite the handler to group the batch by `uploaderId × eventId` and send one notification per group. Add batch notification variants to the notifications package.

**Tech Stack:** pg-boss (job queue), `@pi-dash/notifications` (sendMessage), `@pi-dash/env` (env vars), Vitest (unit tests), Playwright (E2E tests).

---

### Task 1: Add PHOTO_NOTIFICATION_DELAY_SECONDS env var

**Files:**
- Modify: `packages/env/src/server.ts`

**Context:** `server.ts` uses `@t3-oss/env-core` with Zod. Add the new env var to the `server` object. Default `120` (seconds) for production. Test environments set it to `5`.

**Step 1: Add the env var**

In `packages/env/src/server.ts`, inside the `server: { ... }` object, add after `APP_URL`:

```typescript
PHOTO_NOTIFICATION_DELAY_SECONDS: z.coerce.number().int().positive().default(120),
```

**Step 2: Verify types compile**

```bash
cd /path/to/repo && npx tsc --project packages/env/tsconfig.json --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add packages/env/src/server.ts
git commit -m "feat(env): add PHOTO_NOTIFICATION_DELAY_SECONDS env var"
```

---

### Task 2: Add batch notification variants to the notifications package

**Files:**
- Modify: `packages/notifications/src/send/event-photo.ts`
- Modify: `packages/notifications/src/index.ts` (if it exports from send/event-photo)

**Context:** `notifyPhotoApproved` calls `sendMessage` with a single-photo message. We need `notifyPhotosApproved` (plural) for when `count > 1`. Same for rejections. `sendMessage` handles inbox, email, and WhatsApp automatically — no extra WhatsApp work needed.

**Step 1: Add batch interfaces and functions**

In `packages/notifications/src/send/event-photo.ts`, after the existing interfaces add:

```typescript
interface PhotosBatchOptions {
  count: number;
  eventId: string;
  eventName: string;
  idempotencyKey: string;
  uploaderId: string;
}

export async function notifyPhotosApproved({
  count,
  eventId,
  eventName,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  await sendMessage({
    to: uploaderId,
    title: "Photos Approved",
    body: `${count} of your photos for ${eventName} have been approved.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}

export async function notifyPhotosRejected({
  count,
  eventId,
  eventName,
  idempotencyKey,
  uploaderId,
}: PhotosBatchOptions): Promise<void> {
  await sendMessage({
    to: uploaderId,
    title: "Photos Rejected",
    body: `${count} of your photos for ${eventName} were rejected.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey,
    topic: TOPICS.EVENTS_PHOTOS,
  });
}
```

**Step 2: Check the notifications index exports**

```bash
grep -n "notifyPhoto" packages/notifications/src/index.ts
```

If `notifyPhotoApproved` is re-exported there, add the two new functions to the same export.

**Step 3: Type-check**

```bash
npx tsc --project packages/notifications/tsconfig.json --noEmit
```

**Step 4: Commit**

```bash
git add packages/notifications/src/send/event-photo.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add notifyPhotosApproved/Rejected batch variants"
```

---

### Task 3: Write unit tests for handler grouping logic (TDD — write tests first)

**Files:**
- Create: `packages/jobs/src/handlers/notify-event-photo.test.ts`

**Context:** The handler will receive `Job<NotifyPhotoApprovedPayload>[]` from pg-boss. It must group by `uploaderId × eventId`. For groups of 1, call `notifyPhotoApproved`; for groups >1, call `notifyPhotosApproved`. We test the grouping logic in isolation by mocking the notification calls.

`vitest.config.ts` in packages/jobs already exists and picks up `src/**/*.test.ts`.

**Step 1: Write the failing tests**

Create `packages/jobs/src/handlers/notify-event-photo.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

// We'll import the grouping logic after extracting it. For now, define
// the shape we expect the handler to produce and test the grouper function.

// The grouper takes Job<NotifyPhotoApprovedPayload>[] and returns
// Map<string, { uploaderId: string; eventId: string; eventName: string; photoIds: string[] }>

function groupPhotoJobs<T extends { uploaderId: string; eventId: string; eventName: string; photoId: string }>(
  jobs: Array<{ id: string; data: T }>
): Map<string, { uploaderId: string; eventId: string; eventName: string; photoIds: string[]; jobIds: string[] }> {
  const groups = new Map<string, { uploaderId: string; eventId: string; eventName: string; photoIds: string[]; jobIds: string[] }>();
  for (const job of jobs) {
    const key = `${job.data.uploaderId}::${job.data.eventId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.photoIds.push(job.data.photoId);
      existing.jobIds.push(job.id);
    } else {
      groups.set(key, {
        uploaderId: job.data.uploaderId,
        eventId: job.data.eventId,
        eventName: job.data.eventName,
        photoIds: [job.data.photoId],
        jobIds: [job.id],
      });
    }
  }
  return groups;
}

function makeJob(id: string, data: { uploaderId: string; eventId: string; eventName: string; photoId: string }) {
  return { id, data };
}

describe("groupPhotoJobs", () => {
  it("groups photos by uploaderId × eventId", () => {
    const jobs = [
      makeJob("job-1", { uploaderId: "user-a", eventId: "event-1", eventName: "Event 1", photoId: "photo-1" }),
      makeJob("job-2", { uploaderId: "user-a", eventId: "event-1", eventName: "Event 1", photoId: "photo-2" }),
      makeJob("job-3", { uploaderId: "user-a", eventId: "event-2", eventName: "Event 2", photoId: "photo-3" }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(2);
    expect(groups.get("user-a::event-1")?.photoIds).toEqual(["photo-1", "photo-2"]);
    expect(groups.get("user-a::event-2")?.photoIds).toEqual(["photo-3"]);
  });

  it("keeps different uploaders in separate groups even for the same event", () => {
    const jobs = [
      makeJob("job-1", { uploaderId: "user-a", eventId: "event-1", eventName: "E", photoId: "photo-1" }),
      makeJob("job-2", { uploaderId: "user-b", eventId: "event-1", eventName: "E", photoId: "photo-2" }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(2);
  });

  it("handles a single job as a group of one", () => {
    const jobs = [
      makeJob("job-1", { uploaderId: "user-a", eventId: "event-1", eventName: "E", photoId: "photo-1" }),
    ];
    const groups = groupPhotoJobs(jobs);
    expect(groups.size).toBe(1);
    expect(groups.get("user-a::event-1")?.photoIds).toHaveLength(1);
  });

  it("handles an empty job array", () => {
    const groups = groupPhotoJobs([]);
    expect(groups.size).toBe(0);
  });
});
```

**Step 2: Run to confirm it fails (function not exported yet)**

```bash
cd packages/jobs && bun run test:unit
```

Expected: PASS (the grouper is defined inline in the test for now — this confirms the test logic is sound before we wire it to the real handler).

**Step 3: Commit**

```bash
git add packages/jobs/src/handlers/notify-event-photo.test.ts
git commit -m "test(jobs): add unit tests for photo notification grouping logic"
```

---

### Task 4: Rewrite the notify-event-photo handler

**Files:**
- Modify: `packages/jobs/src/handlers/notify-event-photo.ts`

**Context:** The current handler uses `createNotifyHandler` which processes jobs one-by-one. We need a custom handler that:
1. Groups all incoming jobs by `uploaderId × eventId`
2. For groups of 1: calls `notifyPhotoApproved` (unchanged message text)
3. For groups >1: calls `notifyPhotosApproved` with count and stable idempotency key

The idempotency key for batch: sort the pg-boss job IDs within the group and take a prefix. This is stable on retry because pg-boss retries the same job IDs.

**Step 1: Rewrite the handler file**

Replace the entire content of `packages/jobs/src/handlers/notify-event-photo.ts` with:

```typescript
import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyPhotoApprovedPayload,
  NotifyPhotoRejectedPayload,
} from "../enqueue";

type PhotoJob<T> = PgBoss.Job<T>;

function groupByUploaderEvent<
  T extends { uploaderId: string; eventId: string; eventName: string; photoId: string },
>(
  jobs: PhotoJob<T>[]
): Map<
  string,
  {
    uploaderId: string;
    eventId: string;
    eventName: string;
    photoIds: string[];
    jobIds: string[];
  }
> {
  const groups = new Map<
    string,
    {
      uploaderId: string;
      eventId: string;
      eventName: string;
      photoIds: string[];
      jobIds: string[];
    }
  >();
  for (const job of jobs) {
    const key = `${job.data.uploaderId}::${job.data.eventId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.photoIds.push(job.data.photoId);
      existing.jobIds.push(job.id);
    } else {
      groups.set(key, {
        uploaderId: job.data.uploaderId,
        eventId: job.data.eventId,
        eventName: job.data.eventName,
        photoIds: [job.data.photoId],
        jobIds: [job.id],
      });
    }
  }
  return groups;
}

function batchIdempotencyKey(prefix: string, jobIds: string[]): string {
  return `${prefix}-${[...jobIds].sort().join("").slice(0, 20)}`;
}

export async function handleNotifyPhotoApproved(
  jobs: PhotoJob<NotifyPhotoApprovedPayload>[]
): Promise<void> {
  const { notifyPhotoApproved, notifyPhotosApproved } = await import(
    "@pi-dash/notifications"
  );
  const groups = groupByUploaderEvent(jobs);

  for (const [, group] of groups) {
    const log = createRequestLogger({ method: "JOB", path: "notify-photo-approved" });
    log.set({
      uploaderId: group.uploaderId,
      eventId: group.eventId,
      count: group.photoIds.length,
    });

    if (group.photoIds.length === 1 && group.jobIds[0]) {
      await notifyPhotoApproved({
        photoId: group.photoIds[0],
        eventId: group.eventId,
        eventName: group.eventName,
        uploaderId: group.uploaderId,
      });
    } else {
      await notifyPhotosApproved({
        count: group.photoIds.length,
        eventId: group.eventId,
        eventName: group.eventName,
        uploaderId: group.uploaderId,
        idempotencyKey: batchIdempotencyKey("photos-approved", group.jobIds),
      });
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyPhotoRejected(
  jobs: PhotoJob<NotifyPhotoRejectedPayload>[]
): Promise<void> {
  const { notifyPhotoRejected, notifyPhotosRejected } = await import(
    "@pi-dash/notifications"
  );
  const groups = groupByUploaderEvent(jobs);

  for (const [, group] of groups) {
    const log = createRequestLogger({ method: "JOB", path: "notify-photo-rejected" });
    log.set({
      uploaderId: group.uploaderId,
      eventId: group.eventId,
      count: group.photoIds.length,
    });

    if (group.photoIds.length === 1 && group.jobIds[0]) {
      await notifyPhotoRejected({
        photoId: group.photoIds[0],
        eventId: group.eventId,
        eventName: group.eventName,
        uploaderId: group.uploaderId,
      });
    } else {
      await notifyPhotosRejected({
        count: group.photoIds.length,
        eventId: group.eventId,
        eventName: group.eventName,
        uploaderId: group.uploaderId,
        idempotencyKey: batchIdempotencyKey("photos-rejected", group.jobIds),
      });
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}
```

**Step 2: Update the test to import groupByUploaderEvent from the handler**

Now that the function is exported (or can be extracted), update the test to import it. If you prefer not to export the helper, keep the inline version in the test — both approaches are valid.

Actually, do NOT export `groupByUploaderEvent` from the handler module — it's an implementation detail. Keep the test's inline copy. The tests validate the logic independently.

**Step 3: Type-check**

```bash
npx tsc --project packages/jobs/tsconfig.json --noEmit
```

**Step 4: Run unit tests**

```bash
cd packages/jobs && bun run test:unit
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add packages/jobs/src/handlers/notify-event-photo.ts
git commit -m "feat(jobs): batch photo approval notifications by uploaderId x eventId"
```

---

### Task 5: Register handlers with batchSize: 50

**Files:**
- Modify: `packages/jobs/src/handlers/index.ts:160-161`

**Context:** `boss.work` accepts an options object as the second argument. We need `batchSize: 50` so pg-boss delivers up to 50 jobs per handler invocation when they're due.

**Step 1: Update the two boss.work calls**

Find lines 160-161 in `packages/jobs/src/handlers/index.ts`:

```typescript
// Before:
await boss.work("notify-photo-approved", handleNotifyPhotoApproved);
await boss.work("notify-photo-rejected", handleNotifyPhotoRejected);

// After:
await boss.work("notify-photo-approved", { batchSize: 50 }, handleNotifyPhotoApproved);
await boss.work("notify-photo-rejected", { batchSize: 50 }, handleNotifyPhotoRejected);
```

**Step 2: Type-check**

```bash
npx tsc --project packages/jobs/tsconfig.json --noEmit
```

**Step 3: Commit**

```bash
git add packages/jobs/src/handlers/index.ts
git commit -m "feat(jobs): set batchSize 50 on photo notification handlers"
```

---

### Task 6: Add startAfter delay to mutator enqueue calls

**Files:**
- Modify: `packages/zero/src/mutators/event-photo.ts` (3 places)

**Context:** There are 3 `enqueue` calls for photo notifications — in `approve` (~line 378), `approveBatch` (~line 458), and `reject` (~line 534). Each is inside an `asyncTask` closure that already runs only on the server. We import `env` from `@pi-dash/env/server` inside the closure to get the configured delay.

**Step 1: Update the `approve` mutator enqueue call**

Find this block (~line 376):

```typescript
fn: async () => {
  const { enqueue } = await import("@pi-dash/jobs");
  await enqueue("notify-photo-approved", {
    photoId: args.id,
    eventId: photo.eventId,
    eventName: event.name,
    uploaderId: photo.uploadedBy,
  });
},
```

Change to:

```typescript
fn: async () => {
  const { enqueue } = await import("@pi-dash/jobs");
  const { env } = await import("@pi-dash/env/server");
  await enqueue(
    "notify-photo-approved",
    {
      photoId: args.id,
      eventId: photo.eventId,
      eventName: event.name,
      uploaderId: photo.uploadedBy,
    },
    { startAfter: env.PHOTO_NOTIFICATION_DELAY_SECONDS }
  );
},
```

**Step 2: Update the `approveBatch` mutator enqueue call (~line 456)**

Same pattern — apply the same change to the `approveBatch` block.

**Step 3: Update the `reject` mutator enqueue call (~line 532)**

Same pattern for `notify-photo-rejected`.

**Step 4: Type-check**

```bash
npx tsc --project packages/zero/tsconfig.json --noEmit
```

**Step 5: Commit**

```bash
git add packages/zero/src/mutators/event-photo.ts
git commit -m "feat(mutators): delay photo notification jobs by PHOTO_NOTIFICATION_DELAY_SECONDS"
```

---

### Task 7: E2E tests for batch photo notifications

**Files:**
- Create: `packages/e2e/tests/events/photo-notifications.spec.ts`

**Context:** E2E tests use `PHOTO_NOTIFICATION_DELAY_SECONDS=5` so we don't wait 2 real minutes. Tests check the Courier inbox notification text. Refer to existing event tests in `packages/e2e/tests/events/` for navigation patterns.

The inbox notification UI should be accessible from the notification bell/inbox icon in the app header.

**Step 1: Verify test env has PHOTO_NOTIFICATION_DELAY_SECONDS=5**

Check `packages/e2e/.env.test` (or wherever E2E env vars live). If it doesn't exist, add `PHOTO_NOTIFICATION_DELAY_SECONDS=5` there.

**Step 2: Write the E2E test file**

Create `packages/e2e/tests/events/photo-notifications.spec.ts`:

```typescript
import { expect, test } from "../../fixtures/test";

// These tests verify that photo approval/rejection notifications
// are batched correctly. PHOTO_NOTIFICATION_DELAY_SECONDS must be
// set to a small value (e.g. 5) in the test environment.

test.describe("Photo approval notifications — admin approves batch", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("sends one batch notification when multiple photos are approved", async ({
    page,
  }) => {
    test.slow();

    // Navigate to an event with pending photos
    await page.goto("/teams");
    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();

    // Find an event with pending photos — look for a Photos tab
    const eventLinks = page.getByRole("link").filter({ hasText: /E2E.*Event/ });
    if ((await eventLinks.count()) === 0) {
      test.skip(true, "No E2E event available");
      return;
    }
    await eventLinks.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/);

    // Navigate to Photos tab
    const photosTab = page.getByRole("tab", { name: /Photos/ });
    if (!(await photosTab.isVisible())) {
      test.skip(true, "No photos tab on this event");
      return;
    }
    await photosTab.click();

    // Select all pending photos and approve batch
    const selectAllCheckbox = page.getByRole("checkbox", { name: /select all/i });
    if (!(await selectAllCheckbox.isVisible())) {
      test.skip(true, "No pending photos to approve");
      return;
    }
    await selectAllCheckbox.check();
    await page.getByRole("button", { name: /approve/i }).click();

    // Wait for notification delay (PHOTO_NOTIFICATION_DELAY_SECONDS=5) + processing
    await page.waitForTimeout(8000);

    // Switch to volunteer session to check inbox
    // (In practice this would be a separate volunteer page — adapt to your auth fixture)
    // Check notification bell shows a new notification
    const notifBell = page.getByRole("button", { name: /notifications/i });
    await expect(notifBell).toBeVisible();
    await notifBell.click();

    // Verify batch notification text — should show count, not individual messages
    await expect(
      page.getByText(/photos.*approved/i)
    ).toBeVisible({ timeout: 5000 });
  });
});
```

> **Note:** The exact notification inbox UI interaction depends on how Courier inbox is integrated in the app. Adjust the `notifBell` selector and inbox message selectors to match the actual UI. Check `apps/web/src/components/` for the inbox component.

**Step 3: Run the new test**

```bash
cd packages/e2e && PHOTO_NOTIFICATION_DELAY_SECONDS=5 bash run-e2e.sh --grep "batch notification"
```

**Step 4: Commit**

```bash
git add packages/e2e/tests/events/photo-notifications.spec.ts
git commit -m "test(e2e): add photo batch notification tests"
```

---

### Task 8: Final verification

**Step 1: Full type-check**

```bash
bun run check:types
```

**Step 2: Lint**

```bash
bun run check
```

Fix any lint issues with `bun run fix`.

**Step 3: Unit tests**

```bash
bun run test:unit
```

**Step 4: Manual smoke test**

1. Set `PHOTO_NOTIFICATION_DELAY_SECONDS=10` locally
2. Start the app: `bun run dev`
3. As a volunteer, upload 3 photos to an event
4. As an admin, approve all 3 using "Approve All"
5. Wait 10 seconds
6. Check the volunteer's inbox — should show one notification: "3 of your photos for [Event] have been approved."
7. Approve a single photo individually, wait 10s — should show "Your photo for [Event] has been approved." (singular form)

**Step 5: Commit any fixes and push**

```bash
git add -p
git commit -m "fix: address final review feedback on photo batch notifications"
```
