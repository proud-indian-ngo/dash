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
