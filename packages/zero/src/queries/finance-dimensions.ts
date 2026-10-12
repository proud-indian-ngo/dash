import { defineQuery } from "@rocicorp/zero";

import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";

/** Programmes and cost centres are picked on every event, so any internal user may list them. */
export const programmeQueries = {
  active: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.programme.where("id", "__never_match__")
      : zql.programme.where("active", true).orderBy("sortOrder", "asc")
  ),
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.programme.where("id", "__never_match__")
      : zql.programme.orderBy("sortOrder", "asc").orderBy("name", "asc")
  ),
};

export const costCentreQueries = {
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.costCentre.where("id", "__never_match__")
      : zql.costCentre.orderBy("name", "asc")
  ),
};

/** The remaining dimensions are finance setup and need finance.view. */
function financeGuard(ctx: Parameters<typeof can>[0] | null | undefined) {
  return ctx !== null && ctx !== undefined && can(ctx, "finance.view");
}

export const projectQueries = {
  all: defineQuery(({ ctx }) =>
    isExternalUser(ctx)
      ? zql.project.where("id", "__never_match__")
      : zql.project.orderBy("name", "asc")
  ),
};

export const fundQueries = {
  all: defineQuery(({ ctx }) =>
    financeGuard(ctx)
      ? zql.fund.orderBy("name", "asc")
      : zql.fund.where("id", "__never_match__")
  ),
};

export const accountHeadQueries = {
  all: defineQuery(({ ctx }) =>
    financeGuard(ctx)
      ? zql.accountHead.orderBy("sortOrder", "asc").orderBy("name", "asc")
      : zql.accountHead.where("id", "__never_match__")
  ),
};

export const orgAccountQueries = {
  all: defineQuery(({ ctx }) =>
    financeGuard(ctx)
      ? zql.orgAccount.orderBy("name", "asc")
      : zql.orgAccount.where("id", "__never_match__")
  ),
};

export const fiscalYearQueries = {
  all: defineQuery(({ ctx }) =>
    financeGuard(ctx)
      ? zql.fiscalYear.orderBy("startsOn", "desc").related("periods")
      : zql.fiscalYear.where("id", "__never_match__")
  ),
};
