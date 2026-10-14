import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { zql } from "../schema";
import { canSeeSettlements } from "./gateway-settlement";

/**
 * Bank statement lines are finance records whose narration names payers:
 * only finance.view and finance.manage holders read them, the same
 * audience as settlements. Written only by the server.
 */
export const canSeeStatementLines = canSeeSettlements;

/** Several years of one account's lines at a few hundred a month. */
export const STATEMENT_LINE_LIST_LIMIT = 10_000;

const NEVER = "__never_match__";

export const statementLineQueries = {
  /**
   * The bank accounts statements can be viewed for, inactive ones too, so
   * the lines of a closed account stay reachable.
   */
  bankAccounts: defineQuery(({ ctx }) =>
    canSeeStatementLines(ctx)
      ? zql.orgAccount.where("kind", "bank").orderBy("name", "asc")
      : zql.orgAccount.where("id", NEVER)
  ),
  /**
   * One bank account's lines, newest first, with what each is matched to
   * or suggested for: the settlement, or the contribution and its donor's
   * name.
   */
  byAccount: defineQuery(
    z.object({ orgAccountId: z.string() }),
    ({ args: { orgAccountId }, ctx }) =>
      zql.statementLine
        .where("orgAccountId", canSeeStatementLines(ctx) ? orgAccountId : NEVER)
        .related("matchedSettlement")
        .related("matchedContribution", (c) => c.related("party"))
        .related("suggestedSettlement")
        .related("suggestedContribution", (c) => c.related("party"))
        .orderBy("valueOn", "desc")
        .orderBy("position", "desc")
        .orderBy("id", "desc")
        .limit(STATEMENT_LINE_LIST_LIMIT)
  ),
  /** The line a contribution is matched to, for its sheet ("In bank: …"). */
  byContribution: defineQuery(
    z.object({ contributionId: z.string() }),
    ({ args: { contributionId }, ctx }) =>
      zql.statementLine
        .where(
          "matchedContributionId",
          canSeeStatementLines(ctx) ? contributionId : NEVER
        )
        .related("orgAccount")
        .one()
  ),
  /** The line a settlement is matched to, for its sheet. */
  bySettlement: defineQuery(
    z.object({ settlementId: z.string() }),
    ({ args: { settlementId }, ctx }) =>
      zql.statementLine
        .where(
          "matchedSettlementId",
          canSeeStatementLines(ctx) ? settlementId : NEVER
        )
        .related("orgAccount")
        .one()
  ),
};
