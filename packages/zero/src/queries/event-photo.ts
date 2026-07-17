import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";
import { restrictToAccessibleEvents } from "./team-event";

export const eventPhotoQueries = {
  /**
   * All pending photos the current user can review.
   * Admins with `events.manage_photos` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) => {
    if (isExternalUser(ctx)) {
      return zql.eventPhoto.where("id", "__never_match__");
    }
    if (ctx !== null && can(ctx, "events.manage_photos")) {
      return zql.eventPhoto
        .where("status", "pending")
        .related("uploader")
        .related("event")
        .orderBy("createdAt", "desc");
    }
    return zql.eventPhoto
      .where("status", "pending")
      .where(({ exists }) =>
        exists("event", (e) =>
          e.whereExists("team", (t) =>
            t.whereExists("members", (m) =>
              m.where("userId", ctx?.userId).where("role", "lead")
            )
          )
        )
      )
      .related("uploader")
      .related("event")
      .orderBy("createdAt", "desc");
  }),
  approvedByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "approved")
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
  /** Current user's own pending photos. Auth-safe: uses ctx.userId. */
  myPendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "pending")
        .where("uploadedBy", ctx?.userId)
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .related("uploader")
        .orderBy("createdAt", "desc")
  ),
  /**
   * All pending photos for an event the current user can review.
   * Admins with `events.manage_photos` see all; team leads see only their
   * teams' events.
   */
  pendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      if (isExternalUser(ctx)) {
        return zql.eventPhoto
          .where("eventId", eventId)
          .where("status", "pending")
          .where("id", "__never_match__")
          .related("uploader")
          .orderBy("createdAt", "desc");
      }
      if (ctx !== null && can(ctx, "events.manage_photos")) {
        return zql.eventPhoto
          .where("eventId", eventId)
          .where("status", "pending")
          .related("uploader")
          .orderBy("createdAt", "desc");
      }

      if (ctx === null) {
        return zql.eventPhoto
          .where("eventId", eventId)
          .where("status", "pending")
          .where("id", "__never_match__")
          .related("uploader")
          .orderBy("createdAt", "desc");
      }

      return zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "pending")
        .where(({ exists }) =>
          exists("event", (e) =>
            e.whereExists("team", (t) =>
              t.whereExists("members", (m) =>
                m.where("userId", ctx.userId).where("role", "lead")
              )
            )
          )
        )
        .related("uploader")
        .orderBy("createdAt", "desc");
    }
  ),
};

export const eventImmichAlbumQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventImmichAlbum
        .where("eventId", eventId)
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .one()
  ),
};
