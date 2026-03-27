# Anonymous Event Feedback — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add anonymous feedback for completed events — togglable per event, structurally anonymous (no userId on feedback content), with configurable deadline.

**Architecture:** Two new tables (`eventFeedback`, `eventFeedbackSubmission`) plus two new columns on `teamEvent`. Feedback content is anonymous; a separate submission-tracking table gates one-per-user and enables edits without exposing authorship. A server function (not Zero query) retrieves the participant's own submission to avoid syncing the submission table to clients.

**Tech Stack:** Drizzle ORM, Zero (Rocicorp), TanStack Start server functions, TanStack Form + Zod, React, Sonner toasts, Courier notifications.

**Design doc:** `docs/plans/2026-03-27-anonymous-event-feedback-design.md`

---

## Task 0: Add `feedbackEnabled` and `feedbackDeadline` columns to `teamEvent`

**Files:**
- Modify: `packages/db/src/schema/team-event.ts:25-72` (add columns to `teamEvent` table)
- Run: `bun run db:generate` then `bun run db:migrate`
- Run: `bun run zero:generate`

**Step 1: Add columns to Drizzle schema**

In `packages/db/src/schema/team-event.ts`, add two columns to the `teamEvent` table definition, after `cancelledAt` (line 51):

```typescript
feedbackEnabled: boolean("feedback_enabled").default(false).notNull(),
feedbackDeadline: timestamp("feedback_deadline"),
```

**Step 2: Generate and apply migration**

```bash
bun run db:generate
bun run db:migrate
```

Expected: New migration file in `packages/db/src/migrations/` adding the two columns.

**Step 3: Regenerate Zero schema**

```bash
bun run zero:generate
```

Expected: `packages/zero/src/schema.ts` updated with `feedbackEnabled` and `feedbackDeadline` columns on the teamEvent table.

**Step 4: Update `teamEvent.update` mutator args**

In `packages/zero/src/mutators/team-event.ts`:

Add to `UpdateArgs` interface (line 32-42):
```typescript
feedbackEnabled?: boolean;
feedbackDeadline?: number;
```

Add to `buildUpdateFields` function (line 44-60):
```typescript
...(args.feedbackEnabled !== undefined && { feedbackEnabled: args.feedbackEnabled }),
...(args.feedbackDeadline !== undefined && { feedbackDeadline: args.feedbackDeadline ?? null }),
```

Add to the `update` mutator Zod schema (line 203-214):
```typescript
feedbackEnabled: z.boolean().optional(),
feedbackDeadline: z.number().nullable().optional(),
```

**Step 5: Update `teamEvent.create` mutator**

In `packages/zero/src/mutators/team-event.ts`, add to the `create` Zod schema (around line 71-84):
```typescript
feedbackEnabled: z.boolean().optional(),
feedbackDeadline: z.number().nullable().optional(),
```

Add to the `tx.mutate.teamEvent.insert()` call (around line 100-117):
```typescript
feedbackEnabled: args.feedbackEnabled ?? false,
feedbackDeadline: args.feedbackDeadline ?? null,
```

**Step 6: Commit**

```bash
git add packages/db/src/schema/team-event.ts packages/db/src/migrations/ packages/zero/src/schema.ts packages/zero/src/mutators/team-event.ts
git commit -m "feat(events): add feedbackEnabled and feedbackDeadline columns to teamEvent"
```

---

## Task 1: Add `events.manage_feedback` permission

**Files:**
- Modify: `packages/db/src/permissions.ts:229` (add after `events.manage_attendance`)

**Step 1: Add permission**

After the `events.manage_attendance` entry (line 229), add:

```typescript
{
  id: "events.manage_feedback",
  name: "Manage Feedback",
  category: "events",
  description:
    "Toggle feedback, set deadline, view anonymous responses (also granted to team leads)",
},
```

**Step 2: Verify types**

```bash
bun run check:types
```

Expected: Permission ID auto-inferred from the `PERMISSIONS` array. No type errors.

