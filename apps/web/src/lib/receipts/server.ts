import { db } from "@pi-dash/db";
import {
  issueReceiptsIn,
  type IssueReceiptsResult,
  loadReceiptCandidates,
  loadReceiptEmailTarget,
  loadReceiptReadiness,
  type ReceiptCandidates,
  type ReceiptReadiness,
  ReceiptError,
  type VoidedReceipt,
  voidReceiptIn,
} from "@pi-dash/db/queries/contribution-receipts";
import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { enqueue, inTransaction } from "@pi-dash/jobs/enqueue";
import { uuidv7 } from "uuidv7";

import { withSafeErrors } from "@/lib/safe-errors";

/**
 * Server-only. The receipt commands, each in one transaction. Refusals
 * (`ReceiptError`) reach the browser as written; anything else is logged by
 * code only and replaced with a generic message, because query errors quote
 * donor details.
 */

const MESSAGES = {
  candidates: "The gifts to receipt couldn't be loaded.",
  email: "The receipt couldn't be emailed.",
  issue: "The receipts couldn't be issued.",
  readiness: "The receipt status couldn't be loaded.",
  void: "The receipt couldn't be voided.",
} as const;

const safely = <T>(step: keyof typeof MESSAGES, work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "receipts_failed", step },
      isUserFacing: (error) => error instanceof ReceiptError,
      message: MESSAGES[step],
      path: "receipts",
    },
    work
  );

export const loadCandidates = (
  contributionIds: string[] | null
): Promise<ReceiptCandidates> =>
  safely("candidates", () => loadReceiptCandidates(contributionIds));

export const loadReadiness = (): Promise<ReceiptReadiness> =>
  safely("readiness", () => loadReceiptReadiness());

export const issueReceipts = (
  contributionIds: string[],
  actorId: string
): Promise<IssueReceiptsResult> =>
  safely("issue", () =>
    db.transaction(async (tx) => {
      const result = await issueReceiptsIn(tx, { actorId, contributionIds });
      // Each PDF is stored once the receipts commit, so the first copy a
      // donor gets is the stored one. Queued only if the issue commits.
      for (const receipt of result.issued) {
        await enqueue(
          "store-contribution-receipt-pdf",
          { receiptId: receipt.id },
          { db: inTransaction(tx), singletonKey: `receipt-pdf-${receipt.id}` }
        );
      }
      return result;
    })
  );

export const voidReceipt = (
  input: { reason: string; receiptId: string },
  actorId: string
): Promise<VoidedReceipt> =>
  safely("void", () =>
    db.transaction((tx) => voidReceiptIn(tx, { ...input, actorId }))
  );

/**
 * Checks the receipt can be emailed and queues the email. Refuses a voided
 * receipt, a donor without an email address, and an address on the
 * suppression list (bounced or reported as spam).
 */
export const queueReceiptEmail = (receiptId: string) =>
  safely("email", async () => {
    const target = await loadReceiptEmailTarget(receiptId);
    if (!target) {
      throw new ReceiptError("Receipt not found.");
    }
    if (target.voided) {
      throw new ReceiptError("A voided receipt can't be emailed.");
    }
    if (!target.email) {
      throw new ReceiptError(
        "The donor has no email address. Add one on the donor first."
      );
    }
    if (await getEmailSuppression(target.email)) {
      throw new ReceiptError(
        "The donor's email address bounced or reported our email as spam, so it can't be emailed."
      );
    }
    await enqueue("send-contribution-receipt", {
      receiptId,
      requestId: uuidv7(),
    });
    return { contributionId: target.contributionId };
  });
