import { loadReceiptWhatsAppTarget } from "@pi-dash/db/queries/contribution-receipts";
import { formatPaise } from "@pi-dash/shared/money";
import { formatReceiptDate } from "@pi-dash/shared/receipts";
import { sendWhatsAppNotification } from "@pi-dash/whatsapp/notify";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { safeReceiptJobError } from "../lib/receipt-errors";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

interface ReceiptWhatsAppDependencies {
  loadTarget: typeof loadReceiptWhatsAppTarget;
  renderPdf: typeof receiptPdf;
  send: typeof sendWhatsAppNotification;
}

const defaults: ReceiptWhatsAppDependencies = {
  loadTarget: loadReceiptWhatsAppTarget,
  renderPdf: receiptPdf,
  send: sendWhatsAppNotification,
};

/** WhatsApp is used only when the donor has no email address. */
export async function sendContributionReceiptWhatsApp(
  data: SendContributionReceiptPayload,
  deps: ReceiptWhatsAppDependencies = defaults
) {
  const target = await deps.loadTarget(data.receiptId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.voided) {
    return { outcome: "voided" };
  }
  if (target.email) {
    return { outcome: "email_available" };
  }
  if (!target.phone) {
    return { outcome: "no_phone" };
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
        "donation_receipt",
        { amount, number: document.number, received_on: receivedOn },
        { bytes: new Uint8Array(rendered.pdf), filename: rendered.filename }
      ),
      text: `Thank you for your donation to Proud Indian.\n\nAmount: ${amount}\nReceipt number: ${document.number}\nDate received: ${receivedOn}\n\nYour donation receipt is attached as a PDF.`,
    },
    { idempotencyKey: `receipt-whatsapp-${data.receiptId}-${data.requestId}` }
  );
  return { outcome };
}

export const handleSendContributionReceiptWhatsApp = createNotifyHandler(
  "send-contribution-receipt-whatsapp",
  async () => async (data: SendContributionReceiptPayload) => {
    try {
      return await sendContributionReceiptWhatsApp(data);
    } catch (error) {
      throw safeReceiptJobError(error, "receipt_whatsapp_failed");
    }
  }
);