**Step 3: Commit**

```bash
git add packages/db/src/permissions.ts
git commit -m "feat(events): add events.manage_feedback permission"
```

---

## Task 2: Create `eventFeedback` and `eventFeedbackSubmission` schema tables

**Files:**
- Create: `packages/db/src/schema/event-feedback.ts`
- Modify: `packages/db/src/schema/index.ts:8` (add export)
- Modify: `packages/db/src/schema/team-event.ts` (add `feedback` relation to `teamEventRelations`)
- Run: `bun run db:generate` then `bun run db:migrate`
- Run: `bun run zero:generate`

**Step 1: Create schema file**

Create `packages/db/src/schema/event-feedback.ts`:

```typescript
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventFeedback = pgTable(
  "event_feedback",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("event_feedback_eventId_idx").on(table.eventId)]
);

export const eventFeedbackSubmission = pgTable(
  "event_feedback_submission",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => eventFeedback.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_feedback_sub_eventId_userId_uidx").on(
      table.eventId,
      table.userId
    ),
    index("event_feedback_sub_eventId_idx").on(table.eventId),
  ]
);

export const eventFeedbackRelations = relations(eventFeedback, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventFeedback.eventId],
    references: [teamEvent.id],
  }),
}));

export const eventFeedbackSubmissionRelations = relations(
  eventFeedbackSubmission,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [eventFeedbackSubmission.eventId],
      references: [teamEvent.id],
    }),
    user: one(user, {
      fields: [eventFeedbackSubmission.userId],
      references: [user.id],
    }),
    feedback: one(eventFeedback, {
      fields: [eventFeedbackSubmission.feedbackId],
      references: [eventFeedback.id],
    }),
  })
);
```

**Step 2: Add barrel export**

In `packages/db/src/schema/index.ts`, add after line 8 (`export * from "./event-update";`):

```typescript
export * from "./event-feedback";
```

**Step 3: Add relation to teamEvent**

In `packages/db/src/schema/team-event.ts`, import `eventFeedback`:

```typescript
import { eventFeedback } from "./event-feedback";
```

Add to `teamEventRelations` (after `interests: many(eventInterest)` at line 118):

```typescript
feedback: many(eventFeedback),
```

**Step 4: Generate and apply migration**

```bash
bun run db:generate
bun run db:migrate
```

**Step 5: Regenerate Zero schema**

```bash
bun run zero:generate
```

**Step 6: Verify types**

```bash
bun run check:types
```

**Step 7: Commit**

```bash
git add packages/db/src/schema/event-feedback.ts packages/db/src/schema/index.ts packages/db/src/schema/team-event.ts packages/db/src/migrations/ packages/zero/src/schema.ts
git commit -m "feat(events): add eventFeedback and eventFeedbackSubmission tables"
```

---

## Task 3: Create `eventFeedback` mutators

**Files:**
- Create: `packages/zero/src/mutators/event-feedback.ts`
- Modify: `packages/zero/src/mutators.ts` (register mutators)

**Step 1: Create mutator file**

Create `packages/zero/src/mutators/event-feedback.ts`:

