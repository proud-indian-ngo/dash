import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";
import { restrictToAccessibleEvents } from "./team-event";

export const eventUpdateQueries = {
  /**
   * All pending updates the current user can review.
   * Admins with `event_updates.approve` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) => {
    if (isExternalUser(ctx)) {
      return zql.eventUpdate.where("id", "__never_match__");
    }
    if (ctx !== null && can(ctx, "event_updates.approve")) {
      return zql.eventUpdate
        .where("status", "pending")
        .related("author")
        .related("event")
        .orderBy("createdAt", "desc");
    }
    return zql.eventUpdate
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
      .orderBy("createdAt", "desc");
  }),
  approvedByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .where("status", "approved")
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
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
        .whereExists("event", (event) => restrictToAccessibleEvents(event, ctx))
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
      if (isExternalUser(ctx)) {
        return zql.eventUpdate
          .where("eventId", eventId)
          .where("status", "pending")
          .where("id", "__never_match__")
          .related("author")
          .orderBy("createdAt", "desc");
      }
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
