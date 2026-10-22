import { loadReceiptDeliveryTarget } from "@pi-dash/db/queries/contribution-receipts";

import { AUTOMATIC_RECEIPT_REQUEST } from "../lib/receipt-delivery";
import { safeReceiptJobError } from "../lib/receipt-errors";
import type { DeliverContributionReceiptPayload } from "../types";
import { createNotifyHandler } from "./create-handler";
import {
  emailReceipt,
  type ReceiptEmailChannel,
  receiptEmailChannel,
} from "./send-contribution-receipt";
import {
  messageReceipt,
  type ReceiptWhatsAppChannel,
  receiptWhatsAppChannel,
} from "./send-contribution-receipt-whatsapp";

export interface ReceiptDeliveryDependencies {
  email: ReceiptEmailChannel;
  loadTarget: typeof loadReceiptDeliveryTarget;
  whatsapp: ReceiptWhatsAppChannel;
}

const defaults: ReceiptDeliveryDependencies = {
  email: receiptEmailChannel,
  loadTarget: loadReceiptDeliveryTarget,
  whatsapp: receiptWhatsAppChannel,
};

/**
 * The automatic delivery of a receipt, queued at issue to start when the
 * cooling-off window ends ("Send now" queues a copy to run at once). It
 * reads the donor's contacts once and applies the rule: email when the
 * donor has an address, else WhatsApp; a suppressed address or an email
 * failure doesn't fall back to WhatsApp. It skips a voided receipt, one
 * whose gift changed donor, and one already emailed or sent on WhatsApp,
 * so a send from finance that went out, or an earlier copy, ends it.
 */
export async function deliverContributionReceipt(
  data: DeliverContributionReceiptPayload,
  deps: ReceiptDeliveryDependencies = defaults
): Promise<{ channel?: "email" | "whatsapp"; outcome: string }> {
  const target = await deps.loadTarget(data.receiptId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.voided) {
    return { outcome: "voided" };
  }
  if (target.donorChanged) {
    await deps.email.recordFailure(data.receiptId, "donor_changed");
    return { outcome: "donor_changed" };
  }
  if (target.delivered) {
    return { outcome: "already_delivered" };
  }
  const receipt = {
    receiptId: data.receiptId,
    requestId: AUTOMATIC_RECEIPT_REQUEST,
  };
  if (target.email) {
    const { outcome } = await emailReceipt(receipt, target.email, deps.email);
    return { channel: "email", outcome };
  }
  if (target.phone) {
    const { outcome } = await messageReceipt(
      receipt,
      target.phone,
      deps.whatsapp
    );
    return { channel: "whatsapp", outcome };
  }
  await deps.email.recordFailure(data.receiptId, "no_contact");
  return { outcome: "no_contact" };
}

export const handleDeliverContributionReceipt = createNotifyHandler(
  "deliver-contribution-receipt",
  async () => async (data: DeliverContributionReceiptPayload) => {
    try {
      return await deliverContributionReceipt(data);
    } catch (error) {
      throw safeReceiptJobError(error, "receipt_delivery_failed");
    }
  }
);
