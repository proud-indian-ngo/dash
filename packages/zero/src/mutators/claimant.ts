import type { Transaction } from "@rocicorp/zero";

import { type Context, requirePrivateUserLoader } from "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

/** Payee details (bank, UPI or both) copied onto a reimbursement from a saved account. */
export interface ClaimantBankFields {
  bankAccountIfscCode: null | string;
  bankAccountName: null | string;
  bankAccountNumber: null | string;
  bankAccountUpiId: null | string;
}

const NO_BANK_FIELDS: ClaimantBankFields = {
  bankAccountIfscCode: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankAccountUpiId: null,
};

export const CHOOSE_CLAIMANT_ACCOUNT_MESSAGE =
  "Choose one of the claimant's saved bank accounts or UPI";
export const CLAIMANT_HAS_NO_ACCOUNT_MESSAGE =
  "The claimant has no saved bank account or UPI. They need to add one in Settings → Bank accounts";

/**
 * The person a reimbursement is for. Without `claimantUserId`, or with your
 * own, it is you. Anyone else needs `requests.create_for_others`, and must be
 * an active, internal user (checked on the server, which sees every user).
 */
export async function resolveClaimant(
  tx: Tx,
  ctx: Context,
  claimantUserId: string | undefined
): Promise<{ claimantId: string; forOthers: boolean }> {
  const claimantId = claimantUserId ?? ctx.userId;
  if (claimantId === ctx.userId) {
    return { claimantId, forOthers: false };
  }
  assertHasPermission(ctx, "requests.create_for_others");
  await assertEligibleClaimant(tx, ctx, claimantId);
  return { claimantId, forOthers: true };
}

/** An active, internal user; the server decides, the client can't see all. */
export async function assertEligibleClaimant(
  tx: Tx,
  ctx: Context,
  claimantId: string
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const claimant = await requirePrivateUserLoader(ctx)(claimantId);
  if (!claimant || claimant.role === "external_user" || !claimant.isActive) {
    throw new Error("Choose an active member as the claimant");
  }
}

/**
 * The claimant's saved bank account to pay, copied onto the request. It must
 * belong to the claimant: the server refuses any other account. When no
 * account is chosen the details are cleared, unless the claimant has saved
 * accounts (then one must be chosen) or `required` is set (then they need
 * one). The client can't see someone else's accounts unless it loaded them,
 * so it writes what it can and the server decides.
 */
export async function claimantBankFields(
  tx: Tx,
  claimantId: string,
  bankAccountId: null | string | undefined,
  options: { required: boolean }
): Promise<ClaimantBankFields> {
  const isServer = tx.location === "server";
  if (bankAccountId) {
    const account = await tx.run(
      zql.bankAccount
        .where("id", bankAccountId)
        .where("userId", claimantId)
        .one()
    );
    if (account) {
      return {
        bankAccountIfscCode: account.ifscCode,
        bankAccountName: account.accountName,
        bankAccountNumber: account.accountNumber,
        bankAccountUpiId: account.upiId ?? null,
      };
    }
    if (isServer) {
      throw new Error(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    }
    return NO_BANK_FIELDS;
  }
  if (isServer) {
    const accounts = await tx.run(
      zql.bankAccount.where("userId", claimantId).limit(1)
    );
    if (accounts.length > 0) {
      throw new Error(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    }
    if (options.required) {
      throw new Error(CLAIMANT_HAS_NO_ACCOUNT_MESSAGE);
    }
  }
  return NO_BANK_FIELDS;
}

/** A user's display name for history notes and notifications. */
export async function userName(tx: Tx, userId: string): Promise<string> {
  const row = await tx.run(zql.user.where("id", userId).one());
  return row?.name?.trim() || "someone";
}
