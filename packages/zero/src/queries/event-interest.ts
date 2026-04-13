import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
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
  /**
   * All pending interest requests the current user can review.
   * Admins with `events.manage_interest` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "events.manage_interest")
      ? zql.eventInterest
          .where("status", "pending")
          .related("user")
          .related("event")
          .orderBy("createdAt", "desc")
      : zql.eventInterest
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
          .related("user")
          .related("event")
          .orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    zql.eventInterest.where("userId", ctx?.userId).related("event")
  ),
};
