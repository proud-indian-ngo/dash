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
