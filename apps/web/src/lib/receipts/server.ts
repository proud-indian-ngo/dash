import { db } from "@pi-dash/db";
import {
  bringAutomaticReceiptSendForward,
  issueReceiptsIn,
  type IssueReceiptsResult,
  loadReceiptConfig,
  loadReceiptCandidates,
  loadLiveReceiptContacts,
  loadReceiptDeliveryTarget,
  loadReceiptReadiness,
  type ReceiptCandidates,
  type ReceiptContacts,
  type ReceiptReadiness,
  ReceiptError,
  type VoidedReceipt,
  voidReceiptIn,
} from "@pi-dash/db/queries/contribution-receipts";
import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { enqueue, inTransaction } from "@pi-dash/jobs/enqueue";
import {
  ReceiptSignatureError,
  readReceiptSignature,
} from "@pi-dash/jobs/lib/receipt-pdf";
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
  contacts: "The donors' contact details couldn't be checked.",
  email: "The receipt couldn't be emailed.",
  issue: "The receipts couldn't be issued.",
  readiness: "The receipt status couldn't be loaded.",
  sendNow: "The receipt couldn't be sent.",
  void: "The receipt couldn't be voided.",
  whatsapp: "The receipt couldn't be sent on WhatsApp.",
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
  safely("issue", async () => {
    // A receipt's number can't be given back, so refuse before issuing one
    // that could never render.
    const { settings } = await loadReceiptConfig();
    if (settings) {
      try {
        await readReceiptSignature(settings.signatureKey);
      } catch (error) {
        if (error instanceof ReceiptSignatureError) {
          throw new ReceiptError(
            "The signatory's signature can't be read. Upload it again in Settings → Organisation accounts."
          );
        }
        throw error;
      }
    }
    return await db.transaction(async (tx) => {
      const result = await issueReceiptsIn(tx, { actorId, contributionIds });
      // Each PDF is stored once the receipts commit, so the first copy a
      // donor gets is the stored one. Queued only if the issue commits.
      for (const receipt of result.issued) {
        await enqueue(
          "store-contribution-receipt-pdf",
          { receiptId: receipt.id },
          { db: inTransaction(tx) }
        );
      }
      return result;
    });
  });

export const voidReceipt = (
  input: { reason: string; receiptId: string },
  actorId: string
): Promise<VoidedReceipt> =>
  safely("void", () =>
    db.transaction((tx) => voidReceiptIn(tx, { ...input, actorId }))
  );

/** A live receipt finance may send, or the refusal saying why not. */
async function sendableTarget(receiptId: string) {
  const target = await loadReceiptDeliveryTarget(receiptId);
  if (!target) {
    throw new ReceiptError("Receipt not found.");
  }
  if (target.voided) {
    throw new ReceiptError("A voided receipt can't be sent.");
  }
  if (target.donorChanged) {
    throw new ReceiptError(
      "The gift's donor changed after this receipt was issued. Void the receipt and issue a new one."
    );
  }
  return target;
}

/**
 * Queues finance's email. It never touches the automatic send: if this one
 * goes, that one finds the receipt delivered; if not, it still goes. Refuses
 * a donor without an email address and an address on the suppression list
 * (bounced or reported as spam).
 */
export const queueReceiptEmail = (receiptId: string) =>
  safely("email", async () => {
    const target = await sendableTarget(receiptId);
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

export const loadContacts = (): Promise<Record<string, ReceiptContacts>> =>
  safely("contacts", () => loadLiveReceiptContacts());

/**
 * Queues the receipt on WhatsApp, even when the donor has an email
 * address; like email, it leaves the automatic send alone. Refuses a donor
 * without a phone number.
 */
export const queueReceiptWhatsApp = (receiptId: string) =>
  safely("whatsapp", async () => {
    const target = await sendableTarget(receiptId);
    if (!target.phone) {
      throw new ReceiptError(
        "The donor has no phone number. Add one on the donor first."
      );
    }
    await enqueue("send-contribution-receipt-whatsapp", {
      receiptId,
      requestId: uuidv7(),
    });
    return { contributionId: target.contributionId };
  });

/**
 * "Send now": brings the automatic send forward and queues the automatic
 * delivery at once, in one transaction. A second click or tab finds nothing
 * to bring forward and is refused. The delayed copy runs after this one on
 * the same queue: it skips if this one delivered, and tries again if not.
 */
export const queueReceiptNow = (receiptId: string) =>
  safely("sendNow", async () => {
    const target = await sendableTarget(receiptId);
    if (!(target.email || target.phone)) {
      throw new ReceiptError(
        "The donor has no email address or phone number. Add one on the donor first."
      );
    }
    await db.transaction(async (tx) => {
      if (
        !(await bringAutomaticReceiptSendForward(tx, receiptId, new Date()))
      ) {
        throw new ReceiptError(
          "This receipt isn't waiting to be sent. Email it or send it on WhatsApp instead."
        );
      }
      await enqueue(
        "deliver-contribution-receipt",
        { receiptId },
        { db: inTransaction(tx) }
      );
    });
    return { contributionId: target.contributionId };
  });
