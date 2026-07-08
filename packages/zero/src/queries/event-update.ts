import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

export const eventUpdateQueries = {
  /**
   * All pending updates the current user can review.
   * Admins with `event_updates.approve` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "event_updates.approve")
      ? zql.eventUpdate
          .where("status", "pending")
          .related("author")
          .related("event")
          .orderBy("createdAt", "desc")
      : zql.eventUpdate
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
          .related("author")
          .related("event")
          .orderBy("createdAt", "desc")
  ),
  approvedByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .where("status", "approved")
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  /** Current user's own pending updates. Auth-safe: uses ctx.userId. */
  myPendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .where("status", "pending")
        .where("createdBy", ctx?.userId)
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  /**
   * All pending updates for an event the current user can review.
   * Admins with `event_updates.approve` see all; team leads see only their
   * teams' events.
   */
  pendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      if (ctx !== null && can(ctx, "event_updates.approve")) {
        return zql.eventUpdate
          .where("eventId", eventId)
          .where("status", "pending")
          .related("author")
          .orderBy("createdAt", "desc");
      }

      if (ctx === null) {
        return zql.eventUpdate
          .where("eventId", eventId)
          .where("status", "pending")
          .where("id", "__never_match__")
          .related("author")
          .orderBy("createdAt", "desc");
      }

      return zql.eventUpdate
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
        .related("author")
        .orderBy("createdAt", "desc");
    }
  ),
};
