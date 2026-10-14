import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";

import { type RazorpaySetup, razorpaySetup } from "./config";
import { parseRazorpayBatchKey } from "./payment";

/**
 * Server-only. After a reviewer imports Razorpay payments, their refunds
 * still need applying: a refund that arrived while its payment waited for
 * review found no contribution. With the API key secret, each imported
 * payment's sync job is queued again (keyed by payment ID); it finds the
 * payment already decided, and applies its refunds when Razorpay says some
 * of it was refunded. Without the key secret the refund jobs' own retries
 * apply them.
 */
export function queueRefundChecks(
  batchKey: string,
  paymentIds: readonly string[],
  setup: RazorpaySetup = razorpaySetup(),
  queue: (payload: { day: string; paymentId: string }) => Promise<unknown> = (
    payload
  ) =>
    enqueue("razorpay-sync-payment", payload, {
      singletonKey: payload.paymentId,
    })
): number {
  const key = parseRazorpayBatchKey(batchKey);
  if (
    !(key && setup.enabled && setup.apiKey && !setup.testInProduction) ||
    key.mode !== setup.mode
  ) {
    return 0;
  }
  for (const paymentId of paymentIds) {
    withFireAndForgetLog(
      { event: "razorpay_refund_check_queued", paymentId },
      async () => {
        await queue({ day: key.day, paymentId });
      }
    );
  }
  return paymentIds.length;
}
