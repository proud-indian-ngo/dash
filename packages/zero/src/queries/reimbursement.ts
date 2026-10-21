import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

function withBase(q: typeof zql.reimbursement) {
  return (
    q
      .related("lineItems", (li) =>
        li.orderBy("sortOrder", "asc").related("category")
      )
      .related("attachments", (a) => a.orderBy("createdAt", "asc"))
      .related("history", (h) => h.orderBy("createdAt", "asc"))
      .related("user")
      // "Raised by X for Y" when finance raised it for someone else.
      .related("creator")
  );
}

function withRelated(q: typeof zql.reimbursement) {
  return withBase(q).related("event");
}

/**
 * Analytics, the tables and the request header show the programme the request
 * is charged to: the event's programme, or the one chosen without an event.
 */
function withProgramme(q: typeof zql.reimbursement) {
  return (
    withBase(q)
      // The programme's lead approves before finance ("Approval policy").
      .related("event", (e) => e.related("programme", (p) => p.related("lead")))
      .related("chargedProgramme", (p) => p.related("lead"))
      .related("leadApprover")
  );
}

/**
 * Without `requests.view_all`: your own requests, and those charged to a
 * programme you lead, which you approve before finance.
 */
function visibleTo(q: typeof zql.reimbursement, userId: string | undefined) {
  if (!userId) {
    return q.where("userId", "__never_match__");
  }
  return q.where(({ cmp, exists, or }) =>
    or(
      cmp("userId", userId),
      exists("chargedProgramme", (p) => p.where("leadUserId", userId)),
      exists("event", (e) =>
        e.whereExists("programme", (p) => p.where("leadUserId", userId))
      )
    )
  );
}

export const reimbursementQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withProgramme(zql.reimbursement).orderBy("createdAt", "desc")
      : withProgramme(visibleTo(zql.reimbursement, ctx?.userId)).orderBy(
          "createdAt",
          "desc"
        )
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.reimbursement)
      .where("userId", ctx?.userId)
      .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      const query = zql.reimbursement
        .where("eventId", eventId)
        .related("lineItems")
        .related("user")
        .orderBy("createdAt", "desc");
      return ctx !== null && can(ctx, "requests.view_all")
        ? query
        : query.where("userId", ctx?.userId);
    }
  ),
  byId: defineQuery(
    z.object({
      id: z.string(),
    }),
    ({ args: { id }, ctx }) =>
      ctx !== null && can(ctx, "requests.view_all")
        ? withProgramme(zql.reimbursement).where("id", id).one()
        : withProgramme(visibleTo(zql.reimbursement, ctx?.userId))
            .where("id", id)
            .one()
  ),
};
