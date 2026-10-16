import {
  MATCHED_TO_BANK_MESSAGE,
  POSTED_DELETE_MESSAGE,
  VOID_REASON_MAX,
  VOIDED_DELETE_MESSAGE,
  VOIDED_MESSAGE,
} from "@pi-dash/shared/ledger";
import type { Transaction } from "@rocicorp/zero";
import z from "zod";

import { type Schema, zql } from "../schema";
import { isPostedInBooks, type LedgerSourceRef } from "./ledger-queue";

type Tx = Transaction<Schema> & {
  dbTransaction?: { wrappedTransaction: unknown };
};

/**
 * Voiding (finance Option B): a request or payment the books hold isn't
 * deleted; it is voided with a reason, kept with its attachments, vouchers
 * and history, and the posting run reverses it on the void day.
 */
export const voidSchema = z.object({
  id: z.string(),
  reason: z.string().trim().min(1, "Give a reason").max(VOID_REASON_MAX),
});

/** A voided record takes no further change. */
export function assertNotVoided(entity: { voidedAt?: number | null }) {
  if (entity.voidedAt) {
    throw new Error(VOIDED_MESSAGE);
  }
}

/**
 * Delete only what the books don't hold: anything with a standing posting
 * is voided instead (checked on the server, which can read the books), and
 * a voided record stays. Nothing a bank debit is matched to is deleted.
 */
export async function assertDeletable(
  tx: Tx,
  entity: { voidedAt?: number | null },
  sources: readonly LedgerSourceRef[]
) {
  if (entity.voidedAt) {
    throw new Error(VOIDED_DELETE_MESSAGE);
  }
  for (const source of sources) {
    if (await isPostedInBooks(tx, source)) {
      throw new Error(POSTED_DELETE_MESSAGE);
    }
  }
  await assertNotMatchedToBank(tx, sources);
}

/**
 * Refuses voiding or deleting a claim or vendor payment a bank debit is
 * matched to (finance layer 3-3b): the reviewer unmatches the bank line
 * first. Server only (bank lines sync to finance readers alone). Takes the
 * statement line lock first, so a match can't land between this check and
 * the commit.
 */
export async function assertNotMatchedToBank(
  tx: Tx,
  sources: readonly LedgerSourceRef[]
) {
  if (tx.location !== "server") {
    return;
  }
  const ids = (type: LedgerSourceRef["sourceType"]) =>
    sources.filter((s) => s.sourceType === type).map((s) => s.sourceId);
  const reimbursementIds = ids("reimbursement");
  const paymentIds = ids("vendor_payment_transaction");
  if (reimbursementIds.length === 0 && paymentIds.length === 0) {
    return;
  }
  const wrapped = tx.dbTransaction?.wrappedTransaction as
    | { execute: (query: unknown) => Promise<unknown> }
    | undefined;
  if (wrapped) {
    const { STATEMENT_LINE_LOCK } =
      await import("@pi-dash/db/queries/statement-lines");
    await wrapped.execute(STATEMENT_LINE_LOCK);
  }
  const live = [
    ...(reimbursementIds.length > 0
      ? await tx.run(
          zql.statementAllocation
            .where("reimbursementId", "IN", reimbursementIds)
            .where("releasedAt", "IS", null)
            .limit(1)
        )
      : []),
    ...(paymentIds.length > 0
      ? await tx.run(
          zql.statementAllocation
            .where("vendorPaymentTransactionId", "IN", paymentIds)
            .where("releasedAt", "IS", null)
            .limit(1)
        )
      : []),
  ];
  if (live.length > 0) {
    throw new Error(MATCHED_TO_BANK_MESSAGE);
  }
}
