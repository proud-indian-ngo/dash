import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventPhoto, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

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

      // Enqueue Immich sync for R2-backed photos that are auto-approved
      if (
        status === "approved" &&
        args.r2Key &&
        !args.immichAssetId &&
        tx.location === "server"
      ) {
        const r2Key = args.r2Key;
        ctx.asyncTasks?.push({
          meta: { mutator: "uploadEventPhoto", photoId: args.id },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "immich-sync-photo",
              {
                photoId: args.id,
                eventId: args.eventId,
                eventName: event.name,
                r2Key,
              },
              { singletonKey: args.id }
            );
          },
        });
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
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server") {
        if (photo.r2Key) {
          const r2Key = photo.r2Key;
          ctx.asyncTasks?.push({
            meta: { mutator: "approveEventPhoto", photoId: args.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "immich-sync-photo",
                {
                  photoId: args.id,
                  eventId: photo.eventId,
                  eventName: event.name,
                  r2Key,
                },
                { singletonKey: args.id }
              );
            },
          });
        }

        if (photo.uploadedBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveEventPhoto",
              photoId: args.id,
              eventId: photo.eventId,
              uploadedBy: photo.uploadedBy,
            },
            fn: async () => {
              const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-photo-approved",
                {
                  photoId: args.id,
                  eventId: photo.eventId,
                  eventName: event.name,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                }
              );
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

      for (const id of args.ids) {
        const photo = (await tx.run(zql.eventPhoto.where("id", id).one())) as
          | EventPhoto
          | undefined;
        if (!photo) {
          continue;
        }
        if (photo.status !== "pending") {
          continue;
        }

        const event = (await tx.run(
          zql.teamEvent.where("id", photo.eventId).one()
        )) as TeamEvent | undefined;
        if (!event) {
          continue;
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
          id,
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: args.now,
        });

        if (tx.location === "server") {
          if (photo.r2Key) {
            const r2Key = photo.r2Key;
            const eventId = photo.eventId;
            const eventName = event.name;
            ctx.asyncTasks?.push({
              meta: { mutator: "approveEventPhotoBatch", photoId: id },
              fn: async () => {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");
                await enqueue(
                  "immich-sync-photo",
                  {
                    photoId: id,
                    eventId,
                    eventName,
                    r2Key,
                  },
                  { singletonKey: id }
                );
              },
            });
          }

          if (photo.uploadedBy !== ctx.userId) {
            ctx.asyncTasks?.push({
              meta: {
                mutator: "approveEventPhotoBatch",
                photoId: id,
                eventId: photo.eventId,
                uploadedBy: photo.uploadedBy,
              },
              fn: async () => {
                const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                  await import("@pi-dash/jobs/enqueue");
                await enqueue(
                  "notify-photo-approved",
                  {
                    photoId: id,
                    eventId: photo.eventId,
                    eventName: event.name,
                    uploaderId: photo.uploadedBy,
                  },
                  {
                    startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                  }
                );
              },
            });
          }
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
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server") {
        if (photo.r2Key) {
          const r2Key = photo.r2Key;
          ctx.asyncTasks?.push({
            meta: { mutator: "rejectEventPhoto", photoId: args.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue("delete-r2-object", { r2Key });
            },
          });
        }

        if (photo.uploadedBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "rejectEventPhoto",
              photoId: args.id,
              eventId: photo.eventId,
              uploadedBy: photo.uploadedBy,
            },
            fn: async () => {
              const { enqueue, PHOTO_NOTIFICATION_DELAY_SECONDS } =
                await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-photo-rejected",
                {
                  photoId: args.id,
                  eventId: photo.eventId,
                  eventName: event.name,
                  uploaderId: photo.uploadedBy,
                },
                {
                  startAfter: `${PHOTO_NOTIFICATION_DELAY_SECONDS} seconds`,
                }
              );
            },
          });
        }
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
          const r2Key = photo.r2Key;
          ctx.asyncTasks?.push({
            meta: { mutator: "deleteEventPhoto", photoId: args.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue("delete-r2-object", { r2Key });
            },
          });
        }

        if (photo.immichAssetId) {
          const immichAssetId = photo.immichAssetId;
          ctx.asyncTasks?.push({
            meta: { mutator: "deleteEventPhoto", photoId: args.id },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue("immich-delete-asset", { immichAssetId });
            },
          });
        }
      }
    }
  ),
};
