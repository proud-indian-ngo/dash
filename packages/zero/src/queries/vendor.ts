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
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    if (ctx === null || isExternalUser(ctx)) {
      return zql.vendor.where("id", "__never_match__").one();
    }

    const vendor = zql.vendor.where("id", id);
    return (
      can(ctx, "vendors.view_all")
        ? vendor
        : vendor.where(({ or, and, cmp }) =>
            or(
              cmp("status", "approved"),
              and(cmp("status", "pending"), cmp("createdBy", ctx.userId))
            )
          )
    ).one();
  }),
  pendingByCurrentUser: defineQuery(({ ctx }) =>
    zql.vendor
      .where("status", "pending")
      .where("createdBy", ctx?.userId ?? "__never_match__")
      .orderBy("name", "asc")
  ),
};
