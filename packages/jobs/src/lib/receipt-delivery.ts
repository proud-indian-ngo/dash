import {
  claimAutomaticReceiptSend,
  recordReceiptDeliveryFailure,
  releaseAutomaticReceiptSend,
} from "@pi-dash/db/queries/contribution-receipts";
import type { ReceiptDeliveryFailure } from "@pi-dash/shared/receipts";

import { safeReceiptJobError } from "./receipt-errors";

/** The request ID of the delayed send queued when a receipt is issued automatically. */
export const AUTOMATIC_RECEIPT_REQUEST = "automatic";

export interface AutomaticClaim {
  claim: typeof claimAutomaticReceiptSend;
  release: typeof releaseAutomaticReceiptSend;
}

export const automaticClaim: AutomaticClaim = {
  claim: claimAutomaticReceiptSend,
  release: releaseAutomaticReceiptSend,
};

/**
 * Runs a send. The automatic one first claims the receipt's automatic send
 * (`not_due` when finance already sent or cancelled it, or it was
 * delivered), and hands the claim back if the send throws so the retry can
 * take it. Finance's sends always run.
 */
export async function sendOnce<T>(
  data: { receiptId: string; requestId: string },
  claims: AutomaticClaim,
  send: () => Promise<T>
): Promise<T | { outcome: "not_due" }> {
  if (data.requestId !== AUTOMATIC_RECEIPT_REQUEST) {
    return await send();
  }
  const dueAt = await claims.claim(data.receiptId);
  if (!dueAt) {
    return { outcome: "not_due" };
  }
  try {
    return await send();
  } catch (error) {
    await claims.release(data.receiptId, dueAt);
    throw error;
  }
}

/**
 * Runs one delivery attempt. A thrown send is recorded as failed for
 * finance to see, then rethrown stripped of donor details so pg-boss
 * retries it; a later success clears the record.
 */
export async function deliverReceipt<T>(
  receiptId: string,
  failure: Extract<ReceiptDeliveryFailure, "email_failed" | "whatsapp_failed">,
  send: () => Promise<T>
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    await recordReceiptDeliveryFailure(receiptId, failure).catch(
      () => undefined
    );
    throw safeReceiptJobError(error, `receipt_${failure}`);
  }
}
