import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

/** Whether a viewer may read contributions, other income and their pickers. */
export function canSeeIncome(
  ctx: Parameters<typeof can>[0] | null | undefined
) {
  return (
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "donors.view") || can(ctx, "finance.view"))
  );
}

/**
 * Upper bound on the Income page's local dataset: several years at the
 * trust's one to two thousand gifts a year, so the current financial year
 * and its stats are always complete.
 */
export const INCOME_LIST_LIMIT = 5000;

/** Per-donor history on the donor sheet. */
export const DONOR_GIVING_LIMIT = 1000;

export const contributionQueries = {
  /** Donor sheet "Giving" section: amounts, dates and status only. */
  byParty: defineQuery(
    z.object({ partyId: z.string() }),
    ({ args: { partyId }, ctx }) =>
      canSeeIncome(ctx)
        ? zql.contribution
            .where("partyId", partyId)
            .orderBy("receivedOn", "desc")
            .orderBy("id", "desc")
            .limit(DONOR_GIVING_LIMIT)
        : zql.contribution.where("id", "__never_match__")
  ),
  /** The Income page table, newest first. */
  list: defineQuery(({ ctx }) => {
    if (!canSeeIncome(ctx)) {
      return zql.contribution
        .where("id", "__never_match__")
        .related("party")
        .related("programme")
        .related("project")
        .related("orgAccount")
        .related("fund");
    }
    // Full project rows carry sponsor and budget terms, so the project name
    // only joins for finance.view, as in projectQueries.
    const seesProjects = can(ctx, "finance.view");
    return zql.contribution
      .related("party")
      .related("programme")
      .related("project", (p) =>
        seesProjects ? p : p.where("id", "__never_match__")
      )
      .related("orgAccount")
      .related("fund")
      .orderBy("receivedOn", "desc")
      .orderBy("id", "desc")
      .limit(INCOME_LIST_LIMIT);
  }),
};

export const otherIncomeQueries = {
  list: defineQuery(({ ctx }) =>
    canSeeIncome(ctx)
      ? zql.otherIncome
          .related("orgAccount")
          .related("fund")
          .orderBy("receivedOn", "desc")
          .orderBy("id", "desc")
          .limit(INCOME_LIST_LIMIT)
      : zql.otherIncome
          .where("id", "__never_match__")
          .related("orgAccount")
          .related("fund")
  ),
};
