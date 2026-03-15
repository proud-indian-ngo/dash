import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type { EventPhoto, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

// Opaque module name prevents Vite's import-analysis from resolving at dev time.
// S3Client only runs inside server-side async tasks, never on the client.
const _bun = "bun";
async function getS3Client(
  accountId: string,
  keyId: string,
  secretKey: string,
  bucket: string
) {
  const { S3Client } = await import(/* @vite-ignore */ _bun);
  return new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: keyId,
    secretAccessKey: secretKey,
    bucket,
  });
}

function pushImmichUploadTask(
  ctx: Context,
  meta: { mutator: string; [key: string]: unknown },
  photoId: string,
  eventId: string,
  eventName: string,
  r2Key: string
) {
  ctx.asyncTasks?.push({
    meta,
    fn: async () => {
      const { env } = await import("@pi-dash/env/server");
      const immichUrl = env.VITE_IMMICH_URL;
      const immichKey = env.IMMICH_API_KEY;
      if (!(immichUrl && immichKey)) {
        return;
      }

      const { db } = await import("@pi-dash/db");
      const { eventImmichAlbum } = await import(
        "@pi-dash/db/schema/event-photo"
      );
      const { eventPhoto } = await import("@pi-dash/db/schema/event-photo");
      const { eq: eqOp } = await import("drizzle-orm");

      // Check/create album for this event
      const existingAlbum = await db.query.eventImmichAlbum.findFirst({
        where: eqOp(eventImmichAlbum.eventId, eventId),
      });

      let albumId: string;
      if (existingAlbum) {
        albumId = existingAlbum.immichAlbumId;
      } else {
        const albumRes = await fetch(`${immichUrl}/api/albums`, {
          method: "POST",
          headers: {
            "x-api-key": immichKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ albumName: eventName }),
        });
        if (!albumRes.ok) {
          throw new Error(
            `Immich createAlbum failed: ${albumRes.status} ${await albumRes.text()}`
          );
        }
        const albumData = (await albumRes.json()) as { id: string };
        albumId = albumData.id;

        const inserted = await db
          .insert(eventImmichAlbum)
          .values({
            id: crypto.randomUUID(),
            eventId,
            immichAlbumId: albumId,
            createdAt: new Date(),
          })
          .onConflictDoNothing({ target: eventImmichAlbum.eventId })
          .returning({ immichAlbumId: eventImmichAlbum.immichAlbumId });

        if (inserted.length === 0) {
          const existing = await db.query.eventImmichAlbum.findFirst({
            where: eqOp(eventImmichAlbum.eventId, eventId),
          });
          if (existing) {
            albumId = existing.immichAlbumId;
          }
        }
      }

      // Download from R2
      const s3 = await getS3Client(
        env.R2_ACCOUNT_ID,
        env.R2_ACCESS_KEY,
        env.R2_SECRET_ACCESS_KEY,
        env.R2_BUCKET_NAME
      );
      const file = s3.file(r2Key);
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer]);

      // Upload to Immich
      const filename = r2Key.split("/").pop() ?? r2Key;
      const formData = new FormData();
      formData.append("assetData", blob, filename);
      formData.append("deviceAssetId", `pi-dash-${r2Key}`);
      formData.append("deviceId", "pi-dash");
      const nowIso = new Date().toISOString();
      formData.append("fileCreatedAt", nowIso);
      formData.append("fileModifiedAt", nowIso);

      const uploadRes = await fetch(`${immichUrl}/api/assets`, {
        method: "POST",
        headers: { "x-api-key": immichKey },
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error(
          `Immich upload failed: ${uploadRes.status} ${await uploadRes.text()}`
        );
      }
      const uploadData = (await uploadRes.json()) as { id: string };
      const assetId = uploadData.id;

      // Add to album
      const addRes = await fetch(`${immichUrl}/api/albums/${albumId}/assets`, {
        method: "PUT",
        headers: {
          "x-api-key": immichKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [assetId] }),
      });
      if (!addRes.ok) {
        throw new Error(
          `Immich addToAlbum failed: ${addRes.status} ${await addRes.text()}`
        );
      }

      // Update photo record: set Immich asset ID and clear R2 key
      await db
        .update(eventPhoto)
        .set({ immichAssetId: assetId, r2Key: null })
        .where(eqOp(eventPhoto.id, photoId));

      // Clean up R2 object — best-effort, don't throw
      try {
        await s3.delete(r2Key);
      } catch {
        // R2 object orphaned but photo still works via Immich
      }
    },
  });
}

function pushR2DeleteTask(
  ctx: Context,
  meta: { mutator: string; [key: string]: unknown },
  r2Key: string
) {
  ctx.asyncTasks?.push({
    meta,
    fn: async () => {
      const { env } = await import("@pi-dash/env/server");
      const s3 = await getS3Client(
        env.R2_ACCOUNT_ID,
        env.R2_ACCESS_KEY,
        env.R2_SECRET_ACCESS_KEY,
        env.R2_BUCKET_NAME
      );
      await s3.delete(r2Key);
    },
  });
}

