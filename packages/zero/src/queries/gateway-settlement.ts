import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

/**
 * Settlements are finance records: only finance.view and finance.manage
 * holders read them (not donors.view). Written only by the server.
 */
export function canSeeSettlements(
  ctx: Parameters<typeof can>[0] | null | undefined
) {
  return (
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "finance.view") || can(ctx, "finance.manage"))
  );
}

/** Several years of daily Razorpay payouts. */
export const SETTLEMENT_LIST_LIMIT = 3000;

export const gatewaySettlementQueries = {
  /**
   * The settlement sheet: its lines, oldest first, with the donor of each
   * linked payment (the name only is shown) and the contribution's stored
   * fee and GST, to flag a fee that differs.
   */
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    canSeeSettlements(ctx)
      ? zql.gatewaySettlement
          .where("id", id)
          .related("items", (items) =>
            items
              .related("contribution", (c) => c.related("party"))
              .orderBy("settledAt", "asc")
              .orderBy("id", "asc")
          )
          .one()
      : zql.gatewaySettlement
          .where("id", "__never_match__")
          .related("items", (items) =>
            items.related("contribution", (c) => c.related("party"))
          )
          .one()
  ),
  /** The settlement lines of one contribution's payment, for its sheet. */
  byContribution: defineQuery(
    z.object({ contributionId: z.string() }),
    ({ args: { contributionId }, ctx }) =>
      canSeeSettlements(ctx)
        ? zql.gatewaySettlementItem
            .where("contributionId", contributionId)
            .where("type", "payment")
            .related("settlement")
            .orderBy("settledAt", "desc")
            .orderBy("id", "desc")
        : zql.gatewaySettlementItem
            .where("id", "__never_match__")
            .related("settlement")
  ),
  /**
   * The Settlements tab for one mode (the server's), newest first. Totals
   * are stored on the settlement, so only the lines still waiting for their
   * payment or refund come along, for the "N unlinked" tag.
   */
  list: defineQuery(
    z.object({ providerAccount: z.string() }),
    ({ args: { providerAccount }, ctx }) =>
      canSeeSettlements(ctx)
        ? zql.gatewaySettlement
            .where("providerAccount", providerAccount)
            .related("items", (items) =>
              items.where(({ and, cmp, or }) =>
                or(
                  and(
                    cmp("type", "payment"),
                    cmp("contributionId", "IS", null)
                  ),
                  and(
                    cmp("type", "refund"),
                    cmp("contributionRefundId", "IS", null)
                  )
                )
              )
            )
            .orderBy("settledOn", "desc")
            .orderBy("id", "desc")
            .limit(SETTLEMENT_LIST_LIMIT)
        : zql.gatewaySettlement.where("id", "__never_match__").related("items")
  ),
};
