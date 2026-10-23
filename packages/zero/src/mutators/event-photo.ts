import type { db } from "@pi-dash/db";
import { EVENT_PHOTO_CAPTION_MAX_LENGTH } from "@pi-dash/shared/social-recap";
import { defineMutator } from "@rocicorp/zero";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import z from "zod";

import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventPhoto, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";
import { assertEventRowNotManagedByKalakriti } from "./kalakriti-event-guard";
import {
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
  enqueueDeleteR2Object,
} from "./submission-helpers";

async function getSerializedPhotoCleanup(
  tx: { dbTransaction?: { wrappedTransaction: unknown } },
  photoId: string
) {
  const wrapped = tx.dbTransaction?.wrappedTransaction;
  if (!wrapped) {
    throw new Error("Server transaction is unavailable");
  }

  const [{ eventPhoto }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/event-photo"),
    import("drizzle-orm"),
  ]);
  const [photo] = await (wrapped as DrizzleTransaction<typeof db>)
    .select({
      immichAssetId: eventPhoto.immichAssetId,
      r2Key: eventPhoto.r2Key,
    })
    .from(eventPhoto)
    .where(eq(eventPhoto.id, photoId))
    .for("update");
  return photo;
}

export const eventPhotoUploadSchema = z
  .object({
    caption: z.string().trim().max(EVENT_PHOTO_CAPTION_MAX_LENGTH).optional(),
    eventId: z.string(),
    id: z.string(),
    immichAssetId: z.string().min(1).max(256).optional(),
    immichUploadReceipt: z.string().min(1).max(96).optional(),
    mimeType: z.string().min(1).max(128).optional(),
    now: z.number(),
    r2Key: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const isR2 = !!data.r2Key;
    const isImmich = !!(
      data.immichAssetId &&
      data.immichUploadReceipt &&
      data.mimeType
    );
    const hasAnyImmichField = !!(
      data.immichAssetId || data.immichUploadReceipt
    );
    const hasValidR2Source = isR2 && !hasAnyImmichField;
    const hasValidImmichSource = !isR2 && isImmich;
    if (!(hasValidR2Source || hasValidImmichSource)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide exactly r2Key or immichAssetId with immichUploadReceipt and mimeType",
      });
    }
  });

