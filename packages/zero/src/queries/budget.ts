import { defineQuery } from "@rocicorp/zero";

import { can } from "../permissions";
import { zql } from "../schema";

/** Budgets are finance data: finance.view only. A handful of rows a year, so every year syncs. */
export const budgetQueries = {
  all: defineQuery(({ ctx }) =>
    (ctx !== null && ctx !== undefined && can(ctx, "finance.view")
      ? zql.budget
      : zql.budget.where("id", "__never_match__")
    ).related("lines")
  ),
};
