import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const vendorQueries = {
  all: defineQuery(({ ctx }) =>
    ctx?.role === "admin"
      ? zql.vendor.orderBy("name", "asc")
      : zql.vendor.where("status", "approved").orderBy("name", "asc")
  ),
  approved: defineQuery(() =>
    zql.vendor.where("status", "approved").orderBy("name", "asc")
  ),
  pendingByCurrentUser: defineQuery(({ ctx }) =>
    zql.vendor
      .where("status", "pending")
      .where("createdBy", ctx?.userId ?? "")
      .orderBy("name", "asc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id } }) =>
    zql.vendor.where("id", id).one()
  ),
};