export const eventPhotoMutators = {
  approve: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
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
      assertEventRowNotManagedByKalakriti(event);

      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_photos", isTeamLead);

      await tx.mutate.eventPhoto.update({
        id: args.id,
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "approved",
      });

      if (tx.location === "server") {
        if (photo.r2Key) {
          const { r2Key } = photo;
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "immich-sync-photo",
                {
                  eventId: photo.eventId,
                  eventName: event.name,
                  photoId: args.id,
                  r2Key,
                },
                {
                  singletonKey: args.id,
                  traceId: ctx.traceId,
                }
              );
            },
            meta: { mutator: "approveEventPhoto", photoId: args.id },
          });
        }

        if (photo.uploadedBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-photo-approved",
                {
                  eventId: photo.eventId,
                  eventName: event.name,
                  photoId: args.id,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                  traceId: ctx.traceId,
                }
              );
            },
            meta: {
              eventId: photo.eventId,
              mutator: "approveEventPhoto",
              photoId: args.id,
              uploadedBy: photo.uploadedBy,
            },
          });
        }
      }
    }
  ),

  approveBatch: defineMutator(
    z.object({ ids: z.array(z.string()), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      await Promise.all(
        args.ids.map(async (id) => {
          const photo = (await tx.run(zql.eventPhoto.where("id", id).one())) as
            | EventPhoto
            | undefined;
          if (!photo) {
            return;
          }
          if (photo.status !== "pending") {
            return;
          }

          const event = (await tx.run(
            zql.teamEvent.where("id", photo.eventId).one()
          )) as TeamEvent | undefined;
          if (!event) {
            return;
          }
          assertEventRowNotManagedByKalakriti(event);

          const isTeamLead = !!(await tx.run(
            zql.teamMember
              .where("teamId", event.teamId)
              .where("userId", ctx.userId)
              .where("role", "lead")
              .one()
          ));
          assertHasPermissionOrTeamLead(
            ctx,
            "events.manage_photos",
            isTeamLead
          );

          await tx.mutate.eventPhoto.update({
            id,
            reviewedAt: args.now,
            reviewedBy: ctx.userId,
            status: "approved",
          });

          if (tx.location === "server") {
            if (photo.r2Key) {
              const { r2Key } = photo;
              const { eventId } = photo;
              const eventName = event.name;
              ctx.asyncTasks?.push({
                fn: async () => {
                  const { enqueue } = await import("@pi-dash/jobs/enqueue");
                  await enqueue(
                    "immich-sync-photo",
                    {
                      eventId,
                      eventName,
                      photoId: id,
                      r2Key,
                    },
                    {
                      singletonKey: id,
                      traceId: ctx.traceId,
                    }
                  );
                },
                meta: { mutator: "approveEventPhotoBatch", photoId: id },
              });
            }

            if (photo.uploadedBy !== ctx.userId) {
              ctx.asyncTasks?.push({
                fn: async () => {
                  const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                    await import("@pi-dash/jobs/enqueue");
                  await enqueue(
                    "notify-photo-approved",
                    {
                      eventId: photo.eventId,
                      eventName: event.name,
                      photoId: id,
                      uploaderId: photo.uploadedBy,
                    },
                    {
                      startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                      traceId: ctx.traceId,
                    }
                  );
                },
                meta: {
                  eventId: photo.eventId,
                  mutator: "approveEventPhotoBatch",
                  photoId: id,
                  uploadedBy: photo.uploadedBy,
                },
              });
            }
          }
        })
      );
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      assertEventRowNotManagedByKalakriti(event);

      // Allow uploader to delete their own pending photos
      const isOwnPending =
        photo.uploadedBy === ctx.userId && photo.status === "pending";

      if (!isOwnPending) {
        const isTeamLead = !!(await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        ));
        assertHasPermissionOrTeamLead(ctx, "events.manage_photos", isTeamLead);
      }

      const cleanupPhoto =
        tx.location === "server"
          ? await getSerializedPhotoCleanup(tx, args.id)
          : photo;
      if (!cleanupPhoto) {
        throw new Error("Photo not found");
      }

      await tx.mutate.eventPhoto.delete({ id: args.id });

      if (tx.location === "server") {
        if (cleanupPhoto.r2Key) {
          enqueueDeleteR2Object(ctx, tx.location, cleanupPhoto.r2Key, {
            keyPrefixes: [`photos/${photo.eventId}/`],
            meta: { mutator: "deleteEventPhoto", photoId: args.id },
          });
        }

        if (cleanupPhoto.immichAssetId) {
          const { immichAssetId } = cleanupPhoto;
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "immich-delete-asset",
                { immichAssetId },
                { traceId: ctx.traceId }
              );
            },
            meta: { mutator: "deleteEventPhoto", photoId: args.id },
          });
        }
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
      assertEventRowNotManagedByKalakriti(event);

      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_photos", isTeamLead);

      await tx.mutate.eventPhoto.update({
        id: args.id,
        r2Key: null,
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "rejected",
      });

      if (tx.location === "server") {
        if (photo.r2Key) {
          enqueueDeleteR2Object(ctx, tx.location, photo.r2Key, {
            keyPrefixes: [`photos/${photo.eventId}/`],
            meta: { mutator: "rejectEventPhoto", photoId: args.id },
          });
        }

        if (photo.uploadedBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-photo-rejected",
                {
                  eventId: photo.eventId,
                  eventName: event.name,
                  photoId: args.id,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                  traceId: ctx.traceId,
                }
              );
            },
            meta: {
              eventId: photo.eventId,
              mutator: "rejectEventPhoto",
              photoId: args.id,
              uploadedBy: photo.uploadedBy,
            },
          });
        }
      }
    }
  ),
  /**
   * Set or clear a caption. Whoever may delete the photo may caption it: the
   * uploader while it is pending, otherwise a lead or `events.manage_photos`.
   */
  setCaption: defineMutator(
    z.object({
      caption: z.string().trim().max(EVENT_PHOTO_CAPTION_MAX_LENGTH),
      id: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }
      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      assertEventRowNotManagedByKalakriti(event);
      const isOwnPending =
        photo.uploadedBy === ctx.userId && photo.status === "pending";
      if (!isOwnPending) {
        const isTeamLead = !!(await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        ));
        assertHasPermissionOrTeamLead(ctx, "events.manage_photos", isTeamLead);
      }
      await tx.mutate.eventPhoto.update({
        caption: args.caption || null,
        id: args.id,
      });
    }
  ),

  /**
   * Keep an approved photo out of social posts. The social API still lists it
   * with `doNotUse: true`; the generator skips it.
   */
  setDoNotUse: defineMutator(
    z.object({ doNotUse: z.boolean(), id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const photo = (await tx.run(
        zql.eventPhoto.where("id", args.id).one()
      )) as EventPhoto | undefined;
      if (!photo) {
        throw new Error("Photo not found");
      }
      if (photo.status !== "approved") {
        throw new Error("Only approved photos can be marked");
      }
      const event = (await tx.run(
        zql.teamEvent.where("id", photo.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      assertEventRowNotManagedByKalakriti(event);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      // The toggle lives in the lead's social recap (attendance gate) and is
      // also a photo-moderation decision.
      if (!can(ctx, "events.manage_photos")) {
        assertHasPermissionOrTeamLead(
          ctx,
          "events.manage_attendance",
          isTeamLead
        );
      }
      await tx.mutate.eventPhoto.update({
        doNotUse: args.doNotUse,
        id: args.id,
      });
    }
  ),

  upload: defineMutator(eventPhotoUploadSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);

    const event = (await tx.run(
      zql.teamEvent.where("id", args.eventId).one()
    )) as TeamEvent | undefined;
    if (!event) {
      throw new Error("Event not found");
    }
    assertEventRowNotManagedByKalakriti(event);

    const now = tx.location === "server" ? Date.now() : args.now;
    if (event.startTime > now) {
      throw new Error("Cannot upload photos before event starts");
    }

    // Check permission or team lead
    const isTeamLead = !!(await tx.run(
      zql.teamMember
        .where("teamId", event.teamId)
        .where("userId", ctx.userId)
        .where("role", "lead")
        .one()
    ));
    const isAdminOrLead = can(ctx, "events.manage_photos") || isTeamLead;

    if (args.immichAssetId) {
      const { immichUploadReceipt, mimeType } = args;
      if (!(immichUploadReceipt && mimeType)) {
        throw new Error("Immich uploads require a receipt and MIME type");
      }
      assertHasPermissionOrTeamLead(ctx, "events.manage_photos", isTeamLead);
      if (
        tx.location === "server" &&
        !ctx.verifyImmichUploadReceipt?.({
          assetId: args.immichAssetId,
          eventId: args.eventId,
          mimeType,
          photoId: args.id,
          receipt: immichUploadReceipt,
          userId: ctx.userId,
        })
      ) {
        throw new Error("Invalid or expired Immich upload receipt");
      }
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
    const r2Key = args.r2Key
      ? claimUploadedR2ObjectKey(
          args.r2Key,
          createR2ClaimOptions(ctx, tx.location, {
            durablePrefix: args.eventId,
            mimeType: args.mimeType,
            subfolder: "photos",
          })
        )
      : undefined;

    await tx.mutate.eventPhoto.insert({
      caption: args.caption,
      createdAt: args.now,
      eventId: args.eventId,
      id: args.id,
      immichAssetId: args.immichAssetId,
      mimeType: args.mimeType,
      r2Key,
      reviewedAt: isAdminOrLead ? args.now : null,
      reviewedBy: isAdminOrLead ? ctx.userId : null,
      status,
      uploadedBy: ctx.userId,
    });

    // Enqueue Immich sync for R2-backed photos that are auto-approved
    if (
      status === "approved" &&
      r2Key &&
      !args.immichAssetId &&
      tx.location === "server"
    ) {
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "immich-sync-photo",
            {
              eventId: args.eventId,
              eventName: event.name,
              photoId: args.id,
              r2Key,
            },
            {
              singletonKey: args.id,
              traceId: ctx.traceId,
            }
          );
        },
        meta: { mutator: "uploadEventPhoto", photoId: args.id },
      });
    }
  }),
};
