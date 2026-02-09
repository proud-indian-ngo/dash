import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

function withRelated(q: typeof zql.advancePayment) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user");
}

export const advancePaymentQueries = {
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.advancePayment)
      .where("userId", ctx?.userId ?? "")
      .orderBy("createdAt", "desc")
  ),
  byId: defineQuery(
    z.object({
      id: z.string(),
    }),
    ({ args: { id }, ctx }) =>
      ctx?.role === "admin"
        ? withRelated(zql.advancePayment).where("id", id).one()
        : withRelated(zql.advancePayment)
            .where("id", id)
            .where("userId", ctx?.userId ?? "")
            .one()
  ),
  all: defineQuery(({ ctx }) =>
    ctx?.role === "admin"
      ? withRelated(zql.advancePayment).orderBy("createdAt", "desc")
      : withRelated(zql.advancePayment)
          .where("userId", ctx?.userId ?? "")
          .orderBy("createdAt", "desc")
  ),
};