```typescript
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type {
  EventFeedback,
  EventFeedbackSubmission,
  TeamEvent,
  TeamEventMember,
} from "../schema";
import { zql } from "../schema";

export const eventFeedbackMutators = {
  submit: defineMutator(
    z.object({
      feedbackId: z.string(),
      submissionId: z.string(),
      eventId: z.string(),
      content: z.string().min(1, "Feedback cannot be empty"),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      // Verify event exists, feedback enabled, event is past, deadline not passed
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");
      if (!event.feedbackEnabled) throw new Error("Feedback is not enabled for this event");

      const eventTime = event.endTime ?? event.startTime;
      if (eventTime > args.now) throw new Error("Event has not ended yet");

      if (event.feedbackDeadline && event.feedbackDeadline < args.now) {
        throw new Error("Feedback deadline has passed");
      }

      // Verify user is event member
      const membership = (await tx.run(
        zql.teamEventMember
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as TeamEventMember | undefined;
      if (!membership) throw new Error("You are not a member of this event");

      // Check no existing submission
      const existing = (await tx.run(
        zql.eventFeedbackSubmission
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as EventFeedbackSubmission | undefined;
      if (existing) throw new Error("You have already submitted feedback for this event");

      // Insert anonymous feedback
      await tx.mutate.eventFeedback.insert({
        id: args.feedbackId,
        eventId: args.eventId,
        content: args.content,
        createdAt: args.now,
        updatedAt: args.now,
      });

      // Insert submission record (links user to their feedback)
      await tx.mutate.eventFeedbackSubmission.insert({
        id: args.submissionId,
        eventId: args.eventId,
        userId: ctx.userId,
        feedbackId: args.feedbackId,
        submittedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      eventId: z.string(),
      content: z.string().min(1, "Feedback cannot be empty"),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      // Find submission record to get feedbackId
      const submission = (await tx.run(
        zql.eventFeedbackSubmission
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as EventFeedbackSubmission | undefined;
      if (!submission) throw new Error("No feedback submission found");

      // Verify event deadline not passed
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      if (event.feedbackDeadline && event.feedbackDeadline < args.now) {
        throw new Error("Feedback deadline has passed");
      }

      // Update the anonymous feedback content
      await tx.mutate.eventFeedback.update({
        id: submission.feedbackId,
        content: args.content,
        updatedAt: args.now,
      });
    }
  ),
};
```

**Step 2: Register mutators**

In `packages/zero/src/mutators.ts`, add import:

```typescript
import { eventFeedbackMutators } from "./mutators/event-feedback";
```

Add to `defineMutators()` object:

```typescript
eventFeedback: eventFeedbackMutators,
```

**Step 3: Verify types**

```bash
bun run check:types
```

**Step 4: Commit**

```bash
git add packages/zero/src/mutators/event-feedback.ts packages/zero/src/mutators.ts
git commit -m "feat(events): add eventFeedback submit and update mutators"
```

---

## Task 4: Create `eventFeedback` Zero query and server function

**Files:**
- Create: `packages/zero/src/queries/event-feedback.ts`
- Modify: `packages/zero/src/queries.ts` (register query)
- Create: `apps/web/src/functions/event-feedback.ts` (server function for own submission)

**Step 1: Create Zero query for admin view**

Create `packages/zero/src/queries/event-feedback.ts`:

```typescript
import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

export const eventFeedbackQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      // Only users with manage_feedback permission can view all feedback
      if (ctx == null || !can(ctx, "events.manage_feedback")) {
        return zql.eventFeedback.where("id", "NEVER_MATCH");
      }
      return zql.eventFeedback
        .where("eventId", eventId)
        .orderBy("createdAt", "desc");
    }
  ),
};
```

Note: The `"NEVER_MATCH"` pattern returns empty results for unauthorized users. Check if the codebase uses a different pattern for empty queries — if so, follow that pattern.

**Step 2: Register query**

In `packages/zero/src/queries.ts`, add import:

```typescript
import { eventFeedbackQueries } from "./queries/event-feedback";
```

Add to `defineQueries()` object:

```typescript
eventFeedback: eventFeedbackQueries,
```

**Step 3: Create server function for own submission**

Create `apps/web/src/functions/event-feedback.ts`:

```typescript
import { db } from "@pi-dash/db";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

export const getMyEventFeedback = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string() }))
  .handler(async ({ context, data }) => {
    const userId = context.session?.user?.id;
    if (!userId) return null;

    const submission = await db
      .select({
        feedbackId: eventFeedbackSubmission.feedbackId,
      })
      .from(eventFeedbackSubmission)
      .where(
        and(
          eq(eventFeedbackSubmission.eventId, data.eventId),
          eq(eventFeedbackSubmission.userId, userId)
        )
      )
      .limit(1);

    if (submission.length === 0) return null;

    const feedback = await db
      .select({
        id: eventFeedback.id,
        content: eventFeedback.content,
        createdAt: eventFeedback.createdAt,
        updatedAt: eventFeedback.updatedAt,
      })
      .from(eventFeedback)
      .where(eq(eventFeedback.id, submission[0].feedbackId))
      .limit(1);

    return feedback[0] ?? null;
  });
```

