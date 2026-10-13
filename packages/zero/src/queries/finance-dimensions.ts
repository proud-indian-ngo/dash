import { defineQuery } from "@rocicorp/zero";

import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";
import { canSeeIncome } from "./income";

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
  /** Internal, non-banned users who can be named as a programme lead. */
  leadCandidates: defineQuery(({ ctx }) =>
    ctx !== null && ctx !== undefined && can(ctx, "finance.manage")
      ? zql.user
          .where("role", "!=", "external_user")
          .where("banned", "!=", true)
          .orderBy("name", "asc")
      : zql.user.where("id", "__never_match__")
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

/** Full project rows carry sponsor and budget terms, so they need finance.view. */
export const projectQueries = {
  all: defineQuery(({ ctx }) =>
    financeGuard(ctx)
      ? zql.project.orderBy("name", "asc")
      : zql.project.where("id", "__never_match__")
  ),
};

export const fundQueries = {
  /** Picker for recording income; names only matter, so donors.view may read it too. */
  active: defineQuery(({ ctx }) =>
    canSeeIncome(ctx)
      ? zql.fund.where("active", true).orderBy("name", "asc")
      : zql.fund.where("id", "__never_match__")
  ),
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
  /** Picker for recording income; bank details never sync, so donors.view may read it too. */
  active: defineQuery(({ ctx }) =>
    canSeeIncome(ctx)
      ? zql.orgAccount.where("active", true).orderBy("name", "asc")
      : zql.orgAccount.where("id", "__never_match__")
  ),
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
