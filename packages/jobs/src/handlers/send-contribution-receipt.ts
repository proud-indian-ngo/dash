import {
  loadReceiptDeliveryTarget,
  markReceiptEmailed,
  recordReceiptDeliveryFailure,
} from "@pi-dash/db/queries/contribution-receipts";
import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { renderDonationReceiptEmail } from "@pi-dash/email";
import { EmailSendError, sendEmail } from "@pi-dash/email/mailer";
import { formatPaise } from "@pi-dash/shared/money";
import { formatReceiptDate } from "@pi-dash/shared/receipts";

import { recordThrownSend } from "../lib/receipt-delivery";
import { safeReceiptJobError } from "../lib/receipt-errors";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

export type ReceiptEmailOutcome =
  | "sent"
  | "already_sent"
  | "not_configured"
  | "missing"
  | "voided"
  | "donor_changed"
  | "no_email"
  | "suppressed";

/** What emailing a receipt to an address needs. */
export interface ReceiptEmailChannel {
  getSuppression: typeof getEmailSuppression;
  markEmailed: typeof markReceiptEmailed;
  recordFailure: typeof recordReceiptDeliveryFailure;
  renderEmail: typeof renderDonationReceiptEmail;
  renderPdf: typeof receiptPdf;
  send: typeof sendEmail;
}

export const receiptEmailChannel: ReceiptEmailChannel = {
  getSuppression: getEmailSuppression,
  markEmailed: markReceiptEmailed,
  recordFailure: recordReceiptDeliveryFailure,
  renderEmail: renderDonationReceiptEmail,
  renderPdf: receiptPdf,
  send: sendEmail,
};

/**
 * Emails the receipt's stored PDF to `email`. A suppressed address or
 * missing email setup is recorded on the receipt as not sent; a Resend
 * failure is recorded and thrown so pg-boss retries, and the per-request
 * idempotency key keeps a retry from sending twice.
 */
export async function emailReceipt(
  receipt: { receiptId: string; requestId: string },
  email: string,
  channel: ReceiptEmailChannel
): Promise<{ outcome: ReceiptEmailOutcome }> {
  const { receiptId, requestId } = receipt;
  // Donor email follows the notification rule: any bounce or complaint stops it.
  if (await channel.getSuppression(email)) {
    await channel.recordFailure(receiptId, "email_suppressed");
    return { outcome: "suppressed" };
  }
  const rendered = await channel.renderPdf(receiptId);
  if (!rendered) {
    return { outcome: "missing" };
  }
  const { document } = rendered;
  if (document.voidedAt) {
    return { outcome: "voided" };
  }
  const html = await channel.renderEmail({
    amount: formatPaise(document.gift.amountPaise),
    donorName: document.donor.name,
    number: document.number,
    orgName: document.org.name,
    receivedOn: formatReceiptDate(document.gift.receivedOn),
  });
  let result: Awaited<ReturnType<typeof channel.send>>;
  try {
    result = await channel.send({
      attachments: [{ content: rendered.pdf, filename: rendered.filename }],
      html,
      idempotencyKey: `receipt-${receiptId}-${requestId}`,
      subject: `Your donation receipt ${document.number}`,
      to: email,
    });
  } catch (error) {
    // Resend answers 409 when this idempotency key was already used: the
    // retry's email went out on an earlier attempt (the PDF is byte-for-byte
    // the same), so record it as sent rather than failing the job.
    if (error instanceof EmailSendError && error.statusCode === 409) {
      await channel.markEmailed(receiptId, new Date());
      return { outcome: "already_sent" };
    }
    await recordThrownSend(channel.recordFailure, receiptId, "email_failed");
    throw error;
  }
  if (result.status !== "sent") {
    await channel.recordFailure(receiptId, "email_not_configured");
    return { outcome: "not_configured" };
  }
  await channel.markEmailed(receiptId, new Date());
  return { outcome: "sent" };
}

export interface ReceiptEmailDependencies extends ReceiptEmailChannel {
  loadTarget: typeof loadReceiptDeliveryTarget;
}

/**
 * Finance's "Email receipt": the donor's current address, whatever was
 * sent before. The server function checked the same conditions before
 * enqueueing; they are checked again because the receipt may be voided or
 * the address changed meanwhile.
 */
export async function sendContributionReceipt(
  data: SendContributionReceiptPayload,
  deps: ReceiptEmailDependencies = {
    ...receiptEmailChannel,
    loadTarget: loadReceiptDeliveryTarget,
  }
): Promise<{ outcome: ReceiptEmailOutcome }> {
  const target = await deps.loadTarget(data.receiptId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.voided) {
    return { outcome: "voided" };
  }
  if (target.donorChanged) {
    await deps.recordFailure(data.receiptId, "donor_changed");
    return { outcome: "donor_changed" };
  }
  if (!target.email) {
    return { outcome: "no_email" };
  }
  return await emailReceipt(data, target.email, deps);
}

export const handleSendContributionReceipt = createNotifyHandler<
  SendContributionReceiptPayload,
  { outcome: ReceiptEmailOutcome }
>("send-contribution-receipt", async () => async (data) => {
  try {
    return await sendContributionReceipt(data);
  } catch (error) {
    throw safeReceiptJobError(error, "receipt_email_failed");
  }
});