Note: Check the actual `authMiddleware` and `validator` API used in other server functions (some may use `inputValidator` instead of `validator` depending on TanStack Start version).

**Step 4: Verify types**

```bash
bun run check:types
```

**Step 5: Commit**

```bash
git add packages/zero/src/queries/event-feedback.ts packages/zero/src/queries.ts apps/web/src/functions/event-feedback.ts
git commit -m "feat(events): add eventFeedback query and server function for own submission"
```

---

## Task 5: Add notification for feedback enabled

**Files:**
- Modify: `packages/notifications/src/topics.ts` (add EVENTS_FEEDBACK topic)
- Create: `packages/notifications/src/send/event-feedback.ts`
- Modify: `packages/notifications/src/index.ts` (export new functions)

**Step 1: Add notification topic**

In `packages/notifications/src/topics.ts`, add to `TOPICS` object (after line 10):

```typescript
EVENTS_FEEDBACK: "Events - Feedback",
```

Add to `TOPIC_CATALOG` array (after line 89):

```typescript
{
  id: TOPICS.EVENTS_FEEDBACK,
  name: "Feedback",
  description: "Notifications when event feedback is open for your participation.",
  group: "Events",
  required: false,
  defaultEnabled: true,
  requiredPermission: "events.view_own",
},
```

**Step 2: Create notification function**

Create `packages/notifications/src/send/event-feedback.ts`:

```typescript
import { sendBulkMessage } from "../send-message";
import { TOPICS } from "../topics";

interface FeedbackOpenOptions {
  eventId: string;
  eventName: string;
  memberUserIds: string[];
}

export async function notifyEventFeedbackOpen({
  eventId,
  eventName,
  memberUserIds,
}: FeedbackOpenOptions): Promise<void> {
  if (memberUserIds.length === 0) return;

  await sendBulkMessage({
    userIds: memberUserIds,
    title: "Share Your Feedback",
    body: `Anonymous feedback is now open for ${eventName}. Your response is completely anonymous.`,
    clickAction: `/events/${eventId}`,
    idempotencyKey: `event-feedback-open-${eventId}`,
    topic: TOPICS.EVENTS_FEEDBACK,
  });
}
```

**Step 3: Export from index**

In `packages/notifications/src/index.ts`, add after line 23:

```typescript
export { notifyEventFeedbackOpen } from "./send/event-feedback";
```

**Step 4: Wire notification into teamEvent.update mutator**

In `packages/zero/src/mutators/team-event.ts`, inside the `update` mutator's `if (tx.location === "server")` block, add logic to notify when feedback is newly enabled on a past event:

```typescript
// After the existing notification push (around line 272), add:
if (
  args.feedbackEnabled === true &&
  !existing.feedbackEnabled &&
  (existing.endTime ?? existing.startTime) < args.now
) {
  const feedbackEventId = eventId;
  const feedbackEventName = eventName;
  ctx.asyncTasks?.push({
    meta: {
      mutator: "updateTeamEvent:feedbackEnabled",
      eventId: feedbackEventId,
    },
    fn: async () => {
      const { notifyEventFeedbackOpen } = await import(
        "@pi-dash/notifications"
      );
      const memberIds = eventMemberIds;
      await notifyEventFeedbackOpen({
        eventId: feedbackEventId,
        eventName: feedbackEventName,
        memberUserIds: memberIds,
      });
    },
  });
}
```

**Step 5: Verify types**

```bash
bun run check:types
```

**Step 6: Commit**

```bash
git add packages/notifications/src/topics.ts packages/notifications/src/send/event-feedback.ts packages/notifications/src/index.ts packages/zero/src/mutators/team-event.ts
git commit -m "feat(events): add feedback notification topic and notify members when feedback opens"
```

