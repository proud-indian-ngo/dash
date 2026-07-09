import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import { requireEnqueue } from "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventPhoto, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";
import { claimUploadedR2ObjectKey } from "./submission-helpers";

export const eventPhotoMutators = {
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
              const enqueue = requireEnqueue(ctx);
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
              const enqueue = requireEnqueue(ctx);
              const photoNotificationDelaySeconds =
                ctx.photoNotificationDelaySeconds ?? 120;
              await enqueue(
                "notify-photo-approved",
                {
                  eventId: photo.eventId,
                  eventName: event.name,
                  photoId: args.id,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${photoNotificationDelaySeconds} seconds`,
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
                  const enqueue = requireEnqueue(ctx);
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
                  const enqueue = requireEnqueue(ctx);
                  const photoNotificationDelaySeconds =
                    ctx.photoNotificationDelaySeconds ?? 120;
                  await enqueue(
                    "notify-photo-approved",
                    {
                      eventId: photo.eventId,
                      eventName: event.name,
                      photoId: id,
                      uploaderId: photo.uploadedBy,
                    },
                    {
                      startAfter: `${photoNotificationDelaySeconds} seconds`,
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

      await tx.mutate.eventPhoto.delete({ id: args.id });

      if (tx.location === "server") {
        if (photo.r2Key) {
          const { r2Key } = photo;
          ctx.asyncTasks?.push({
            fn: async () => {
              const enqueue = requireEnqueue(ctx);
              await enqueue(
                "delete-r2-object",
                { r2Key },
                { traceId: ctx.traceId }
              );
            },
            meta: { mutator: "deleteEventPhoto", photoId: args.id },
          });
        }

        if (photo.immichAssetId) {
          const { immichAssetId } = photo;
          ctx.asyncTasks?.push({
            fn: async () => {
              const enqueue = requireEnqueue(ctx);
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
        status: "rejected",
      });

      if (tx.location === "server") {
        if (photo.r2Key) {
          const { r2Key } = photo;
          ctx.asyncTasks?.push({
            fn: async () => {
              const enqueue = requireEnqueue(ctx);
              await enqueue(
                "delete-r2-object",
                { r2Key },
                { traceId: ctx.traceId }
              );
            },
            meta: { mutator: "rejectEventPhoto", photoId: args.id },
          });
        }

        if (photo.uploadedBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const enqueue = requireEnqueue(ctx);
              const photoNotificationDelaySeconds =
                ctx.photoNotificationDelaySeconds ?? 120;
              await enqueue(
                "notify-photo-rejected",
                {
                  eventId: photo.eventId,
                  eventName: event.name,
                  photoId: args.id,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${photoNotificationDelaySeconds} seconds`,
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
  upload: defineMutator(
    z
      .object({
        caption: z.string().optional(),
        eventId: z.string(),
        id: z.string(),
        immichAssetId: z.string().optional(),
        mimeType: z.string().optional(),
        now: z.number(),
        r2Key: z.string().optional(),
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

      // Check permission or team lead
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      const isAdminOrLead = can(ctx, "events.manage_photos") || isTeamLead;

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
        ? await claimUploadedR2ObjectKey(args.r2Key, {
            asyncTasks: ctx.asyncTasks,
            durablePrefix: args.eventId,
            mimeType: args.mimeType,
            moveR2Object: ctx.moveR2Object,
            r2KeyPrefix: ctx.r2KeyPrefix,
            subfolder: "photos",
            traceId: ctx.traceId,
            txLocation: tx.location,
            userId: ctx.userId,
          })
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
            const enqueue = requireEnqueue(ctx);
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
    }
  ),
};
