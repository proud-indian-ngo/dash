import type { ContributionRefundAttention } from "@pi-dash/shared/constants";

/**
 * What recording one provider refund does to a contribution, decided from
 * what is already stored. Pure, so the rules are unit-tested; the query in
 * `queries/razorpay-refunds.ts` reads the inputs and writes the result in
 * one transaction.
 *
 * - The refund's identity seen before with the same fingerprint: nothing.
 * - Seen before with another fingerprint (Razorpay reports another amount):
 *   flag the stored refund, never overwrite it.
 * - New: record it. Once the refunds cover the amount, a pending or
 *   received contribution becomes `refunded`; a receipted one keeps its
 *   status and the refund is flagged; a reversed or already refunded one
 *   only gets the record.
 */

export type RefundPlan =
  | { action: "already_applied" }
  | { action: "flag_changed" }
  | {
      action: "record";
      attention: ContributionRefundAttention | null;
      /** Set when the contribution's status changes. */
      status: "refunded" | null;
    };

export interface RefundPlanInput {
  contribution: { amountPaise: number; status: string };
  /** The stored identity's fingerprint, when the refund was seen before. */
  knownPayloadHash: string | null;
  refund: { amountPaise: number; payloadHash: string };
  /** Sum of the refunds already recorded against the contribution. */
  refundedBeforePaise: number;
}

/** Statuses a full refund turns into `refunded`. */
const REFUNDABLE_STATUSES = new Set(["pending", "received"]);

export function planRefund(input: RefundPlanInput): RefundPlan {
  if (input.knownPayloadHash !== null) {
    return input.knownPayloadHash === input.refund.payloadHash
      ? { action: "already_applied" }
      : { action: "flag_changed" };
  }
  const { amountPaise, status } = input.contribution;
  const covered =
    input.refundedBeforePaise + input.refund.amountPaise >= amountPaise;
  return {
    action: "record",
    attention: status === "receipted" ? "refund_after_receipt" : null,
    status: covered && REFUNDABLE_STATUSES.has(status) ? "refunded" : null,
  };
}