---

## Task 6: Update event form dialog with feedback toggle and deadline

**Files:**
- Modify: `apps/web/src/components/teams/events/event-form-dialog.tsx`

**Step 1: Add fields to form schema**

In `event-form-dialog.tsx`, add to `eventFormSchema` (after `createWaGroup` at line 38):

```typescript
feedbackEnabled: z.boolean(),
feedbackDeadline: z.date().optional(),
```

**Step 2: Add to InitialValues interface**

Add to `InitialValues` interface (around line 60-74):

```typescript
feedbackEnabled: boolean;
feedbackDeadline: number | null;
```

**Step 3: Add default values in form initialization**

In the `useForm` call, set defaults:

```typescript
feedbackEnabled: initialValues?.feedbackEnabled ?? false,
feedbackDeadline: initialValues?.feedbackDeadline
  ? new Date(initialValues.feedbackDeadline)
  : undefined,
```

**Step 4: Add form fields to JSX**

After the WhatsApp section (before `FormActions`), add a new section conditionally rendered when user has `events.manage_feedback` or is team lead. Use `useAppContext` to check permissions:

```tsx
<form.Field name="feedbackEnabled">
  {(field) => (
    <CheckboxField
      field={field}
      label="Enable anonymous feedback"
      description="Participants can share anonymous feedback after the event ends"
    />
  )}
</form.Field>

{watchFeedbackEnabled && (
  <form.Field name="feedbackDeadline">
    {(field) => (
      <DateTimeField
        field={field}
        label="Feedback deadline (optional)"
        description="Leave empty for no deadline"
      />
    )}
  </form.Field>
)}
```

Use `form.useStore((s) => s.values.feedbackEnabled)` to watch the toggle value.

**Step 5: Add to mutator args builders**

In `buildUpdateMutatorArgs` and `buildCreateMutatorArgs`, include:

```typescript
feedbackEnabled: values.feedbackEnabled,
feedbackDeadline: values.feedbackDeadline?.getTime() ?? null,
```

**Step 6: Update initialValues in event-detail.tsx**

In `apps/web/src/components/teams/events/event-detail.tsx`, update the `EventFormDialog` `initialValues` prop (around line 280-292) to include:

```typescript
feedbackEnabled: !!event.feedbackEnabled,
feedbackDeadline: event.feedbackDeadline,
```

**Step 7: Verify types and lint**

```bash
bun run check:types && bun run check
```

**Step 8: Commit**

```bash
git add apps/web/src/components/teams/events/event-form-dialog.tsx apps/web/src/components/teams/events/event-detail.tsx
git commit -m "feat(events): add feedback toggle and deadline to event form"
```

---

## Task 7: Create EventFeedback UI components

**Files:**
- Create: `apps/web/src/components/teams/events/event-feedback.tsx`

**Step 1: Build the component**

Create `apps/web/src/components/teams/events/event-feedback.tsx` with two sections:

1. **Admin view** — `EventFeedbackAdmin`: Uses `useQuery` with `queries.eventFeedback.byEvent` to display anonymous feedback cards. Shows count, each card has content + relative timestamp. Empty state when no responses.

2. **Participant view** — `EventFeedbackParticipant`: Calls `getMyEventFeedback` server function on mount to check for existing submission. Shows textarea form for new/edit submission. Uses `mutators.eventFeedback.submit` or `mutators.eventFeedback.update`.

3. **Wrapper** — `EventFeedbackSection`: Takes `eventId`, `feedbackEnabled`, `feedbackDeadline`, `isPastEvent`, `isMember`, `canManageFeedback`, `currentUserId`. Renders admin view for managers, participant form for members, or appropriate messaging for closed/disabled states.