function pushImmichDeleteTask(
  ctx: Context,
  meta: { mutator: string; [key: string]: unknown },
  immichAssetId: string
) {
  ctx.asyncTasks?.push({
    meta,
    fn: async () => {
      const { env } = await import("@pi-dash/env/server");
      const immichUrl = env.VITE_IMMICH_URL;
      const immichKey = env.IMMICH_API_KEY;
      if (!(immichUrl && immichKey)) {
        return;
      }

      const res = await fetch(`${immichUrl}/api/assets`, {
        method: "DELETE",
        headers: {
          "x-api-key": immichKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [immichAssetId], force: true }),
      });
      if (!res.ok) {
        throw new Error(
          `Immich deleteAsset failed: ${res.status} ${await res.text()}`
        );
      }
    },
  });
}

export const eventPhotoMutators = {
  upload: defineMutator(
    z
      .object({
        id: z.string(),
        eventId: z.string(),
        r2Key: z.string().optional(),
        immichAssetId: z.string().optional(),
        caption: z.string().optional(),
        now: z.number(),
      })
      .refine((d) => d.r2Key || d.immichAssetId, {
        message: "Either r2Key or immichAssetId must be provided",
      }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      if (event.startTime > args.now) {
        throw new Error("Cannot upload photos before event starts");
      }

      // Check admin/lead
      let isAdminOrLead = ctx.role === "admin";
      if (!isAdminOrLead) {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        isAdminOrLead = !!membership;
      }

      // If not admin/lead, check event membership
      if (!isAdminOrLead) {
        const member = (await tx.run(
          zql.teamEventMember
            .where("eventId", args.eventId)
            .where("userId", ctx.userId)
            .one()
        )) as TeamEventMember | undefined;
        if (!member) {
          throw new Error("Must be an event member to upload photos");
        }
      }

      const status = isAdminOrLead ? "approved" : "pending";

      await tx.mutate.eventPhoto.insert({
        id: args.id,
        eventId: args.eventId,
        r2Key: args.r2Key ?? null,
        immichAssetId: args.immichAssetId ?? null,
        caption: args.caption ?? null,
        status,
        uploadedBy: ctx.userId,
        reviewedBy: isAdminOrLead ? ctx.userId : null,
        reviewedAt: isAdminOrLead ? args.now : null,
        createdAt: args.now,
      });

      // Only push Immich upload task for R2-backed photos that are auto-approved
      if (
        status === "approved" &&
        args.r2Key &&
        !args.immichAssetId &&
        tx.location === "server"
      ) {
        pushImmichUploadTask(
          ctx,
          {
            mutator: "uploadEventPhoto",
            photoId: args.id,
            eventId: args.eventId,
            r2Key: args.r2Key,
            eventName: event.name,
            status,
          },
          args.id,
          args.eventId,
          event.name,
          args.r2Key
        );
      }
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(zql.eventPhoto.where("id", args.id).one())) as
        | EventPhoto
        | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }
      if (photo.status !== "pending") {
        throw new Error("Photo is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

      await tx.mutate.eventPhoto.update({
        id: args.id,
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server" && photo.r2Key) {
        pushImmichUploadTask(
          ctx,
          {
            mutator: "approveEventPhoto",
            photoId: args.id,
            eventId: photo.eventId,
            r2Key: photo.r2Key,
            eventName: event.name,
          },
          args.id,
          photo.eventId,
          event.name,
          photo.r2Key
        );
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(zql.eventPhoto.where("id", args.id).one())) as
        | EventPhoto
        | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }
      if (photo.status !== "pending") {
        throw new Error("Photo is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

      await tx.mutate.eventPhoto.update({
        id: args.id,
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server" && photo.r2Key) {
        pushR2DeleteTask(
          ctx,
          {
            mutator: "rejectEventPhoto",
            photoId: args.id,
            eventId: photo.eventId,
            r2Key: photo.r2Key,
          },
          photo.r2Key
        );
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(zql.eventPhoto.where("id", args.id).one())) as
        | EventPhoto
        | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

      await tx.mutate.eventPhoto.delete({ id: args.id });

      if (tx.location === "server") {
        const taskMeta = {
          mutator: "deleteEventPhoto",
          photoId: args.id,
          eventId: photo.eventId,
          r2Key: photo.r2Key,
          immichAssetId: photo.immichAssetId,
        };

        if (photo.r2Key) {
          pushR2DeleteTask(ctx, taskMeta, photo.r2Key);
        }

        if (photo.immichAssetId) {
          pushImmichDeleteTask(ctx, taskMeta, photo.immichAssetId);
        }
      }
    }
  ),
};
