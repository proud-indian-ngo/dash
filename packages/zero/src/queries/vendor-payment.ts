import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

function withRelated(q: typeof zql.vendorPayment) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user")
    .related("vendor");
}

export const vendorPaymentQueries = {
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.vendorPayment)
      .where("userId", ctx?.userId ?? "")
      .orderBy("createdAt", "desc")
  ),
  byId: defineQuery(
    z.object({
      id: z.string(),
    }),
    ({ args: { id }, ctx }) =>
      ctx?.role === "admin"
        ? withRelated(zql.vendorPayment).where("id", id).one()
        : withRelated(zql.vendorPayment)
            .where("id", id)
            .where("userId", ctx?.userId ?? "")
            .one()
  ),
  all: defineQuery(({ ctx }) =>
    ctx?.role === "admin"
      ? withRelated(zql.vendorPayment).orderBy("createdAt", "desc")
      : withRelated(zql.vendorPayment)
          .where("userId", ctx?.userId ?? "")
          .orderBy("createdAt", "desc")
  ),
};