Key patterns to follow:
- Use `handleMutationResult()` from `@/lib/mutation-result` for mutation results
- Use `log.error()` from `evlog` in catch blocks
- Use `useForm` from `@tanstack/react-form` with Zod for the feedback textarea
- Use `FormLayout` + `FormActions` for form structure
- Use `TextareaField` for the feedback input
- Use `Card` from design system for feedback cards
- Use `formatDistanceToNow` from `date-fns` for relative timestamps
- Use `Loader` component for loading state while fetching own submission

**Step 2: Verify types and lint**

```bash
bun run check:types && bun run check
```

**Step 3: Commit**

```bash
git add apps/web/src/components/teams/events/event-feedback.tsx
git commit -m "feat(events): add EventFeedback UI components"
```

---

## Task 8: Integrate feedback tab into event detail page

**Files:**
- Modify: `apps/web/src/components/teams/events/event-detail.tsx`

**Step 1: Add imports**

Import the new component:

```typescript
import { EventFeedbackSection } from "./event-feedback";
```

**Step 2: Add feedback query**

Add Zero query for feedback count (admin view):

```typescript
const [feedback] = useQuery(z.query.eventFeedback.byEvent({ eventId: event.id }));
```

**Step 3: Compute feedback-related state**

Near the existing `isPastEvent`/`hasStarted` computations:

```typescript
const canManageFeedback = canManage; // team leads / admins
const feedbackDeadlinePassed = event.feedbackDeadline
  ? new Date(event.feedbackDeadline) < new Date()
  : false;
```

**Step 4: Add Feedback tab**

In the `Tabs` component (lines 244-275), add a new `TabsTrigger` after Photos:

```tsx
{event.feedbackEnabled && isPastEvent ? (
  <TabsTrigger value="feedback">
    Feedback
    {feedback.length > 0 ? ` (${feedback.length})` : ""}
  </TabsTrigger>
) : null}
```

Add corresponding `TabsContent` after the Photos `TabsContent`:

```tsx
{event.feedbackEnabled && isPastEvent ? (
  <TabsContent value="feedback">
    <EventFeedbackSection
      canManageFeedback={canManageFeedback}
      currentUserId={currentUserId}
      eventId={event.id}
      feedbackDeadline={event.feedbackDeadline}
      feedbackDeadlinePassed={feedbackDeadlinePassed}
      feedbackEnabled={event.feedbackEnabled}
      isMember={!!isMember}
      isPastEvent={isPastEvent}
    />
  </TabsContent>
) : null}
```

**Step 5: Verify types and lint**

```bash
bun run check:types && bun run check
```

**Step 6: Manual test**

1. Start dev server: `bun run dev:web`
2. Create an event with feedback enabled
3. Mark event as past (or use a past event)
4. Verify Feedback tab appears for admin
5. Verify participant can submit and edit feedback
6. Verify admin sees anonymous feedback list

**Step 7: Commit**

```bash
git add apps/web/src/components/teams/events/event-detail.tsx
git commit -m "feat(events): integrate feedback tab into event detail page"
```

---

## Task 9: Run full verification

**Step 1: Type check**

```bash
bun run check:types
```

**Step 2: Lint**

```bash
bun run check
```

**Step 3: Fix any lint issues**

```bash
bun run fix
```

**Step 4: Check unused exports**

```bash
bun run check:unused
```

**Step 5: Unit tests**

```bash
bun run test:unit
```

**Step 6: Final commit if any fixes**

```bash
git add -A
git commit -m "chore: fix lint and type issues from feedback feature"
```

---

## Verification Checklist

- [ ] `feedbackEnabled` toggle works in event create/edit form
- [ ] `feedbackDeadline` date picker shows/hides with toggle
- [ ] Feedback tab only appears on past events with `feedbackEnabled=true`
- [ ] Participant can submit anonymous feedback
- [ ] Participant can edit their own feedback
- [ ] Participant cannot submit twice
- [ ] Admin sees anonymous feedback list (no user info)
- [ ] Deadline enforcement: cannot submit/edit after deadline
- [ ] Notification sent to members when feedback is enabled on past event
- [ ] `bun run check:types` passes
- [ ] `bun run check` passes
- [ ] `bun run check:unused` passes
