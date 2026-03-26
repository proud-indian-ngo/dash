import { defineQuery } from "@rocicorp/zero";
import { can } from "../permissions";
import { zql } from "../schema";

export const userQueries = {
  one: defineQuery(({ ctx }) => zql.user.where("id", ctx?.userId).one()),
  all: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "users.view")
      ? zql.user.orderBy("createdAt", "desc")
      : zql.user.where("id", ctx?.userId)
  ),
};
