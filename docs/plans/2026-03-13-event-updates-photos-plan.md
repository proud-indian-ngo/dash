# Event Updates & Photos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add post-event updates (rich text via Tiptap), photo gallery (via Immich with approval workflow), and lock down cancel/interest once event starts.

**Architecture:** Three new DB tables (eventUpdate, eventPhoto, eventImmichAlbum) with Zero mutators/queries. Tiptap for rich text editing with R2 image uploads. Immich integration via server-side API calls in mutator async tasks. Photos staged in R2, promoted to Immich on approval.

**Tech Stack:** Tiptap (rich text), Immich API (photo gallery), R2 (staging uploads), Zero (sync), Drizzle (schema)

---

### Task 0: Add Immich env vars

**Files:**
- Modify: `packages/env/src/server.ts:41-42`

**Step 1: Add env vars**

In `packages/env/src/server.ts`, add after the `WHATSAPP_AUTH_PASS` line (line 44):

```typescript
IMMICH_SERVER_URL: z.url().optional(),
IMMICH_API_KEY: z.string().min(1).optional(),
```

Both optional so the app doesn't break without Immich configured.

**Step 2: Add to `.env.sample`**

Append to `.env.sample`:

```
IMMICH_SERVER_URL=
IMMICH_API_KEY=
```

**Step 3: Commit**

```bash
git add packages/env/src/server.ts .env.sample
git commit -m "feat(env): add Immich server URL and API key env vars"
```

---

### Task 1: Create Drizzle schema for eventUpdate, eventPhoto, eventImmichAlbum

**Files:**
- Create: `packages/db/src/schema/event-update.ts`
- Create: `packages/db/src/schema/event-photo.ts`
- Modify: `packages/db/src/schema/index.ts`

**Step 1: Create `event-update.ts`**

Follow the pattern from `packages/db/src/schema/event-interest.ts`:

```typescript
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventUpdate = pgTable(
  "event_update",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("event_update_eventId_idx").on(table.eventId),
  ]
);

export const eventUpdateRelations = relations(eventUpdate, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventUpdate.eventId],
    references: [teamEvent.id],
  }),
  author: one(user, {
    fields: [eventUpdate.createdBy],
    references: [user.id],
  }),
}));
```

**Step 2: Create `event-photo.ts`**

```typescript
import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventPhotoStatusEnum = pgEnum("event_photo_status", [
  "pending",
  "approved",
  "rejected",
]);

export const eventPhoto = pgTable(
  "event_photo",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    immichAssetId: text("immich_asset_id"),
    caption: text("caption"),
    status: eventPhotoStatusEnum("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("event_photo_eventId_idx").on(table.eventId),
    index("event_photo_uploadedBy_idx").on(table.uploadedBy),
  ]
);

export const eventPhotoRelations = relations(eventPhoto, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventPhoto.eventId],
    references: [teamEvent.id],
  }),
  uploader: one(user, {
    fields: [eventPhoto.uploadedBy],
    references: [user.id],
    relationName: "photoUploader",
  }),
  reviewer: one(user, {
    fields: [eventPhoto.reviewedBy],
    references: [user.id],
    relationName: "photoReviewer",
  }),
}));

export const eventImmichAlbum = pgTable(
  "event_immich_album",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    immichAlbumId: text("immich_album_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_immich_album_eventId_uidx").on(table.eventId),
  ]
);

export const eventImmichAlbumRelations = relations(
  eventImmichAlbum,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [eventImmichAlbum.eventId],
      references: [teamEvent.id],
    }),
  })
);
```

**Step 3: Add barrel exports to `packages/db/src/schema/index.ts`**

Add two new lines:

```typescript
export * from "./event-photo";
export * from "./event-update";
```

**Step 4: Generate Drizzle types and Zero schema**

```bash
bun run db:generate
bun run zero:generate
```

**Step 5: Commit**

```bash
git add packages/db/src/schema/event-update.ts packages/db/src/schema/event-photo.ts packages/db/src/schema/index.ts packages/db/src/migrations/ packages/zero/src/schema.ts
git commit -m "feat(db): add eventUpdate, eventPhoto, eventImmichAlbum tables"
```

---

### Task 2: Add startTime guards to existing mutators

**Files:**
- Modify: `packages/zero/src/mutators/team-event.ts:305`
- Modify: `packages/zero/src/mutators/event-interest.ts:22`

**Step 1: Guard `teamEvent.cancel`**

In `packages/zero/src/mutators/team-event.ts`, after the permission check (line 305) and before `const now = Date.now();` (line 307), add:

