import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

const NEVER = "__never_match__";

/**
 * Whose saved bank accounts the viewer may read: their own, or anyone's with
 * `requests.create_for_others`. Returns a never-matching ID otherwise.
 */
export function claimantBankAccountScope(
  ctx: Context | null | undefined,
  userId: string
): string {
  if (!ctx) {
    return NEVER;
  }
  return userId === ctx.userId || can(ctx, "requests.create_for_others")
    ? userId
    : NEVER;
}

export const bankAccountQueries = {
  bankAccountsByCurrentUser: defineQuery(({ ctx }) =>
    zql.bankAccount.where("userId", ctx?.userId).orderBy("createdAt", "asc")
  ),
  /**
   * A claimant's saved bank accounts, for finance raising a reimbursement on
   * their behalf or changing who a reimbursement belongs to. Only holders of
   * `requests.create_for_others` read another person's accounts; anyone else
   * sees only their own.
   */
  bankAccountsForClaimant: defineQuery(
    z.object({ userId: z.string() }),
    ({ args: { userId }, ctx }) =>
      zql.bankAccount
        .where("userId", claimantBankAccountScope(ctx, userId))
        .orderBy("createdAt", "asc")
  ),
};
