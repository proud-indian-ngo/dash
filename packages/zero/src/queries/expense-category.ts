import { defineQuery } from "@rocicorp/zero";
import { zql } from "../schema";

export const expenseCategoryQueries = {
  all: defineQuery(() => zql.expenseCategory.orderBy("name", "asc")),
};
