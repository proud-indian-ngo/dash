import {
  loadReceiptWhatsAppTarget,
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
} from "@pi-dash/whatsapp/notify";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import {
  AUTOMATIC_RECEIPT_REQUEST,
  deliverReceipt,
} from "../lib/receipt-delivery";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptWhatsAppPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

const RECEIPT_TEMPLATE = "donation_receipt";

interface ReceiptWhatsAppDependencies {
  loadTarget: typeof loadReceiptWhatsAppTarget;
  markSent: typeof markReceiptWhatsAppSent;
  recordFailure: typeof recordReceiptDeliveryFailure;
  renderPdf: typeof receiptPdf;
  send: typeof sendWhatsAppNotification;
  /** False while the Cloud API is on and Meta hasn't approved the template. */
  templateReady: () => Promise<boolean>;
}

const defaults: ReceiptWhatsAppDependencies = {
  loadTarget: loadReceiptWhatsAppTarget,
  markSent: markReceiptWhatsAppSent,
  recordFailure: recordReceiptDeliveryFailure,
  renderPdf: receiptPdf,
  send: sendWhatsAppNotification,
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
 * finance's explicit send goes regardless. The automatic send is skipped
 * once the receipt was delivered by hand. Outcomes that leave the donor
 * without it are recorded on the receipt.
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
  if (data.requestId === AUTOMATIC_RECEIPT_REQUEST && target.delivered) {
    return { outcome: "already_delivered" };
  }
  if (data.onlyWithoutEmail && target.email) {
    return { outcome: "email_available" };
  }
  if (!target.phone) {
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
  const outcome = await deps.send(
    target.phone,
    {
      template: whatsappTemplate(
        RECEIPT_TEMPLATE,
        { amount, number: document.number, received_on: receivedOn },
        { bytes: new Uint8Array(rendered.pdf), filename: rendered.filename }
      ),
      text: `Thank you for your donation to Proud Indian.\n\nAmount: ${amount}\nReceipt number: ${document.number}\nDate received: ${receivedOn}\n\nYour donation receipt is attached as a PDF.`,
    },
    { idempotencyKey: `receipt-whatsapp-${data.receiptId}-${data.requestId}` }
  );
  if (outcome === "sent") {
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
