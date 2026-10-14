import { defineQuery } from "@rocicorp/zero";

import { zql } from "../schema";
import { canSeeSettlements } from "./gateway-settlement";

/**
 * Minimal, uncapped evidence for the Income table's derived "Reached bank"
 * filter. Only finance viewers can sync these finance records.
 */
export const contributionBankStatusQueries = {
  matchedContributionLines: defineQuery(({ ctx }) =>
    canSeeSettlements(ctx)
      ? zql.statementLine
          .where("matchStatus", "matched")
          .where("matchedContributionId", "IS NOT", null)
      : zql.statementLine.where("id", "__never_match__")
  ),
  processedPaymentItems: defineQuery(({ ctx }) =>
    canSeeSettlements(ctx)
      ? zql.gatewaySettlementItem
          .where("type", "payment")
          .where("contributionId", "IS NOT", null)
          .whereExists("settlement", (settlement) =>
            settlement.where("status", "processed")
          )
      : zql.gatewaySettlementItem.where("id", "__never_match__")
  ),
};
