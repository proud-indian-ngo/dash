import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";

export const vendorQueries = {
  all: defineQuery(({ ctx }) => {
    if (isExternalUser(ctx)) {
      return zql.vendor.where("id", "__never_match__");
    }
    return ctx !== null && can(ctx, "vendors.view_all")
      ? zql.vendor.orderBy("name", "asc")
      : zql.vendor.where("status", "approved").orderBy("name", "asc");
  }),
  approved: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.vendor.where("id", "__never_match__")
      : zql.vendor.where("status", "approved").orderBy("name", "asc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    (isExternalUser(ctx)
      ? zql.vendor.where("id", "__never_match__")
      : zql.vendor.where("id", id)
    ).one()
  ),
  pendingByCurrentUser: defineQuery(({ ctx }) =>
    zql.vendor
      .where("status", "pending")
      .where("createdBy", ctx?.userId)
      .orderBy("name", "asc")
  ),
};
