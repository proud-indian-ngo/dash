import type { recordReceiptDeliveryFailure } from "@pi-dash/db/queries/contribution-receipts";
import type { ReceiptDeliveryFailure } from "@pi-dash/shared/receipts";

/**
 * The request ID of the automatic delivery, in the email and WhatsApp
 * idempotency keys: the delayed job and a "Send now" copy share it.
 */
export const AUTOMATIC_RECEIPT_REQUEST = "automatic";

/**
 * Records a thrown send as failed for finance to see before the job
 * rethrows for a retry; a later send that goes clears it. Recording must
 * not hide the send's own error.
 */
export async function recordThrownSend(
  record: typeof recordReceiptDeliveryFailure,
  receiptId: string,
  failure: Extract<ReceiptDeliveryFailure, "email_failed" | "whatsapp_failed">
): Promise<void> {
  await record(receiptId, failure).catch(() => undefined);
}