```typescript
if (existing.startTime <= Date.now()) {
  throw new Error("Cannot cancel an event that has already started");
}
```

**Step 2: Guard `eventInterest.create`**

In `packages/zero/src/mutators/event-interest.ts`, after the `if (!event.isPublic)` check (line 26) and before the existing member check (line 28), add:

```typescript
if (event.startTime <= Date.now()) {
  throw new Error("Cannot show interest in an event that has already started");
}
```

**Step 3: Run type check**

```bash
bun run check:types
```

**Step 4: Commit**

```bash
git add packages/zero/src/mutators/team-event.ts packages/zero/src/mutators/event-interest.ts
git commit -m "feat(events): prevent cancel and interest after event starts"
```

---

### Task 3: Hide cancel/interest UI after event starts

**Files:**
- Modify: `apps/web/src/components/teams/events/event-detail.tsx`
- Modify: `apps/web/src/components/events/public-events-table.tsx`

**Step 1: Update event-detail.tsx**

The component already has `isPastEvent` (line 230). Change the cancel and interest logic:

Replace the current `canCancel` / `canManageVolunteers` lines (229-232):

```typescript
const eventTime = event.endTime ?? event.startTime;
const isPastEvent = new Date(eventTime) < new Date();
const canCancel = isPastEvent ? isAdmin : canManage;
const canManageVolunteers = isPastEvent ? isAdmin : canManage;
```

With:

```typescript
const eventTime = event.endTime ?? event.startTime;
const isPastEvent = new Date(eventTime) < new Date();
const hasStarted = new Date(event.startTime) <= new Date();
const canCancel = hasStarted ? false : canManage;
const canManageVolunteers = isPastEvent ? isAdmin : canManage;
```

Also hide the `VolunteerInterestSection` when event has started. In the JSX, wrap it:

```typescript
{!hasStarted ? (
  <VolunteerInterestSection
    canManage={canManage}
    interests={interests}
    isMember={isMember}
    isPublic={!!event.isPublic}
    myInterest={myInterest}
    onShowInterest={() => dialog.open({ type: "interest" })}
  />
) : null}
```

**Step 2: Update public-events-table.tsx**

In `InterestCell`, check if event has started. If `event.startTime <= Date.now()`, don't show "Show Interest" button. The cell should show nothing (or a "Started" badge) for events that have begun.

**Step 3: Run lint**

```bash
bun run check
```

**Step 4: Commit**

```bash
git add apps/web/src/components/teams/events/event-detail.tsx apps/web/src/components/events/public-events-table.tsx
git commit -m "feat(ui): hide cancel and interest buttons after event starts"
```

---

### Task 4: Create Immich server functions

**Files:**
- Create: `apps/web/src/functions/immich.ts`

**Step 1: Create Immich utility**

