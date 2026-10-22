import {
  loadReceiptDeliveryTarget,
  markReceiptWhatsAppSent,
  recordReceiptDeliveryFailure,
} from "@pi-dash/db/queries/contribution-receipts";
import { formatPaise } from "@pi-dash/shared/money";
import {
  formatReceiptDate,
  type ReceiptDeliveryFailure,
} from "@pi-dash/shared/receipts";
import { getCloudTemplate, isCloudApiEnabled } from "@pi-dash/whatsapp/cloud";
import {
  sendWhatsAppNotification,
  type WhatsAppSendOutcome,
  whatsappMessageWentOut,
} from "@pi-dash/whatsapp/notify";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import {
  type AutomaticClaim,
  automaticClaim,
  deliverReceipt,
  sendOnce,
} from "../lib/receipt-delivery";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptWhatsAppPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

const RECEIPT_TEMPLATE = "donation_receipt";

interface ReceiptWhatsAppDependencies {
  claims: AutomaticClaim;
  loadTarget: typeof loadReceiptDeliveryTarget;
  markSent: typeof markReceiptWhatsAppSent;
  recordFailure: typeof recordReceiptDeliveryFailure;
  renderPdf: typeof receiptPdf;
  send: typeof sendWhatsAppNotification;
  /** Whether the send logged under this key went out (a `duplicate`). */
  sentBefore: typeof whatsappMessageWentOut;
  /** False while the Cloud API is on and Meta hasn't approved the template. */
  templateReady: () => Promise<boolean>;
}

const defaults: ReceiptWhatsAppDependencies = {
  claims: automaticClaim,
  loadTarget: loadReceiptDeliveryTarget,
  markSent: markReceiptWhatsAppSent,
  recordFailure: recordReceiptDeliveryFailure,
  renderPdf: receiptPdf,
  send: sendWhatsAppNotification,
  sentBefore: whatsappMessageWentOut,
  templateReady: async () =>
    !isCloudApiEnabled() ||
    (await getCloudTemplate(RECEIPT_TEMPLATE))?.status === "APPROVED",
};

const TRANSPORT_FAILURES: Partial<
  Record<WhatsAppSendOutcome, ReceiptDeliveryFailure>
> = {
  no_template: "whatsapp_no_template",
  not_configured: "whatsapp_not_configured",
  rejected: "whatsapp_rejected",
};

/**
 * Sends the receipt's stored PDF on WhatsApp. By the automatic rule
 * (`onlyWithoutEmail`) it goes only when the donor has no email address;
 * finance's explicit send goes regardless. The automatic send goes only if
 * it can claim the receipt (see `sendOnce`), and nothing goes once the
 * gift's donor changed after issue. Outcomes that leave the donor without
 * it are recorded on the receipt.
 */
export async function sendContributionReceiptWhatsApp(
  data: SendContributionReceiptWhatsAppPayload,
  deps: ReceiptWhatsAppDependencies = defaults
) {
  const target = await deps.loadTarget(data.receiptId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.voided) {
    return { outcome: "voided" };
  }
  if (data.onlyWithoutEmail && target.email) {
    return { outcome: "email_available" };
  }
  return await sendOnce(data, deps.claims, () =>
    messageReceipt(data, target.phone, target.donorChanged, deps)
  );
}

async function messageReceipt(
  data: SendContributionReceiptWhatsAppPayload,
  phone: string | null,
  donorChanged: boolean,
  deps: ReceiptWhatsAppDependencies
) {
  if (donorChanged) {
    await deps.recordFailure(data.receiptId, "donor_changed");
    return { outcome: "donor_changed" };
  }
  if (!phone) {
    await deps.recordFailure(
      data.receiptId,
      data.onlyWithoutEmail ? "no_contact" : "no_phone"
    );
    return { outcome: "no_phone" };
  }
  // Checked before the PDF is uploaded to Meta, which would refuse it anyway.
  if (!(await deps.templateReady())) {
    await deps.recordFailure(data.receiptId, "whatsapp_no_template");
    return { outcome: "no_template" };
  }
  const rendered = await deps.renderPdf(data.receiptId);
  if (!rendered) {
    return { outcome: "missing" };
  }
  if (rendered.document.voidedAt) {
    return { outcome: "voided" };
  }
  const { document } = rendered;
  const amount = formatPaise(document.gift.amountPaise);
  const receivedOn = formatReceiptDate(document.gift.receivedOn);
  const idempotencyKey = `receipt-whatsapp-${data.receiptId}-${data.requestId}`;
  const outcome = await deps.send(
    phone,
    {
      template: whatsappTemplate(
        RECEIPT_TEMPLATE,
        { amount, number: document.number, received_on: receivedOn },
        { bytes: new Uint8Array(rendered.pdf), filename: rendered.filename }
      ),
      text: `Thank you for your donation to Proud Indian.\n\nAmount: ${amount}\nReceipt number: ${document.number}\nDate received: ${receivedOn}\n\nYour donation receipt is attached as a PDF.`,
    },
    { idempotencyKey }
  );
  // A retry finds its key already used; record it if that send went out.
  if (
    outcome === "sent" ||
    (outcome === "duplicate" && (await deps.sentBefore(idempotencyKey)))
  ) {
    await deps.markSent(data.receiptId, new Date());
  }
  const failure = TRANSPORT_FAILURES[outcome];
  if (failure) {
    await deps.recordFailure(data.receiptId, failure);
  }
  return { outcome };
}

export const handleSendContributionReceiptWhatsApp = createNotifyHandler(
  "send-contribution-receipt-whatsapp",
  async () => async (data: SendContributionReceiptWhatsAppPayload) =>
    await deliverReceipt(data.receiptId, "whatsapp_failed", () =>
      sendContributionReceiptWhatsApp(data)
    )
);
