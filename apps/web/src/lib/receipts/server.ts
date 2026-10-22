import { db } from "@pi-dash/db";
import {
  issueReceiptsIn,
  type IssueReceiptsResult,
  loadReceiptConfig,
  loadReceiptCandidates,
  loadLiveReceiptContacts,
  loadReceiptEmailTarget,
  loadReceiptReadiness,
  loadReceiptWhatsAppTarget,
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

export const loadContacts = (): Promise<Record<string, ReceiptContacts>> =>
  safely("contacts", () => loadLiveReceiptContacts());

/**
 * Queues the receipt on WhatsApp now, even when the donor has an email
 * address. Refuses a voided receipt and a donor without a phone number.
 */
export const queueReceiptWhatsApp = (receiptId: string) =>
  safely("whatsapp", async () => {
    const target = await loadReceiptWhatsAppTarget(receiptId);
    if (!target) {
      throw new ReceiptError("Receipt not found.");
    }
    if (target.voided) {
      throw new ReceiptError("A voided receipt can't be sent.");
    }
    if (!target.phone) {
      throw new ReceiptError(
        "The donor has no phone number. Add one on the donor first."
      );
    }
    await enqueue("send-contribution-receipt-whatsapp", {
      onlyWithoutEmail: false,
      receiptId,
      requestId: uuidv7(),
    });
    return { contributionId: target.contributionId };
  });

/**
 * Sends a receipt waiting for its automatic send now, by the same rule:
 * email, or WhatsApp when the donor has no email address. The delayed
 * send then finds it delivered and skips.
 */
export const queueReceiptNow = (receiptId: string) =>
  safely("sendNow", async () => {
    const target = await loadReceiptWhatsAppTarget(receiptId);
    if (!target) {
      throw new ReceiptError("Receipt not found.");
    }
    const waiting =
      target.autoSendAt !== null &&
      target.autoSendAt.getTime() > Date.now() &&
      !(target.delivered || target.voided);
    if (!waiting) {
      throw new ReceiptError(
        "This receipt isn't waiting to be sent. Email it or send it on WhatsApp instead."
      );
    }
    if (!(target.email || target.phone)) {
      throw new ReceiptError(
        "The donor has no email address or phone number. Add one on the donor first."
      );
    }
    const requestId = uuidv7();
    await db.transaction(async (tx) => {
      await enqueue(
        "send-contribution-receipt",
        { receiptId, requestId },
        { db: inTransaction(tx) }
      );
      await enqueue(
        "send-contribution-receipt-whatsapp",
        { onlyWithoutEmail: true, receiptId, requestId },
        { db: inTransaction(tx) }
      );
    });
    return { contributionId: target.contributionId };
  });
