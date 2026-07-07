import { defineQuery } from "@rocicorp/zero";
import { can } from "../permissions";
import { zql } from "../schema";

export const userQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "users.view")
      ? zql.user.orderBy("createdAt", "desc")
      : zql.user.where("id", ctx?.userId)
  ),
  one: defineQuery(({ ctx }) => zql.user.where("id", ctx?.userId).one()),
  whatsappUsers: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "users.view")
      ? zql.user.where("isOnWhatsapp", true).orderBy("name", "asc")
      : zql.user.where("id", ctx?.userId).where("isOnWhatsapp", true)
  ),
};
