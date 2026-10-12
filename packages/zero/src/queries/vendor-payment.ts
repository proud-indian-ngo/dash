import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

function withBase(q: typeof zql.vendorPayment) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user")
    .related("vendor")
    .related("invoiceReviewer")
    .related("transactions", (t) =>
      t
        .orderBy("createdAt", "desc")
        .related("user")
        .related("attachments", (a) => a.orderBy("createdAt", "asc"))
        .related("history", (h) => h.orderBy("createdAt", "asc"))
    );
}

function withRelated(q: typeof zql.vendorPayment) {
  return withBase(q).related("event");
}

/** Analytics groups spend by the event's programme, so the list projection nests it. */
function withProgramme(q: typeof zql.vendorPayment) {
  return withBase(q).related("event", (e) => e.related("programme"));
}

export const vendorPaymentQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withProgramme(zql.vendorPayment).orderBy("createdAt", "desc")
      : withProgramme(zql.vendorPayment)
          .where("userId", ctx?.userId)
          .orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.vendorPayment)
      .where("userId", ctx?.userId)
      .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      const query = zql.vendorPayment
        .where("eventId", eventId)
        .related("lineItems")
        .related("user")
        .related("vendor")
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
        ? withRelated(zql.vendorPayment).where("id", id).one()
        : withRelated(zql.vendorPayment)
            .where("id", id)
            .where("userId", ctx?.userId)
            .one()
  ),
};
