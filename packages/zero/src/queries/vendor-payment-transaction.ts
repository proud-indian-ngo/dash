import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.vendorPaymentTransaction) {
  return q
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user");
}

export const vendorPaymentTransactionQueries = {
  byVendorPayment: defineQuery(
    z.object({ vendorPaymentId: z.string() }),
    ({ args: { vendorPaymentId } }) =>
      withRelated(zql.vendorPaymentTransaction)
        .where("vendorPaymentId", vendorPaymentId)
        .orderBy("createdAt", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx != null && can(ctx, "requests.view_all")
      ? withRelated(zql.vendorPaymentTransaction).where("id", id).one()
      : withRelated(zql.vendorPaymentTransaction)
          .where("id", id)
          .where("userId", ctx?.userId)
          .one()
  ),
};
