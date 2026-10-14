import { INCOME_LIST_LIMIT, INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

/**
 * Whether a viewer may read contributions, other income and their pickers.
 * Managing implies seeing, so either manage permission admits too.
 */
export function canSeeIncome(
  ctx: Parameters<typeof can>[0] | null | undefined
) {
  return (
    ctx !== null &&
    ctx !== undefined &&
    INCOME_PERMISSIONS.some((permission) => can(ctx, permission))
  );
}

/** Per-donor history on the donor sheet. */
export const DONOR_GIVING_LIMIT = 1000;

export const contributionQueries = {
  /**
   * Donor sheet "Giving" section: amounts, dates and status only, with the
   * refunds that take partial refunds off the totals.
   */
  byParty: defineQuery(
    z.object({ partyId: z.string() }),
    ({ args: { partyId }, ctx }) =>
      canSeeIncome(ctx)
        ? zql.contribution
            .where("partyId", partyId)
            .related("refunds")
            .orderBy("receivedOn", "desc")
            .orderBy("id", "desc")
            .limit(DONOR_GIVING_LIMIT)
        : zql.contribution.where("id", "__never_match__").related("refunds")
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
        .related("fund")
        .related("importBatch")
        .related("intermediary")
        .related("refunds");
    }
    // Full project rows carry sponsor and budget terms, so the project name
    // only joins for finance.view, as in projectQueries.
    const seesProjects = can(ctx, "finance.view");
    return (
      zql.contribution
        .related("party")
        .related("programme")
        .related("project", (p) =>
          seesProjects ? p : p.where("id", "__never_match__")
        )
        .related("orgAccount")
        .related("fund")
        .related("importBatch")
        .related("intermediary")
        // Refunds are written only by the server; read-only here.
        .related("refunds", (r) =>
          r.orderBy("refundedOn", "asc").orderBy("id", "asc")
        )
        .orderBy("receivedOn", "desc")
        .orderBy("id", "desc")
        .limit(INCOME_LIST_LIMIT)
    );
  }),
};

/**
 * Razorpay opens one batch per day with payments, so this holds several
 * years of those alongside monthly uploads from a few sources.
 */
export const IMPORT_BATCH_LIST_LIMIT = 2000;

/** Bank statement uploads are finance records; donor roles alone don't see them. */
function importBatchesFor(ctx: Parameters<typeof can>[0] | null | undefined) {
  const financeViewer =
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "finance.view") || can(ctx, "finance.manage"));
  return financeViewer
    ? zql.importBatch
    : zql.importBatch.where("source", "!=", "bank_csv");
}

/**
 * CSV import batches for the Imports tab: settings and counts only, since
 * the rows themselves never sync. The uploader's name comes from the user
 * row, as on other pages.
 */
export const importBatchQueries = {
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    canSeeIncome(ctx)
      ? importBatchesFor(ctx)
          .where("id", id)
          .related("uploadedByUser")
          .related("orgAccount")
          .related("fund")
          .one()
      : zql.importBatch
          .where("id", "__never_match__")
          .related("uploadedByUser")
          .related("orgAccount")
          .related("fund")
          .one()
  ),
  list: defineQuery(({ ctx }) =>
    canSeeIncome(ctx)
      ? importBatchesFor(ctx)
          .related("uploadedByUser")
          .related("orgAccount")
          .orderBy("createdAt", "desc")
          .orderBy("id", "desc")
          .limit(IMPORT_BATCH_LIST_LIMIT)
      : zql.importBatch
          .where("id", "__never_match__")
          .related("uploadedByUser")
          .related("orgAccount")
  ),
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
