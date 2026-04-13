import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
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
  approvedByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .where("status", "approved")
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  /**
   * All pending updates for an event — no query-level auth gating.
   * Team leads are checked via team membership at the mutator level, which
   * ZQL cannot replicate in a where clause. Use `enabled` flag on the client
   * to restrict subscription to approvers/leads only.
   */
  pendingByEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId } }) =>
      zql.eventUpdate
        .where("eventId", eventId)
        .where("status", "pending")
        .related("author")
        .orderBy("createdAt", "desc")
  ),
  /**
   * All pending updates the current user can review.
   * Admins with `event_updates.approve` see all; team leads see only their teams' events.
   */
  allPending: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "event_updates.approve")
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
};
