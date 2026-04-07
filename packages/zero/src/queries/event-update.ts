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
