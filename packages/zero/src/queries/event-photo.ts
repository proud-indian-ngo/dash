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
  /**
   * All pending photos for an event — no query-level auth gating.
   * Team leads are checked via team membership at the mutator level, which
   * ZQL cannot replicate in a where clause. Use `enabled` flag on the client
   * to restrict subscription to managers/leads only.
   */
  pendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventPhoto
        .where("eventId", eventId)
        .where("status", "pending")
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
