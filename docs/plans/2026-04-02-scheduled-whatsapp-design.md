# Scheduled WhatsApp Messages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to schedule WhatsApp messages (text + media) to groups and/or individual users for future delivery.

**Architecture:** Single `scheduled_message` table with JSONB recipients/attachments. One pg-boss job per recipient with `startAfter`. Timestamp-based invalidation for edits. Direct WAPI delivery bypassing notification system.

**Tech Stack:** Drizzle ORM, Zero (Rocicorp), pg-boss, TanStack Router/Form, Zod, R2 (Cloudflare)

---

### Task 1: Add permission + schema

**Files:**
- Modify: `packages/db/src/permissions.ts:276-318` (add permission before Settings section)
- Create: `packages/db/src/schema/scheduled-message.ts`
- Modify: `packages/db/src/schema/index.ts:19` (add export)

**Step 1: Add permission**

In `packages/db/src/permissions.ts`, add before the `// ── Settings ──` comment:

```typescript
  // ── Messages ──
  {
    id: "messages.schedule",
    name: "Schedule WhatsApp Messages",
    category: "messages",
    description: "Create, edit, and manage scheduled WhatsApp messages",
  },
```

**Step 2: Create schema file**

Create `packages/db/src/schema/scheduled-message.ts`:

```typescript
import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

const scheduledMessageStatusValues = ["pending", "sent", "failed", "cancelled"] as const;
export type ScheduledMessageStatus = (typeof scheduledMessageStatusValues)[number];
export const scheduledMessageStatusEnum = pgEnum(
  "scheduled_message_status",
  scheduledMessageStatusValues
);

export interface ScheduledMessageRecipient {
  id: string;
  label: string;
  type: "group" | "user";
}

export interface ScheduledMessageAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

export const scheduledMessage = pgTable("scheduled_message", {
  id: uuid("id").primaryKey(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: scheduledMessageStatusEnum("status").default("pending").notNull(),
  recipients: jsonb("recipients").$type<ScheduledMessageRecipient[]>().notNull(),
  attachments: jsonb("attachments").$type<ScheduledMessageAttachment[]>(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const scheduledMessageRelations = relations(scheduledMessage, ({ one }) => ({
  creator: one(user, {
    fields: [scheduledMessage.createdBy],
    references: [user.id],
  }),
}));
```

**Step 3: Register in schema index**

In `packages/db/src/schema/index.ts`, add:

```typescript
export * from "./scheduled-message";
```

**Step 4: Generate migration + Zero schema**

```bash
bun run db:generate
bun run db:migrate
bun run zero:generate
```

**Step 5: Commit**

```bash
git add packages/db/src/permissions.ts packages/db/src/schema/scheduled-message.ts packages/db/src/schema/index.ts packages/db/src/migrations/ packages/zero/src/schema.ts
git commit -m "feat(db): add scheduled_message schema and messages.schedule permission"
```

---

### Task 2: Add WhatsApp group + media messaging functions

**Files:**
- Modify: `packages/whatsapp/src/messaging.ts`

**Step 1: Add group message function**

Append to `packages/whatsapp/src/messaging.ts`:

```typescript
export async function sendWhatsAppGroupMessage(
  groupJid: string,
  message: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) return;

  const response = await fetch(`${apiUrl}/send/message`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({ phone: groupJid, message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group message error ${response.status}: ${text}`);
  }
}
```

**Step 2: Add media functions**

```typescript
export async function sendWhatsAppImage(
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) return;

  const response = await fetch(`${apiUrl}/send/image`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      image: { url: imageUrl },
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp image error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppVideo(
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) return;

  const response = await fetch(`${apiUrl}/send/video`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      video: { url: videoUrl },
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp video error ${response.status}: ${text}`);
  }
}

export async function sendWhatsAppDocument(
  phone: string,
  documentUrl: string,
  fileName: string,
  caption?: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) return;

  const response = await fetch(`${apiUrl}/send/document`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      phone,
      document: { url: documentUrl },
      fileName,
      ...(caption && { caption }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp document error ${response.status}: ${text}`);
  }
}
```

**Step 3: Add media dispatcher**

```typescript
export interface WhatsAppMediaAttachment {
  fileName: string;
  mimeType: string;
  url: string;
}

