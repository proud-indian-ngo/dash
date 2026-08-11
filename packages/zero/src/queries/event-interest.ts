import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";
import { restrictToAccessibleEvents } from "./team-event";

export const eventInterestQueries = {
  /**
   * All pending interest requests the current user can review.
   * Admins with `events.manage_interest` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) => {
    if (isExternalUser(ctx)) {
      return zql.eventInterest.where("id", "__never_match__");
    }
    if (ctx !== null && can(ctx, "events.manage_interest")) {
      return zql.eventInterest
        .where("status", "pending")
        .related("user")
        .related("event")
        .orderBy("createdAt", "desc");
    }
    return zql.eventInterest
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
      .orderBy("createdAt", "desc");
  }),
  byCurrentUser: defineQuery(({ ctx }) =>
    zql.eventInterest
      .where("userId", ctx?.userId)
      .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
      .related("event")
  ),
  managerByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      if (isExternalUser(ctx)) {
        return zql.eventInterest
          .where("eventId", eventId)
          .where("id", "__never_match__")
          .related("user")
          .orderBy("createdAt", "desc");
      }
      if (ctx !== null && can(ctx, "events.manage_interest")) {
        return zql.eventInterest
          .where("eventId", eventId)
          .related("user")
          .orderBy("createdAt", "desc");
      }

      if (ctx === null) {
        return zql.eventInterest
          .where("eventId", eventId)
          .where("id", "__never_match__")
          .related("user")
          .orderBy("createdAt", "desc");
      }

      return zql.eventInterest
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
        .related("user")
        .orderBy("createdAt", "desc");
    }
  ),
  myByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventInterest
        .where("eventId", eventId)
        .where("userId", ctx?.userId)
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .related("event")
  ),
};
