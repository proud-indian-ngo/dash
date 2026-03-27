import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

export const eventFeedbackQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      ctx != null && can(ctx, "events.manage_feedback")
        ? zql.eventFeedback
            .where("eventId", eventId)
            .orderBy("createdAt", "desc")
        : // Non-admin: return empty. Participants fetch their own feedback
          // via the getMyEventFeedback server function to preserve anonymity.
          zql.eventFeedback
            .where("eventId", eventId)
            .where("id", "__never_match__")
            .orderBy("createdAt", "desc")
  ),
};
