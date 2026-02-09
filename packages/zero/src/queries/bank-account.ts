import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const bankAccountQueries = {
  bankAccountsByCurrentUser: defineQuery(({ ctx }) =>
    zql.bankAccount
      .where("userId", ctx?.userId ?? "")
      .orderBy("createdAt", "asc")
  ),
};