```typescript
import { env } from "@pi-dash/env/server";
import { S3Client } from "bun";

function getImmichHeaders() {
  return {
    "x-api-key": env.IMMICH_API_KEY!,
  };
}

function getImmichUrl(path: string) {
  return `${env.IMMICH_SERVER_URL!}/api${path}`;
}

function getS3() {
  return new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_KEY_ID,
    bucket: env.R2_BUCKET_NAME,
  });
}

export async function createImmichAlbum(albumName: string): Promise<string> {
  const res = await fetch(getImmichUrl("/albums"), {
    method: "POST",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ albumName }),
  });
  if (!res.ok) {
    throw new Error(`Immich createAlbum failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function uploadAssetToImmichAlbum(
  albumId: string,
  r2Key: string,
  filename: string
): Promise<string> {
  // Download from R2
  const s3 = getS3();
  const file = s3.file(r2Key);
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer]);

  // Upload to Immich
  const formData = new FormData();
  formData.append("assetData", blob, filename);
  formData.append("deviceAssetId", `pi-dash-${r2Key}`);
  formData.append("deviceId", "pi-dash");
  formData.append("fileCreatedAt", new Date().toISOString());
  formData.append("fileModifiedAt", new Date().toISOString());

  const uploadRes = await fetch(getImmichUrl("/assets"), {
    method: "POST",
    headers: getImmichHeaders(),
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(`Immich upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const uploadData = (await uploadRes.json()) as { id: string };
  const assetId = uploadData.id;

  // Add to album
  const albumRes = await fetch(getImmichUrl(`/albums/${albumId}/assets`), {
    method: "PUT",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!albumRes.ok) {
    throw new Error(`Immich addToAlbum failed: ${albumRes.status} ${await albumRes.text()}`);
  }

  return assetId;
}

export async function deleteImmichAsset(assetId: string): Promise<void> {
  const res = await fetch(getImmichUrl("/assets"), {
    method: "DELETE",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId], force: true }),
  });
  if (!res.ok) {
    throw new Error(`Immich deleteAsset failed: ${res.status} ${await res.text()}`);
  }
}
```

**Step 2: Run type check**

```bash
bun run check:types
```

**Step 3: Commit**

```bash
git add apps/web/src/functions/immich.ts
git commit -m "feat(immich): add server functions for album and asset management"
```

---

### Task 5: Create eventUpdate mutators

**Files:**
- Create: `packages/zero/src/mutators/event-update.ts`
- Modify: `packages/zero/src/mutators.ts`

**Step 1: Create mutators**

Follow the pattern from `packages/zero/src/mutators/event-interest.ts`:

```typescript
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type { EventUpdate, TeamEvent } from "../schema";
import { zql } from "../schema";

export const eventUpdateMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      content: z.string().min(1),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      if (event.startTime > args.now) {
        throw new Error("Cannot post updates before event starts");
      }

      // Permission: admin or team lead
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) throw new Error("Unauthorized");
      }

      await tx.mutate.eventUpdate.insert({
        id: args.id,
        eventId: args.eventId,
        content: args.content,
        createdBy: ctx.userId,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      content: z.string().min(1),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) throw new Error("Update not found");

      // Permission: admin or original author
      if (ctx.role !== "admin" && existing.createdBy !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      await tx.mutate.eventUpdate.update({
        id: args.id,
        content: args.content,
        updatedAt: args.now,
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) throw new Error("Update not found");

      if (ctx.role !== "admin" && existing.createdBy !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      await tx.mutate.eventUpdate.delete({ id: args.id });
    }
  ),
};
```

**Step 2: Register in `packages/zero/src/mutators.ts`**

Add import and entry:

```typescript
import { eventUpdateMutators } from "./mutators/event-update";
```

Add to `defineMutators()`:
```typescript
eventUpdate: eventUpdateMutators,
```

**Step 3: Run type check**

```bash
bun run check:types
```

**Step 4: Commit**

```bash
git add packages/zero/src/mutators/event-update.ts packages/zero/src/mutators.ts
git commit -m "feat(mutators): add eventUpdate create/update/delete mutators"
```

---

### Task 6: Create eventPhoto mutators

**Files:**
- Create: `packages/zero/src/mutators/event-photo.ts`
- Modify: `packages/zero/src/mutators.ts`

**Step 1: Create mutators**

```typescript
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type {
  EventImmichAlbum,
  EventPhoto,
  TeamEvent,
  TeamEventMember,
} from "../schema";
import { zql } from "../schema";

async function isAdminOrLead(
  tx: Parameters<Parameters<typeof defineMutator>[1]>[0]["tx"],
  ctx: { role: string; userId: string },
  teamId: string
): Promise<boolean> {
  if (ctx.role === "admin") return true;
  const membership = await tx.run(
    zql.teamMember
      .where("teamId", teamId)
      .where("userId", ctx.userId)
      .where("role", "lead")
      .one()
  );
  return !!membership;
}

export const eventPhotoMutators = {
  upload: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      r2Key: z.string(),
      caption: z.string().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      if (event.startTime > args.now) {
        throw new Error("Cannot upload photos before event starts");
      }

      const canManage = await isAdminOrLead(tx, ctx, event.teamId);

      // If not admin/lead, must be event member
      if (!canManage) {
        const membership = (await tx.run(
          zql.teamEventMember
            .where("eventId", args.eventId)
            .where("userId", ctx.userId)
            .one()
        )) as TeamEventMember | undefined;
        if (!membership) throw new Error("Unauthorized");
      }

      const status = canManage ? "approved" : "pending";

      await tx.mutate.eventPhoto.insert({
        id: args.id,
        eventId: args.eventId,
        r2Key: args.r2Key,
        immichAssetId: null,
        caption: args.caption ?? null,
        status,
        uploadedBy: ctx.userId,
        reviewedBy: canManage ? ctx.userId : null,
        reviewedAt: canManage ? args.now : null,
        createdAt: args.now,
      });

      // If auto-approved (admin/lead), trigger Immich upload
      if (canManage && tx.location === "server") {
        const eventId = args.eventId;
        const eventName = event.name;
        const photoId = args.id;
        const r2Key = args.r2Key;

        ctx.asyncTasks?.push({
          meta: { mutator: "uploadEventPhoto", eventId, photoId },
          fn: async () => {
            const { ensureImmichAlbumAndUpload } = await import(
              "../../apps-bridge/immich-bridge"
            );
            await ensureImmichAlbumAndUpload({
              eventId,
              eventName,
              photoId,
              r2Key,
            });
          },
        });
      }
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) throw new Error("Photo not found");
      if (photo.status !== "pending") throw new Error("Photo is not pending");

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      const canManage = await isAdminOrLead(tx, ctx, event.teamId);
      if (!canManage) throw new Error("Unauthorized");

      await tx.mutate.eventPhoto.update({
        id: args.id,
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server") {
        const eventId = photo.eventId;
        const eventName = event.name;
        const photoId = args.id;
        const r2Key = photo.r2Key;

        ctx.asyncTasks?.push({
          meta: { mutator: "approveEventPhoto", eventId, photoId },
          fn: async () => {
            const { ensureImmichAlbumAndUpload } = await import(
              "../../apps-bridge/immich-bridge"
            );
            await ensureImmichAlbumAndUpload({
              eventId,
              eventName,
              photoId,
              r2Key,
            });
          },
        });
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) throw new Error("Photo not found");
      if (photo.status !== "pending") throw new Error("Photo is not pending");

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      const canManage = await isAdminOrLead(tx, ctx, event.teamId);
      if (!canManage) throw new Error("Unauthorized");

      await tx.mutate.eventPhoto.update({
        id: args.id,
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server") {
        const r2Key = photo.r2Key;
        ctx.asyncTasks?.push({
          meta: { mutator: "rejectEventPhoto", photoId: args.id },
          fn: async () => {
            const { deleteUploadedAsset } = await import(
              "../../functions/attachments"
            );
            // Delete from R2 via server function handler logic
            const { S3Client } = await import("bun");
            const { env } = await import("@pi-dash/env/server");
            const s3 = new S3Client({
              endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_KEY_ID,
              bucket: env.R2_BUCKET_NAME,
            });
            await s3.delete(r2Key);
          },
        });
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) throw new Error("Photo not found");

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) throw new Error("Event not found");

      const canManage = await isAdminOrLead(tx, ctx, event.teamId);
      if (!canManage) throw new Error("Unauthorized");

      await tx.mutate.eventPhoto.delete({ id: args.id });

      if (tx.location === "server") {
        const r2Key = photo.r2Key;
        const immichAssetId = photo.immichAssetId;

        ctx.asyncTasks?.push({
          meta: { mutator: "deleteEventPhoto", photoId: args.id },
          fn: async () => {
            const { env } = await import("@pi-dash/env/server");
            const { S3Client } = await import("bun");
            const s3 = new S3Client({
              endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_KEY_ID,
              bucket: env.R2_BUCKET_NAME,
            });
            await s3.delete(r2Key);

            if (immichAssetId) {
              const { deleteImmichAsset } = await import(
                "../../functions/immich"
              );
              await deleteImmichAsset(immichAssetId);
            }
          },
        });
      }
    }
  ),
};
```

**Note on imports:** The async task imports use relative paths from the mutators directory. The exact paths will need adjustment based on the final location of `immich.ts`. Since mutators run server-side in async tasks, we can import from `apps/web/src/functions/immich.ts`. However, the Zero mutators package is separate from apps/web. The Immich bridge logic should live in a shared location accessible from mutator async tasks. Check how existing async tasks import from `@pi-dash/notifications` and `@pi-dash/whatsapp` — follow that pattern. You may need to create the Immich functions in a package or use a direct import path that works from the mutator context.

**Step 2: Create Immich bridge for mutator async tasks**

Since mutator async tasks use dynamic imports from packages (e.g., `@pi-dash/notifications`), and the Immich functions need access to both R2 and the Immich API, the cleanest approach is to put the bridge logic directly in the async task closures (like the WhatsApp pattern), importing `@pi-dash/env/server` and making fetch calls inline. Alternatively, if there are multiple call sites, create a utility at `packages/zero/src/lib/immich.ts` that the mutators can import.

The practical approach: inline the Immich API calls in the async task, similar to how WhatsApp calls are inlined. Use `apps/web/src/functions/immich.ts` as a reference but duplicate the logic in the async task since cross-package dynamic imports from `apps/web` into `packages/zero` won't work.

**Step 3: Register in `packages/zero/src/mutators.ts`**

```typescript
import { eventPhotoMutators } from "./mutators/event-photo";
```

Add to `defineMutators()`:
```typescript
eventPhoto: eventPhotoMutators,
```

**Step 4: Run type check**

```bash
bun run check:types
```

**Step 5: Commit**

```bash
git add packages/zero/src/mutators/event-photo.ts packages/zero/src/mutators.ts
git commit -m "feat(mutators): add eventPhoto upload/approve/reject/delete mutators"
```

---

### Task 7: Create Zero queries for eventUpdate, eventPhoto, eventImmichAlbum

**Files:**
- Create: `packages/zero/src/queries/event-update.ts`
- Create: `packages/zero/src/queries/event-photo.ts`
- Modify: `packages/zero/src/queries.ts`

**Step 1: Create `event-update.ts` queries**

Follow pattern from `packages/zero/src/queries/event-interest.ts`:

```typescript
import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const eventUpdateQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .related("author")
        .orderBy("createdAt", "desc")
  ),
};
```

**Step 2: Create `event-photo.ts` queries**

```typescript
import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const eventPhotoQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
  approvedByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "approved")
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
  pendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "pending")
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
};

export const eventImmichAlbumQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventImmichAlbum.where("eventId", eventId).one()
  ),
};
```

**Step 3: Register in `packages/zero/src/queries.ts`**

Add imports:

```typescript
import { eventUpdateQueries } from "./queries/event-update";
import { eventPhotoQueries } from "./queries/event-photo";
import { eventImmichAlbumQueries } from "./queries/event-photo";
```

Add to `defineQueries()`:

```typescript
eventUpdate: eventUpdateQueries,
eventPhoto: eventPhotoQueries,
eventImmichAlbum: eventImmichAlbumQueries,
```

**Step 4: Run type check**

```bash
bun run check:types
```

**Step 5: Commit**

```bash
git add packages/zero/src/queries/event-update.ts packages/zero/src/queries/event-photo.ts packages/zero/src/queries.ts
git commit -m "feat(queries): add eventUpdate, eventPhoto, eventImmichAlbum queries"
```

---

### Task 8: Install Tiptap and create editor component

**Files:**
- Create: `apps/web/src/components/editor/tiptap-editor.tsx`
- Create: `apps/web/src/components/editor/tiptap-renderer.tsx`

**Step 1: Install Tiptap packages**

```bash
cd apps/web && bun add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/pm
```

**Step 2: Create `tiptap-editor.tsx`**

```tsx
import { Button } from "@pi-dash/design-system/components/ui/button";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback } from "react";
import { toast } from "sonner";
import { getPresignedUploadUrl } from "@/functions/attachments";

interface TiptapEditorProps {
  content?: string;
  onSave: (content: string) => void;
  onCancel?: () => void;
  saving?: boolean;
}

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export function TiptapEditor({
  content,
  onSave,
  onCancel,
  saving,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
    ],
    content: content ? JSON.parse(content) : undefined,
  });

  const handleImageUpload = useCallback(async () => {
    if (!editor) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_MIME_TYPES.join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > MAX_IMAGE_SIZE) {
        toast.error("Image must be under 10MB");
        return;
      }

      const mimeType = file.type as (typeof IMAGE_MIME_TYPES)[number];
      if (!IMAGE_MIME_TYPES.includes(mimeType)) {
        toast.error("Unsupported image type");
        return;
      }

      const { presignedUrl, key } = await getPresignedUploadUrl({
        data: {
          fileName: file.name,
          fileSize: file.size,
          mimeType,
        },
      });

      await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      });

      // Use CDN URL for the image
      const { env } = await import("@pi-dash/env/web");
      const cdnBase = env.VITE_ASSET_CDN.replace(/\/$/, "");
      editor.chain().focus().setImage({ src: `${cdnBase}/${key}` }).run();
    };
    input.click();
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(JSON.stringify(editor.getJSON()));
  }, [editor, onSave]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 border-b pb-2">
        <Button
          onClick={() => editor.chain().focus().toggleBold().run()}
          size="sm"
          type="button"
          variant={editor.isActive("bold") ? "default" : "ghost"}
        >
          B
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size="sm"
          type="button"
          variant={editor.isActive("italic") ? "default" : "ghost"}
        >
          I
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size="sm"
          type="button"
          variant={editor.isActive("bulletList") ? "default" : "ghost"}
        >
          List
        </Button>
        <Button
          onClick={handleImageUpload}
          size="sm"
          type="button"
          variant="ghost"
        >
          Image
        </Button>
      </div>
      <EditorContent
        className="prose prose-sm min-h-[120px] rounded-md border p-3 focus-within:ring-1 focus-within:ring-ring"
        editor={editor}
      />
      <div className="flex gap-2">
        <Button
          disabled={saving}
          onClick={handleSave}
          size="sm"
          type="button"
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        {onCancel ? (
          <Button
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

**Step 3: Create `tiptap-renderer.tsx`**

```tsx
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface TiptapRendererProps {
  content: string;
}

export function TiptapRenderer({ content }: TiptapRendererProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: true }),
      Image.configure({ inline: false }),
    ],
    content: JSON.parse(content),
    editable: false,
  });

  if (!editor) return null;

  return (
    <EditorContent
      className="prose prose-sm"
      editor={editor}
    />
  );
}
```

**Step 4: Run lint and type check**

```bash
bun run check:types && bun run check
```

**Step 5: Commit**

```bash
git add apps/web/src/components/editor/
git commit -m "feat(ui): add Tiptap rich text editor and renderer components"
```

---

### Task 9: Create event updates UI components

**Files:**
- Create: `apps/web/src/components/teams/events/event-updates.tsx`

**Step 1: Create component**

This component renders the list of updates + the "Post Update" editor for admin/lead:

```tsx
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventUpdate, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { TiptapRenderer } from "@/components/editor/tiptap-renderer";