export async function sendWhatsAppMedia(
  phone: string,
  attachment: WhatsAppMediaAttachment,
  caption?: string
): Promise<void> {
  if (attachment.mimeType.startsWith("image/")) {
    await sendWhatsAppImage(phone, attachment.url, caption);
  } else if (attachment.mimeType.startsWith("video/")) {
    await sendWhatsAppVideo(phone, attachment.url, caption);
  } else {
    await sendWhatsAppDocument(phone, attachment.url, attachment.fileName, caption);
  }
}
```

**Step 4: Commit**

```bash
git add packages/whatsapp/src/messaging.ts
git commit -m "feat(whatsapp): add group messaging and media send functions"
```

---

### Task 3: Add job payload, handler, and registration

**Files:**
- Modify: `packages/jobs/src/enqueue.ts`
- Create: `packages/jobs/src/handlers/send-scheduled-whatsapp.ts`
- Modify: `packages/jobs/src/handlers/index.ts`

**Step 1: Add payload type**

In `packages/jobs/src/enqueue.ts`, add the interface after the existing `WhatsAppPayload`:

```typescript
export interface SendScheduledWhatsAppPayload {
  attachments?: Array<{ fileName: string; mimeType: string; r2Key: string }>;
  enqueuedAt: number;
  message: string;
  recipientType: "group" | "user";
  scheduledMessageId: string;
  targetAddress: string;
}
```

Add to `JobPayloads` interface (alphabetical):

```typescript
"send-scheduled-whatsapp": SendScheduledWhatsAppPayload;
```

Add to `QUEUE_NAMES` array (alphabetical, after `"send-notification"`):

```typescript
"send-scheduled-whatsapp",
```

**Step 2: Create handler**

Create `packages/jobs/src/handlers/send-scheduled-whatsapp.ts`:

```typescript
import { db } from "@pi-dash/db";
import { scheduledMessage } from "@pi-dash/db/schema/scheduled-message";
import { env } from "@pi-dash/env/server";
import {
  sendWhatsAppGroupMessage,
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  type WhatsAppMediaAttachment,
} from "@pi-dash/whatsapp/messaging";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { SendScheduledWhatsAppPayload } from "../enqueue";

