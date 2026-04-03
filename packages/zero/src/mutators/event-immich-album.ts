import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
} from "../permissions";
import type { EventImmichAlbum, EventPhoto, TeamEvent } from "../schema";
import { zql } from "../schema";

const MUTATOR_NAME = "eventImmichAlbum.deleteAlbum";

export const eventImmichAlbumMutators = {
  deleteAlbum: defineMutator(
    z.object({ eventId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const album = (await tx.run(
        zql.eventImmichAlbum.where("eventId", args.eventId).one()
      )) as EventImmichAlbum | undefined;
      if (!album) {
        throw new Error("No album found for this event");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
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

      // Collect all photos for cleanup job enqueuing
      const photos = (await tx.run(
        zql.eventPhoto.where("eventId", args.eventId)
      )) as EventPhoto[];

      // Delete all photo records
      for (const photo of photos) {
        await tx.mutate.eventPhoto.delete({ id: photo.id });
      }

      // Delete the album record
      await tx.mutate.eventImmichAlbum.delete({ id: album.id });

      // Enqueue async cleanup jobs on the server
      if (tx.location === "server") {
        for (const photo of photos) {
          if (photo.r2Key) {
            const r2Key = photo.r2Key;
            ctx.asyncTasks?.push({
              meta: { mutator: MUTATOR_NAME, photoId: photo.id },
              fn: async () => {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");
                await enqueue("delete-r2-object", { r2Key });
              },
            });
          }

          if (photo.immichAssetId) {
            const immichAssetId = photo.immichAssetId;
            ctx.asyncTasks?.push({
              meta: { mutator: MUTATOR_NAME, photoId: photo.id },
              fn: async () => {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");
                await enqueue("immich-delete-asset", { immichAssetId });
              },
            });
          }
        }

        const immichAlbumId = album.immichAlbumId;
        ctx.asyncTasks?.push({
          meta: { mutator: MUTATOR_NAME, albumId: album.id },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("immich-delete-album", { immichAlbumId });
          },
        });
      }
    }
  ),
};
