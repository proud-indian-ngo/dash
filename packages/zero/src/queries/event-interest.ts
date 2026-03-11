import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const eventInterestQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventInterest
        .where("eventId", eventId)
        .related("user")
        .orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    zql.eventInterest.where("userId", ctx?.userId ?? "").related("event")
  ),
};
