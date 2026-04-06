import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.reimbursement) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user")
    .related("event");
}

export const reimbursementQueries = {
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) =>
      ctx != null && can(ctx, "requests.view_all")
        ? withRelated(zql.reimbursement)
            .where("eventId", eventId)
            .orderBy("createdAt", "desc")
        : withRelated(zql.reimbursement)
            .where("eventId", eventId)
            .where("userId", ctx?.userId)
            .orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.reimbursement)
      .where("userId", ctx?.userId)
      .orderBy("createdAt", "desc")
  ),
  byId: defineQuery(
    z.object({
      id: z.string(),
    }),
    ({ args: { id }, ctx }) =>
      ctx != null && can(ctx, "requests.view_all")
        ? withRelated(zql.reimbursement).where("id", id).one()
        : withRelated(zql.reimbursement)
            .where("id", id)
            .where("userId", ctx?.userId)
            .one()
  ),
  all: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "requests.view_all")
      ? withRelated(zql.reimbursement).orderBy("createdAt", "desc")
      : withRelated(zql.reimbursement)
          .where("userId", ctx?.userId)
          .orderBy("createdAt", "desc")
  ),
};
