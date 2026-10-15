import { refundPayloadHashInput } from "@pi-dash/db/import-hash";
import z from "zod";

import { keyedHash } from "@/lib/income-import/identity";

import { istDayOf } from "./payment";

/**
 * Server-only (node:crypto). A Razorpay refund as pi-dash reads it: IDs,
 * amount, currency, time and status only. Acquirer details (ARN, RRN) and
 * notes are never read.
 */

export const REFUND_ID = /^rfnd_\w{1,40}$/;

export const razorpayRefundSchema = z.object({
  amount: z.number().int().positive(),
  created_at: z.number().int(),
  currency: z.string(),
  id: z.string().regex(REFUND_ID),
  payment_id: z.string().regex(/^pay_\w+$/),
  /** Only `processed` refunds are recorded. */
  status: z.string(),
});
export type RazorpayRefund = z.infer<typeof razorpayRefundSchema>;

/**
 * Fingerprint of what Razorpay said about the refund: the same refund seen
 * again with another amount (or for another payment) is flagged, never
 * written over.
 */
export function refundPayloadHash(refund: RazorpayRefund): string {
  return keyedHash(
    "razorpay-refund",
    refundPayloadHashInput({
      amountPaise: refund.amount,
      currency: refund.currency,
      paymentId: refund.payment_id,
      refundId: refund.id,
    })
  );
}

/** India date the refund was made, as recorded on the contribution. */
export const refundDayOf = (refund: RazorpayRefund) =>
  istDayOf(refund.created_at);