export async function handleSendScheduledWhatsApp(
  jobs: Job<SendScheduledWhatsAppPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "send-scheduled-whatsapp",
    });
    const {
      attachments,
      enqueuedAt,
      message,
      recipientType,
      scheduledMessageId,
      targetAddress,
    } = job.data;

    log.set({
      event: "job_start",
      jobId: job.id,
      recipientType,
      scheduledMessageId,
      targetAddress,
    });

    // Load parent to check status and staleness
    const [parent] = await db
      .select({ status: scheduledMessage.status, updatedAt: scheduledMessage.updatedAt })
      .from(scheduledMessage)
      .where(eq(scheduledMessage.id, scheduledMessageId))
      .limit(1);

    if (!parent) {
      log.set({ event: "job_skip", reason: "parent_not_found" });
      log.emit();
      return;
    }

    if (parent.status === "cancelled") {
      log.set({ event: "job_skip", reason: "cancelled" });
      log.emit();
      return;
    }

    // Stale check: if message was edited after this job was enqueued, skip
    if (parent.updatedAt && parent.updatedAt.getTime() > enqueuedAt) {
      log.set({ event: "job_skip", reason: "stale_after_edit" });
      log.emit();
      return;
    }

    try {
      const sendText = recipientType === "group"
        ? (msg: string) => sendWhatsAppGroupMessage(targetAddress, msg)
        : (msg: string) => sendWhatsAppMessage(targetAddress, msg);

      if (attachments && attachments.length > 0) {
        const cdnUrl = env.VITE_CDN_URL;
        const mediaAttachments: WhatsAppMediaAttachment[] = attachments.map((a) => ({
          fileName: a.fileName,
          mimeType: a.mimeType,
          url: `${cdnUrl}/${a.r2Key}`,
        }));

        // Send all but last without caption
        for (let i = 0; i < mediaAttachments.length - 1; i++) {
          await sendWhatsAppMedia(targetAddress, mediaAttachments[i]);
        }
        // Send last with message as caption
        await sendWhatsAppMedia(
          targetAddress,
          mediaAttachments[mediaAttachments.length - 1],
          message
        );
      } else {
        await sendText(message);
      }

      // Update status to sent (only if still pending)
      await db
        .update(scheduledMessage)
        .set({ status: "sent", updatedAt: new Date() })
        .where(eq(scheduledMessage.id, scheduledMessageId));

      log.set({ event: "job_complete" });
      log.emit();
    } catch (error) {
      await db
        .update(scheduledMessage)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(scheduledMessage.id, scheduledMessageId));

      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error; // re-throw for pg-boss retry
    }
  }
}
```

**Step 3: Register handler**

In `packages/jobs/src/handlers/index.ts`:

Add import:
```typescript
import { handleSendScheduledWhatsApp } from "./send-scheduled-whatsapp";
```

Add registration after `send-scheduled-message` line:
```typescript
await boss.work("send-scheduled-whatsapp", handleSendScheduledWhatsApp);
```

**Step 4: Commit**

```bash
git add packages/jobs/src/enqueue.ts packages/jobs/src/handlers/send-scheduled-whatsapp.ts packages/jobs/src/handlers/index.ts
git commit -m "feat(jobs): add send-scheduled-whatsapp handler with media support"
```

---

### Task 4: Add Zero queries and mutators

**Files:**
- Create: `packages/zero/src/queries/scheduled-message.ts`
- Modify: `packages/zero/src/queries.ts`
- Create: `packages/zero/src/mutators/scheduled-message.ts`
- Modify: `packages/zero/src/mutators.ts`

**Step 1: Create queries**

Create `packages/zero/src/queries/scheduled-message.ts`:

```typescript
import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const scheduledMessageQueries = {
  all: defineQuery(() =>
    zql.scheduledMessage
      .related("creator")
      .orderBy("scheduledAt", "desc")
  ),
  byId: defineQuery(
    z.object({ id: z.string() }),
    ({ args }) =>
      zql.scheduledMessage
        .where("id", args.id)
        .related("creator")
        .one()
  ),
};
```

Register in `packages/zero/src/queries.ts`:

```typescript
import { scheduledMessageQueries } from "./queries/scheduled-message";
```

Add to `defineQueries({})`:
```typescript
scheduledMessage: scheduledMessageQueries,
```

**Step 2: Create mutators**

Create `packages/zero/src/mutators/scheduled-message.ts`:

```typescript
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

const recipientSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["group", "user"]),
});

const attachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  r2Key: z.string(),
});

