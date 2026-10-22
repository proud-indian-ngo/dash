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
  whatsappMessageStatus,
} from "@pi-dash/whatsapp/notify";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { recordThrownSend } from "../lib/receipt-delivery";
import { safeReceiptJobError } from "../lib/receipt-errors";
import { receiptPdf } from "../lib/receipt-pdf";
import type { SendContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";

const RECEIPT_TEMPLATE = "donation_receipt";

/** What sending a receipt to a phone on WhatsApp needs. */
export interface ReceiptWhatsAppChannel {
  markSent: typeof markReceiptWhatsAppSent;
  recordFailure: typeof recordReceiptDeliveryFailure;
  renderPdf: typeof receiptPdf;
  send: typeof sendWhatsAppNotification;
  /** How the send logged under this key fared (after a `duplicate`). */
  loggedStatus: typeof whatsappMessageStatus;
  /** False while the Cloud API is on and Meta hasn't approved the template. */
  templateReady: () => Promise<boolean>;
}

export const receiptWhatsAppChannel: ReceiptWhatsAppChannel = {
  markSent: markReceiptWhatsAppSent,
  recordFailure: recordReceiptDeliveryFailure,
  renderPdf: receiptPdf,
  send: sendWhatsAppNotification,
  loggedStatus: whatsappMessageStatus,
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
 * Sends the receipt's stored PDF to `phone` on WhatsApp. Outcomes that
 * leave the donor without it are recorded on the receipt; a thrown send is
 * recorded and rethrown for a retry.
 */
export async function messageReceipt(
  receipt: { receiptId: string; requestId: string },
  phone: string,
  channel: ReceiptWhatsAppChannel
): Promise<{ outcome: string }> {
  const { receiptId, requestId } = receipt;
  try {
    // Checked before the PDF is uploaded to Meta, which would refuse it anyway.
    if (!(await channel.templateReady())) {
      await channel.recordFailure(receiptId, "whatsapp_no_template");
      return { outcome: "no_template" };
    }
    const rendered = await channel.renderPdf(receiptId);
    if (!rendered) {
      return { outcome: "missing" };
    }
    if (rendered.document.voidedAt) {
      return { outcome: "voided" };
    }
    const { document } = rendered;
    const amount = formatPaise(document.gift.amountPaise);
    const receivedOn = formatReceiptDate(document.gift.receivedOn);
    const idempotencyKey = `receipt-whatsapp-${receiptId}-${requestId}`;
    const outcome = await channel.send(
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
    if (outcome === "duplicate") {
      return await settleDuplicate(receiptId, idempotencyKey, channel);
    }
    if (outcome === "sent") {
      await channel.markSent(receiptId, new Date());
    }
    const failure = TRANSPORT_FAILURES[outcome];
    if (failure) {
      await channel.recordFailure(receiptId, failure);
    }
    return { outcome };
  } catch (error) {
    await recordThrownSend(channel.recordFailure, receiptId, "whatsapp_failed");
    throw error;
  }
}

/**
 * The key was used before: a retry, or the delayed automatic copy after a
 * "Send now" copy. Settled by how that send fared. One Meta refused stays
 * refused under this key, so the automatic send isn't tried again; finance
 * uses "Send on WhatsApp", which sends under a new key.
 */
async function settleDuplicate(
  receiptId: string,
  idempotencyKey: string,
  channel: ReceiptWhatsAppChannel
): Promise<{ outcome: string }> {
  const status = await channel.loggedStatus(idempotencyKey);
  if (status === "failed") {
    await channel.recordFailure(receiptId, "whatsapp_rejected");
    return { outcome: "already_rejected" };
  }
  if (status === "sent" || status === "delivered" || status === "read") {
    await channel.markSent(receiptId, new Date());
    return { outcome: "already_sent" };
  }
  // Another attempt holds the key and is still sending.
  return { outcome: "duplicate" };
}

export interface ReceiptWhatsAppDependencies extends ReceiptWhatsAppChannel {
  loadTarget: typeof loadReceiptDeliveryTarget;
}

/**
 * Finance's "Send on WhatsApp": goes even when the donor has an email
 * address, whatever was sent before.
 */
export async function sendContributionReceiptWhatsApp(
  data: SendContributionReceiptPayload,
  deps: ReceiptWhatsAppDependencies = {
    ...receiptWhatsAppChannel,
    loadTarget: loadReceiptDeliveryTarget,
  }
): Promise<{ outcome: string }> {
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
  if (!target.phone) {
    await deps.recordFailure(data.receiptId, "no_phone");
    return { outcome: "no_phone" };
  }
  return await messageReceipt(data, target.phone, deps);
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
