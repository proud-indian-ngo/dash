import { defineQuery } from "@rocicorp/zero";
import { isExternalUser } from "../permissions";
import { zql } from "../schema";

export const expenseCategoryQueries = {
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.expenseCategory.where("id", "__never_match__")
      : zql.expenseCategory.orderBy("name", "asc")
  ),
};
