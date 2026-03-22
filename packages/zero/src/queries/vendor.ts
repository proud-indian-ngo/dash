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
  byId: defineQuery(z.object({ id: z.string() }), ({ ctx, args: { id } }) =>
    ctx?.role === "admin"
      ? zql.vendor.where("id", id).one()
      : zql.vendor.where("id", id).where("status", "approved").one()
  ),
};