export const scheduledMessageMutators = {
  create: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).max(5).optional(),
      id: z.string(),
      message: z.string().min(1),
      recipients: z.array(recipientSchema).min(1).max(10),
      scheduledAt: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const now = Date.now();
      await tx.mutate.scheduledMessage.insert({
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        status: "pending",
        recipients: args.recipients,
        attachments: args.attachments ?? null,
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const enqueuedAt = now;
        const recipients = args.recipients;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const recipient of recipients) {
          ctx.asyncTasks?.push({
            meta: { mutator: "scheduledMessage.create", scheduledMessageId, recipientId: recipient.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              let targetAddress: string;
              if (recipient.type === "group") {
                const group = await tx.run(
                  zql.whatsappGroup.where("id", recipient.id).one()
                );
                if (!group) throw new Error(`WhatsApp group ${recipient.id} not found`);
                targetAddress = group.jid;
              } else {
                const usr = await tx.run(
                  zql.user.where("id", recipient.id).one()
                );
                if (!usr?.phone) throw new Error(`User ${recipient.id} has no phone`);
                targetAddress = usr.phone;
              }

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  scheduledMessageId,
                  recipientType: recipient.type,
                  targetAddress,
                  message,
                  attachments: attachments ?? undefined,
                  enqueuedAt,
                },
                { startAfter: new Date(scheduledAt).toISOString() }
              );
            },
          });
        }
      }
    }
  ),

  update: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).max(5).optional(),
      id: z.string(),
      message: z.string().min(1),
      recipients: z.array(recipientSchema).min(1).max(10),
      scheduledAt: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) throw new Error("Scheduled message not found");
      if (existing.status !== "pending") throw new Error("Can only edit pending messages");

      const now = Date.now();
      await tx.mutate.scheduledMessage.update({
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        recipients: args.recipients,
        attachments: args.attachments ?? null,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const enqueuedAt = now;
        const recipients = args.recipients;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const recipient of recipients) {
          ctx.asyncTasks?.push({
            meta: { mutator: "scheduledMessage.update", scheduledMessageId, recipientId: recipient.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              let targetAddress: string;
              if (recipient.type === "group") {
                const group = await tx.run(
                  zql.whatsappGroup.where("id", recipient.id).one()
                );
                if (!group) throw new Error(`WhatsApp group ${recipient.id} not found`);
                targetAddress = group.jid;
              } else {
                const usr = await tx.run(
                  zql.user.where("id", recipient.id).one()
                );
                if (!usr?.phone) throw new Error(`User ${recipient.id} has no phone`);
                targetAddress = usr.phone;
              }

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  scheduledMessageId,
                  recipientType: recipient.type,
                  targetAddress,
                  message,
                  attachments: attachments ?? undefined,
                  enqueuedAt,
                },
                { startAfter: new Date(scheduledAt).toISOString() }
              );
            },
          });
        }
      }
    }
  ),

  cancel: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) throw new Error("Scheduled message not found");
      if (existing.status !== "pending") throw new Error("Can only cancel pending messages");

      await tx.mutate.scheduledMessage.update({
        id: args.id,
        status: "cancelled",
        updatedAt: Date.now(),
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) throw new Error("Scheduled message not found");
      if (existing.status === "pending") throw new Error("Cancel before deleting");

      await tx.mutate.scheduledMessage.delete({ id: args.id });
    }
  ),
};
```

Register in `packages/zero/src/mutators.ts`:

```typescript
import { scheduledMessageMutators } from "./mutators/scheduled-message";
```

Add to `defineMutators({})`:
```typescript
scheduledMessage: scheduledMessageMutators,
```

**Step 3: Run type check**

```bash
bun run check:types
```

**Step 4: Commit**

```bash
git add packages/zero/src/queries/scheduled-message.ts packages/zero/src/queries.ts packages/zero/src/mutators/scheduled-message.ts packages/zero/src/mutators.ts
git commit -m "feat(zero): add scheduled message queries and mutators"
```

---

### Task 5: Build UI — route, table, sheet, form, nav

**Files:**
- Modify: `apps/web/src/lib/nav-items.ts`
- Modify: `apps/web/src/functions/attachments.ts`
- Create: `apps/web/src/routes/_app/scheduled-messages.tsx`
- Create: `apps/web/src/components/scheduled-messages/scheduled-messages-table.tsx`
- Create: `apps/web/src/components/scheduled-messages/scheduled-message-detail-sheet.tsx`
- Create: `apps/web/src/components/scheduled-messages/schedule-message-form-dialog.tsx`
- Create: `apps/web/src/components/scheduled-messages/recipient-picker.tsx`

**Step 1: Add sidebar nav item**

In `apps/web/src/lib/nav-items.ts`:

Add import:
```typescript
import { SentIcon } from "@hugeicons/core-free-icons";
```

Add nav item:
```typescript
const scheduledMessagesNavItem: NavItem = {
  title: "Messages",
  url: "/scheduled-messages",
  icon: SentIcon,
};
```

In `buildNavGroups`, inside the Admin group section (after `jobs.manage` check):
```typescript
if (has(permissions, "messages.schedule")) {
  adminItems.push(scheduledMessagesNavItem);
}
```

Also add to `buildNavItems` (after `jobs.manage` check):
```typescript
if (has(permissions, "messages.schedule")) {
  items.push(scheduledMessagesNavItem);
}
```

**Step 2: Add R2 subfolder**

In `apps/web/src/functions/attachments.ts`:

Add to `R2_SUBFOLDERS`:
```typescript
scheduledMessages: "scheduled-messages",
```

Add `R2_SUBFOLDERS.scheduledMessages` to both `subfolder` enum arrays in `getPresignedUploadUrl` and `deleteUploadedAsset` and `deleteUploadedAssets`.

Add video MIME types to `ALLOWED_MIME_TYPES`:
```typescript
"video/mp4",
"video/quicktime",
```

**Step 3: Create route page**

Use the `create-data-table` skill for the table component.
Use the `create-form` skill for the form dialog.
Use the `create-dialog` skill for the detail sheet.

Create `apps/web/src/routes/_app/scheduled-messages.tsx` following the pattern from `apps/web/src/routes/_app/jobs.tsx` — a `createFileRoute` with:
- `beforeLoad`: `assertPermission(context, "messages.schedule")`
- Component renders the table + detail sheet + form dialog
- Status filter using `TableFilterSelect`

**Step 4: Create table component**

Create `apps/web/src/components/scheduled-messages/scheduled-messages-table.tsx`:

Columns:
- `message` — truncated to 80 chars
- `scheduledAt` — formatted datetime
- `status` — badge (pending=outline, sent=success, failed=destructive, cancelled=warning)
- `recipients` — count with type icons
- `creator` — user name from `.creator` relation
- Row actions: Edit (pending only), Cancel (pending only), Delete (terminal only), View details

**Step 5: Create detail sheet**

Create `apps/web/src/components/scheduled-messages/scheduled-message-detail-sheet.tsx`:

Following `JobDetailSheet` pattern — Sheet with:
- Status badge
- DetailRow grid: scheduled time, created by, created at
- Recipients list with group/user tags
- Attachment previews (thumbnail for images, file icon for docs/videos)
- Full message text
- Action buttons: Edit, Cancel, Delete (based on status)

**Step 6: Create form dialog**

Create `apps/web/src/components/scheduled-messages/schedule-message-form-dialog.tsx`:

TanStack Form + Zod schema:
- `message`: TextareaField, required
- `scheduledAt`: InputField type="datetime-local", must be future
- `recipients`: RecipientPicker component (multi-select, max 10)
- `attachments`: File upload using `useFileUpload`, max 5, upload to R2

On submit: call `mutate.scheduledMessage.create` or `.update`, then `handleMutationResult()`.

**Step 7: Create recipient picker**

Create `apps/web/src/components/scheduled-messages/recipient-picker.tsx`:

Multi-select combobox with two sections:
- "Groups" section — from `useQuery(queries.whatsappGroup.all())`
- "Users" section — from `useQuery(queries.user.all())` filtered client-side to `isOnWhatsapp === true`
- Selected items shown as badges with remove button
- Max 10 total

**Step 8: Run checks**

```bash
bun run check:types
bun run check
bun run fix
```

**Step 9: Commit**

```bash
git add apps/web/src/lib/nav-items.ts apps/web/src/functions/attachments.ts apps/web/src/routes/_app/scheduled-messages.tsx apps/web/src/components/scheduled-messages/
git commit -m "feat(web): add scheduled WhatsApp messages UI"
```

---

### Task 6: Verification

**Step 1: Type check**

```bash
bun run check:types
```

**Step 2: Lint**

```bash
bun run check
bun run fix
```

**Step 3: Check unused exports**

```bash
bun run check:unused
```

**Step 4: Manual test**

1. Start dev server: `bun run dev`
2. Log in as admin
3. Navigate to /scheduled-messages — verify empty table renders
4. Click "Schedule Message" — verify form dialog opens
5. Fill message, pick 1 group + 1 user, set time 2 minutes in future, attach an image
6. Submit — verify row appears with "pending" status
7. Click row — verify detail sheet shows correct info
8. Check /jobs page — verify pg-boss jobs created with correct `startAfter`
9. Edit the pending message — change text, verify it saves
10. Cancel a pending message — verify status changes to "cancelled"
11. Wait for a non-cancelled message to fire — verify status changes to "sent"
12. Delete a completed/cancelled message — verify it's removed
