import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

export const eventFeedbackQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      if (ctx !== null && can(ctx, "events.manage_feedback")) {
        return zql.eventFeedback
          .where("eventId", eventId)
          .orderBy("createdAt", "desc");
      }

      if (ctx === null) {
        // Participants fetch their own feedback via getMyEventFeedback.
        return zql.eventFeedback
          .where("eventId", eventId)
          .where("id", "__never_match__")
          .orderBy("createdAt", "desc");
      }

      return zql.eventFeedback
        .where("eventId", eventId)
        .where(({ exists }) =>
          exists("event", (e) =>
            e.whereExists("team", (t) =>
              t.whereExists("members", (m) =>
                m.where("userId", ctx.userId).where("role", "lead")
              )
            )
          )
        )
        .orderBy("createdAt", "desc");
    }
  ),
};
