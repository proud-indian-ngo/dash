import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

function withBase(q: typeof zql.reimbursement) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user");
}

function withRelated(q: typeof zql.reimbursement) {
  return withBase(q).related("event");
}

/** Analytics groups spend by the event's programme, so the list projection nests it. */
function withProgramme(q: typeof zql.reimbursement) {
  return withBase(q).related("event", (e) => e.related("programme"));
}

export const reimbursementQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withProgramme(zql.reimbursement).orderBy("createdAt", "desc")
      : withProgramme(zql.reimbursement)
          .where("userId", ctx?.userId)
          .orderBy("createdAt", "desc")
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
        ? withRelated(zql.reimbursement).where("id", id).one()
        : withRelated(zql.reimbursement)
            .where("id", id)
            .where("userId", ctx?.userId)
            .one()
  ),
};
