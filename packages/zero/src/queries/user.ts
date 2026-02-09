import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const userQueries = {
  one: defineQuery(({ ctx }) => zql.user.where("id", ctx?.userId ?? "").one()),
  all: defineQuery(({ ctx }) =>
    ctx?.role === "admin"
      ? zql.user.orderBy("createdAt", "desc")
      : zql.user.where("id", ctx?.userId ?? "")
  ),
};
