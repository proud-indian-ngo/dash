import {
  loadReceiptEmailTarget,
  markReceiptEmailed,
} from "@pi-dash/db/queries/contribution-receipts";
import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { renderDonationReceiptEmail } from "@pi-dash/email";
import { sendEmail } from "@pi-dash/email/mailer";
import { formatPaise } from "@pi-dash/shared/money";
import { formatReceiptDate } from "@pi-dash/shared/receipts";

import { renderReceiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

export type ReceiptEmailOutcome =
  | "sent"
  | "not_configured"
  | "missing"
  | "voided"
  | "no_email"
  | "suppressed";

export interface ReceiptEmailDependencies {
  getSuppression: typeof getEmailSuppression;
  loadTarget: typeof loadReceiptEmailTarget;
  markEmailed: typeof markReceiptEmailed;
  renderEmail: typeof renderDonationReceiptEmail;
  renderPdf: typeof renderReceiptPdf;
  send: typeof sendEmail;
}

const defaults: ReceiptEmailDependencies = {
  getSuppression: getEmailSuppression,
  loadTarget: loadReceiptEmailTarget,
  markEmailed: markReceiptEmailed,
  renderEmail: renderDonationReceiptEmail,
  renderPdf: renderReceiptPdf,
  send: sendEmail,
};

/**
 * Emails a receipt's PDF to the donor's current address. The server function
 * checked the same conditions before enqueueing; they are checked again here
 * because the receipt may be voided or the address bounced meanwhile. Skips
 * end the job quietly; a Resend failure throws so pg-boss retries, and the
 * per-request idempotency key keeps a retry from sending twice.
 */
export async function sendContributionReceipt(
  data: SendContributionReceiptPayload,
  deps: ReceiptEmailDependencies = defaults
): Promise<{ outcome: ReceiptEmailOutcome }> {
  const target = await deps.loadTarget(data.receiptId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.voided) {
    return { outcome: "voided" };
  }
  if (!target.email) {
    return { outcome: "no_email" };
  }
  // Donor email follows the notification rule: any bounce or complaint stops it.
  if (await deps.getSuppression(target.email)) {
    return { outcome: "suppressed" };
  }
  const rendered = await deps.renderPdf(data.receiptId);
  if (!rendered) {
    return { outcome: "missing" };
  }
  const { document } = rendered;
  const html = await deps.renderEmail({
    amount: formatPaise(document.gift.amountPaise),
    donorName: document.donor.name,
    number: document.number,
    orgName: document.org.name,
    receivedOn: formatReceiptDate(document.gift.receivedOn),
  });
  const status = await deps.send({
    attachments: [{ content: rendered.pdf, filename: rendered.filename }],
    html,
    idempotencyKey: `receipt-${data.receiptId}-${data.requestId}`,
    subject: `Your donation receipt ${document.number}`,
    to: target.email,
  });
  if (status !== "sent") {
    return { outcome: "not_configured" };
  }
  await deps.markEmailed(data.receiptId, new Date());
  return { outcome: "sent" };
}

export const handleSendContributionReceipt = createNotifyHandler<
  SendContributionReceiptPayload,
  { outcome: ReceiptEmailOutcome }
>(
  "send-contribution-receipt",
  async () => (data) => sendContributionReceipt(data)
);
