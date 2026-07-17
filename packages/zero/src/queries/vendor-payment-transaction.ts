import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.vendorPaymentTransaction) {
  return q
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user");
}

export const vendorPaymentTransactionQueries = {
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withRelated(zql.vendorPaymentTransaction).where("id", id).one()
      : withRelated(zql.vendorPaymentTransaction)
          .where("id", id)
          .where("userId", ctx?.userId)
          .one()
  ),
  byVendorPayment: defineQuery(
    z.object({ vendorPaymentId: z.string() }),
    ({ args: { vendorPaymentId }, ctx }) => {
      const query = withRelated(zql.vendorPaymentTransaction).orderBy(
        "createdAt",
        "desc"
      );
      return isExternalUser(ctx)
        ? query.where("id", "__never_match__")
        : query.where("vendorPaymentId", vendorPaymentId);
    }
  ),
};