type UpdateWithAuthor = EventUpdate & { author: User | undefined };

interface EventUpdatesProps {
  canManage: boolean;
  eventId: string;
  updates: readonly UpdateWithAuthor[];
}

export function EventUpdates({
  canManage,
  eventId,
  updates,
}: EventUpdatesProps) {
  const zero = useZero();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = useCallback(
    async (content: string) => {
      setSaving(true);
      const now = Date.now();
      const res = await zero.mutate(
        mutators.eventUpdate.create({
          id: crypto.randomUUID(),
          eventId,
          content,
          now,
        })
      ).server;
      setSaving(false);
      if (res.type === "error") {
        toast.error("Failed to post update");
      } else {
        toast.success("Update posted");
        setIsCreating(false);
      }
    },
    [zero, eventId]
  );

  const handleUpdate = useCallback(
    async (id: string, content: string) => {
      setSaving(true);
      const res = await zero.mutate(
        mutators.eventUpdate.update({ id, content, now: Date.now() })
      ).server;
      setSaving(false);
      if (res.type === "error") {
        toast.error("Failed to update");
      } else {
        toast.success("Update saved");
        setEditingId(null);
      }
    },
    [zero]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await zero.mutate(
        mutators.eventUpdate.delete({ id })
      ).server;
      if (res.type === "error") {
        toast.error("Failed to delete update");
      } else {
        toast.success("Update deleted");
      }
    },
    [zero]
  );

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        isCreating ? (
          <TiptapEditor
            onCancel={() => setIsCreating(false)}
            onSave={handleCreate}
            saving={saving}
          />
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            size="sm"
            variant="outline"
          >
            Post Update
          </Button>
        )
      ) : null}

      {updates.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm">
          No updates yet.
        </p>
      ) : null}

      {updates.map((update) => (
        <div className="flex flex-col gap-2" key={update.id}>
          <div className="flex items-center gap-2">
            {update.author ? (
              <UserAvatar
                className="size-6"
                fallbackClassName="text-xs"
                user={update.author}
              />
            ) : null}
            <span className="font-medium text-sm">
              {update.author?.name ?? "Unknown"}
            </span>
            <span className="text-muted-foreground text-xs">
              {format(new Date(update.createdAt), "PPP p")}
              {update.updatedAt !== update.createdAt ? " (edited)" : ""}
            </span>
          </div>

          {editingId === update.id ? (
            <TiptapEditor
              content={update.content}
              onCancel={() => setEditingId(null)}
              onSave={(content) => handleUpdate(update.id, content)}
              saving={saving}
            />
          ) : (
            <>
              <TiptapRenderer content={update.content} />
              {canManage || update.createdBy === zero.userID ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setEditingId(update.id)}
                    size="sm"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleDelete(update.id)}
                    size="sm"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </>
          )}
          <Separator />
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Run lint**

```bash
bun run check
```

**Step 3: Commit**

```bash
git add apps/web/src/components/teams/events/event-updates.tsx
git commit -m "feat(ui): add EventUpdates component with create/edit/delete"
```

---

### Task 10: Create event photos UI components

**Files:**
- Create: `apps/web/src/components/teams/events/event-photos.tsx`

**Step 1: Create component**

This component shows the photo grid, upload button, and pending approval section:

```tsx
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { getPresignedUploadUrl } from "@/functions/attachments";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20MB

interface EventPhotosProps {
  canManage: boolean;
  eventId: string;
  isMember: boolean;
  approvedPhotos: readonly PhotoWithUploader[];
  pendingPhotos: readonly PhotoWithUploader[];
  immichAlbumUrl?: string | null;
}

export function EventPhotos({
  canManage,
  eventId,
  isMember,
  approvedPhotos,
  pendingPhotos,
  immichAlbumUrl,
}: EventPhotosProps) {
  const zero = useZero();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_MIME_TYPES.join(",");
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files?.length) return;

      setUploading(true);
      for (const file of files) {
        if (file.size > MAX_PHOTO_SIZE) {
          toast.error(`${file.name} exceeds 20MB limit`);
          continue;
        }
        const mimeType = file.type as (typeof IMAGE_MIME_TYPES)[number];
        if (!IMAGE_MIME_TYPES.includes(mimeType)) {
          toast.error(`${file.name}: unsupported type`);
          continue;
        }

        const { presignedUrl, key } = await getPresignedUploadUrl({
          data: {
            fileName: file.name,
            fileSize: file.size,
            mimeType,
          },
        });
        await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": mimeType },
        });

        const now = Date.now();
        await zero.mutate(
          mutators.eventPhoto.upload({
            id: crypto.randomUUID(),
            eventId,
            r2Key: key,
            now,
          })
        ).server;
      }
      setUploading(false);
      toast.success("Photos uploaded");
    };
    input.click();
  }, [zero, eventId]);

  const handleApprove = useCallback(
    async (id: string) => {
      const res = await zero.mutate(
        mutators.eventPhoto.approve({ id, now: Date.now() })
      ).server;
      if (res.type === "error") toast.error("Failed to approve");
      else toast.success("Photo approved");
    },
    [zero]
  );

  const handleReject = useCallback(
    async (id: string) => {
      const res = await zero.mutate(
        mutators.eventPhoto.reject({ id, now: Date.now() })
      ).server;
      if (res.type === "error") toast.error("Failed to reject");
      else toast.success("Photo rejected");
    },
    [zero]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await zero.mutate(
        mutators.eventPhoto.delete({ id })
      ).server;
      if (res.type === "error") toast.error("Failed to delete");
      else toast.success("Photo deleted");
    },
    [zero]
  );

  const canUpload = canManage || isMember;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {canUpload ? (
          <Button
            disabled={uploading}
            onClick={handleUpload}
            size="sm"
            variant="outline"
          >
            {uploading ? "Uploading..." : "Upload Photos"}
          </Button>
        ) : null}
        {immichAlbumUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={immichAlbumUrl} rel="noopener noreferrer" target="_blank">
              View Album
            </a>
          </Button>
        ) : null}
      </div>

      {/* Pending photos - admin/lead only */}
      {canManage && pendingPhotos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">
            Pending Approval ({pendingPhotos.length})
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {pendingPhotos.map((photo) => (
              <PhotoCard
                canManage
                key={photo.id}
                onApprove={() => handleApprove(photo.id)}
                onDelete={() => handleDelete(photo.id)}
                onReject={() => handleReject(photo.id)}
                photo={photo}
                showApproval
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Approved photos */}
      {approvedPhotos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {approvedPhotos.map((photo) => (
            <PhotoCard
              canManage={canManage}
              key={photo.id}
              onDelete={() => handleDelete(photo.id)}
              photo={photo}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground text-sm">
          No photos yet.
        </p>
      )}
    </div>
  );
}

function PhotoCard({
  canManage,
  onApprove,
  onDelete,
  onReject,
  photo,
  showApproval,
}: {
  canManage: boolean;
  onApprove?: () => void;
  onDelete: () => void;
  onReject?: () => void;
  photo: PhotoWithUploader;
  showApproval?: boolean;
}) {
  // Construct image URL from R2 key using CDN
  const { env } = require("@pi-dash/env/web");
  const cdnBase = env.VITE_ASSET_CDN.replace(/\/$/, "");
  const imageUrl = `/cdn-cgi/image/width=320,height=320,fit=cover,format=auto,quality=80/${cdnBase}/${photo.r2Key}`;

  return (
    <div className="group relative overflow-hidden rounded-md border">
      <img
        alt={photo.caption ?? "Event photo"}
        className="aspect-square w-full object-cover"
        loading="lazy"
        src={imageUrl}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <div className="flex items-center gap-1">
          {photo.uploader ? (
            <UserAvatar
              className="size-4"
              fallbackClassName="text-[8px]"
              user={photo.uploader}
            />
          ) : null}
          <span className="truncate text-white text-xs">
            {photo.uploader?.name ?? "Unknown"}
          </span>
        </div>
      </div>
      {showApproval ? (
        <div className="absolute inset-x-0 top-0 flex gap-1 p-1">
          <Badge variant="outline">Pending</Badge>
        </div>
      ) : null}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {showApproval && onApprove ? (
          <Button onClick={onApprove} size="icon" variant="default">
            ✓
          </Button>
        ) : null}
        {showApproval && onReject ? (
          <Button onClick={onReject} size="icon" variant="destructive">
            ✗
          </Button>
        ) : null}
        {canManage ? (
          <Button onClick={onDelete} size="icon" variant="destructive">
            ×
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

**Note:** The `PhotoCard` component uses `require("@pi-dash/env/web")` which should be replaced with a proper import or the CDN URL should be passed as a prop. Use the same pattern as `apps/web/src/lib/attachment-links.ts` — import `env` from `@pi-dash/env/web` at the top of the file and use `getImageProxyUrl` or build the URL similarly.

**Step 2: Run lint**

```bash
bun run check
```

**Step 3: Commit**

```bash
git add apps/web/src/components/teams/events/event-photos.tsx
git commit -m "feat(ui): add EventPhotos component with upload and approval"
```

---

### Task 11: Add Updates and Photos tabs to event detail page

**Files:**
- Modify: `apps/web/src/components/teams/events/event-detail.tsx`
- Modify: `apps/web/src/routes/_app/events/$id.tsx`

**Step 1: Update the route loader**

In `apps/web/src/routes/_app/events/$id.tsx`, add preloads for the new queries:

```typescript
queries.eventUpdate.byEvent({ eventId: id });
queries.eventPhoto.approvedByEvent({ eventId: id });
queries.eventPhoto.pendingByEvent({ eventId: id });
queries.eventImmichAlbum.byEvent({ eventId: id });
```

Pass these to the `EventDetail` component.

**Step 2: Add tabs to event-detail.tsx**

Import `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from the design system. Add the `EventUpdates` and `EventPhotos` components.

After the volunteers section, add:

```tsx
{hasStarted ? (
  <>
    <Separator />
    <Tabs defaultValue="updates">
      <TabsList>
        <TabsTrigger value="updates">Updates</TabsTrigger>
        <TabsTrigger value="photos">Photos</TabsTrigger>
      </TabsList>
      <TabsContent value="updates">
        <EventUpdates
          canManage={canManage}
          eventId={event.id}
          updates={updates}
        />
      </TabsContent>
      <TabsContent value="photos">
        <EventPhotos
          approvedPhotos={approvedPhotos}
          canManage={canManage}
          eventId={event.id}
          immichAlbumUrl={immichAlbumUrl}
          isMember={!!isMember}
          pendingPhotos={pendingPhotos}
        />
      </TabsContent>
    </Tabs>
  </>
) : null}
```

**Step 3: Ensure Tabs component exists in design system**

Check if Tabs is already available:
```bash
ls packages/design-system/components/ui/tabs*
```

If not, add it:
```bash
bun run ui:add tabs
```

**Step 4: Wire up Zero queries in the route**

Use `useQuery` from `@rocicorp/zero/react` to fetch event updates, photos, and album data. Pass them as props to EventDetail or use them directly in the child components.

**Step 5: Run type check and lint**

```bash
bun run check:types && bun run check
```

**Step 6: Commit**

```bash
git add apps/web/src/components/teams/events/event-detail.tsx apps/web/src/routes/_app/events/$id.tsx
git commit -m "feat(ui): add Updates and Photos tabs to event detail page"
```

---

### Task 12: Verify and fix lint/types

**Files:** All changed files

**Step 1: Run full checks**

```bash
bun run check:types
bun run check
bun run check:unused
```

**Step 2: Fix any issues**

```bash
bun run fix
```

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from event updates/photos feature"
```

---

### Task 13: Database migration

**Step 1: Generate migration**

```bash
bun run db:generate
```

**Step 2: Review generated migration**

Check `packages/db/src/migrations/` for the new migration file. Ensure it creates the 3 tables and enum correctly.

**Step 3: Push migration (if dev)**

```bash
bun run db:push
```

Or apply via migration runner depending on project setup.

**Step 4: Commit migration**

```bash
git add packages/db/src/migrations/
git commit -m "feat(db): add migration for eventUpdate, eventPhoto, eventImmichAlbum"
```
