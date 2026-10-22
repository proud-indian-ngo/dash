import { recordReceiptDeliveryFailure } from "@pi-dash/db/queries/contribution-receipts";
import type { ReceiptDeliveryFailure } from "@pi-dash/shared/receipts";

import { safeReceiptJobError } from "./receipt-errors";

/** The request ID of the delayed send queued when a receipt is issued automatically. */
export const AUTOMATIC_RECEIPT_REQUEST = "automatic";

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
