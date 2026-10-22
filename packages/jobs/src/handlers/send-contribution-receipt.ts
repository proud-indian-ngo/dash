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

import {
  type AutomaticClaim,
  automaticClaim,
  deliverReceipt,
  sendOnce,
} from "../lib/receipt-delivery";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

export type ReceiptEmailOutcome =
  | "sent"
  | "already_sent"
  | "not_due"
  | "donor_changed"
  | "not_configured"
  | "missing"
  | "voided"
  | "no_email"
  | "suppressed";

export interface ReceiptEmailDependencies {
  claims: AutomaticClaim;
  getSuppression: typeof getEmailSuppression;
  loadTarget: typeof loadReceiptDeliveryTarget;
  markEmailed: typeof markReceiptEmailed;
  recordFailure: typeof recordReceiptDeliveryFailure;
  renderEmail: typeof renderDonationReceiptEmail;
  renderPdf: typeof receiptPdf;
  send: typeof sendEmail;
}

const defaults: ReceiptEmailDependencies = {
  claims: automaticClaim,
  getSuppression: getEmailSuppression,
  loadTarget: loadReceiptDeliveryTarget,
  markEmailed: markReceiptEmailed,
  recordFailure: recordReceiptDeliveryFailure,
  renderEmail: renderDonationReceiptEmail,
  renderPdf: receiptPdf,
  send: sendEmail,
};

/**
 * Emails a receipt's PDF to the donor's current address. The server function
 * checked the same conditions before enqueueing; they are checked again here
 * because the receipt may be voided or the address bounced meanwhile. The
 * automatic send goes only if it can claim the receipt (see `sendOnce`),
 * and nothing goes once the gift's donor changed after issue. A
 * suppressed address or missing email setup is recorded on the receipt as
 * not sent; a Resend failure throws so pg-boss retries, and the per-request
 * idempotency key keeps a retry from sending twice.
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
  // Without an address the WhatsApp job decides; finance can't ask for it.
  const { email } = target;
  if (!email) {
    return { outcome: "no_email" };
  }
  return await sendOnce(data, deps.claims, () =>
    emailReceipt(data, email, target.donorChanged, deps)
  );
}

async function emailReceipt(
  data: SendContributionReceiptPayload,
  email: string,
  donorChanged: boolean,
  deps: ReceiptEmailDependencies
): Promise<{ outcome: ReceiptEmailOutcome }> {
  if (donorChanged) {
    await deps.recordFailure(data.receiptId, "donor_changed");
    return { outcome: "donor_changed" };
  }
  // Donor email follows the notification rule: any bounce or complaint stops it.
  if (await deps.getSuppression(email)) {
    await deps.recordFailure(data.receiptId, "email_suppressed");
    return { outcome: "suppressed" };
  }
  const rendered = await deps.renderPdf(data.receiptId);
  if (!rendered) {
    return { outcome: "missing" };
  }
  const { document } = rendered;
  if (document.voidedAt) {
    return { outcome: "voided" };
  }
  const html = await deps.renderEmail({
    amount: formatPaise(document.gift.amountPaise),
    donorName: document.donor.name,
    number: document.number,
    orgName: document.org.name,
    receivedOn: formatReceiptDate(document.gift.receivedOn),
  });
  let result: Awaited<ReturnType<typeof deps.send>>;
  try {
    result = await deps.send({
      attachments: [{ content: rendered.pdf, filename: rendered.filename }],
      html,
      idempotencyKey: `receipt-${data.receiptId}-${data.requestId}`,
      subject: `Your donation receipt ${document.number}`,
      to: email,
    });
  } catch (error) {
    // Resend answers 409 when this idempotency key was already used: the
    // retry's email went out on an earlier attempt (the PDF is byte-for-byte
    // the same), so record it as sent rather than failing the job.
    if (error instanceof EmailSendError && error.statusCode === 409) {
      await deps.markEmailed(data.receiptId, new Date());
      return { outcome: "already_sent" };
    }
    throw error;
  }
  if (result.status !== "sent") {
    await deps.recordFailure(data.receiptId, "email_not_configured");
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
  async () => async (data) =>
    await deliverReceipt(data.receiptId, "email_failed", () =>
      sendContributionReceipt(data)
    )
);
