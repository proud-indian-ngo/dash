import {
  applyRazorpayRefund,
  holdRazorpayRefund,
  type RefundApplyResult,
  type RefundToApply,
} from "@pi-dash/db/queries/razorpay-refunds";
import type { RazorpaySyncRefundPayload } from "@pi-dash/jobs/types";

import { createRazorpayClient, type RazorpayClient } from "./api";
import type { RazorpaySetup } from "./config";
import type { RazorpayMode } from "./payment";
import {
  type RazorpayRefund,
  razorpayRefundSchema,
  refundDayOf,
  refundPayloadHash,
} from "./refund-schema";

/**
 * Server-only. Applying Razorpay refunds to the contributions their payments
 * became. Only `processed` refunds count. A refund whose payment is not a
 * contribution yet (still queued, or waiting for review) is held in
 * `private.pending_refund` and applied by the transaction that imports or
 * links the payment; nothing has to retry for it. With the key secret, a
 * payment synced or reconciled that Razorpay reports as refunded also has
 * its refunds fetched and applied.
 */

export type RefundOutcome = RefundApplyResult | "not_processed";

export interface RefundDeps {
  apply: typeof applyRazorpayRefund;
  client: (key: { id: string; secret: string }) => RazorpayClient;
}

const REFUND_DEPS: RefundDeps = {
  apply: applyRazorpayRefund,
  client: (key) => createRazorpayClient(key),
};

const toApply = (
  refund: RazorpayRefund,
  mode: RazorpayMode
): RefundToApply => ({
  amountPaise: refund.amount,
  currency: refund.currency,
  mode,
  paymentId: refund.payment_id,
  payloadHash: refundPayloadHash(refund),
  refundedAt: new Date(refund.created_at * 1000),
  refundedOn: refundDayOf(refund),
  refundId: refund.id,
});

/**
 * Keeps the verified webhook copy of a processed refund until it is
 * recorded, before its job is queued; another status is not kept.
 */
export async function holdWebhookRefund(
  refund: {
    copy: {
      amount: number;
      createdAt: number;
      currency: string;
      status: string;
    };
    paymentId: string;
    refundId: string;
  },
  mode: RazorpayMode,
  hold: typeof holdRazorpayRefund = holdRazorpayRefund
): Promise<boolean> {
  const parsed = razorpayRefundSchema.safeParse({
    amount: refund.copy.amount,
    created_at: refund.copy.createdAt,
    currency: refund.copy.currency,
    id: refund.refundId,
    payment_id: refund.paymentId,
    status: refund.copy.status,
  });
  if (!(parsed.success && parsed.data.status === "processed")) {
    return false;
  }
  await hold(toApply(parsed.data, mode));
  return true;
}

/** Records one refund Razorpay reported, if it is processed. */
export async function applyRefund(
  refund: RazorpayRefund,
  mode: RazorpayMode,
  apply: RefundDeps["apply"] = REFUND_DEPS.apply
): Promise<RefundOutcome> {
  if (refund.status !== "processed") {
    return "not_processed";
  }
  const outcome = await apply(toApply(refund, mode));
  return outcome.result;
}

export interface RefundTally {
  applied: number;
  changed: number;
  waiting: number;
}

export const emptyRefundTally = (): RefundTally => ({
  applied: 0,
  changed: 0,
  waiting: 0,
});

/** Adds one refund's outcome to a tally. */
export function tallyRefund(tally: RefundTally, outcome: RefundOutcome): void {
  if (outcome === "applied") {
    tally.applied += 1;
  } else if (outcome === "amount_changed") {
    tally.changed += 1;
  } else if (outcome === "payment_not_imported") {
    tally.waiting += 1;
  }
}

/**
 * Applies every refund of one payment, read from the API. Called once the
 * payment is a contribution and Razorpay says some of it was refunded.
 */
export async function applyPaymentRefunds(
  paymentId: string,
  client: RazorpayClient,
  mode: RazorpayMode,
  apply: RefundDeps["apply"] = REFUND_DEPS.apply
): Promise<RefundTally> {
  const tally = emptyRefundTally();
  const { items } = await client.listPaymentRefunds(paymentId);
  for (const refund of items) {
    tallyRefund(tally, await applyRefund(refund, mode, apply));
  }
  return tally;
}

/**
 * Thrown so pg-boss retries a refund the webhook said was processed but the
 * API does not show as processed yet.
 */
export class RefundNotProcessedError extends Error {
  constructor() {
    super("The refund is not processed at Razorpay yet");
    this.name = "RefundNotProcessedError";
  }
}

export type RefundSyncOutcome =
  | RefundOutcome
  | "disabled"
  | "not_found"
  | "test_mode_refused";

/** The verified webhook copy carried in the job, as a refund entity. */
function refundFromCopy(
  input: RazorpaySyncRefundPayload
): RazorpayRefund | null {
  if (!input.copy) {
    return null;
  }
  const parsed = razorpayRefundSchema.safeParse({
    amount: input.copy.amount,
    created_at: input.copy.createdAt,
    currency: input.copy.currency,
    id: input.refundId,
    payment_id: input.paymentId,
    status: input.copy.status,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The `razorpay-sync-refund` job, queued by a `refund.processed` webhook.
 * With the key secret the refund is fetched from Razorpay, the source of
 * truth; one the API does not show as processed yet throws
 * `RefundNotProcessedError` so the job retries. Without the secret the
 * verified webhook copy in the job is used. A refund whose payment is not
 * imported yet is held for it (`payment_not_imported`) and the job ends. A
 * test key on a production server records nothing.
 */
export async function syncRazorpayRefund(
  input: RazorpaySyncRefundPayload,
  setup: RazorpaySetup,
  deps: RefundDeps = REFUND_DEPS
): Promise<RefundSyncOutcome> {
  if (!setup.enabled) {
    return "disabled";
  }
  if (setup.testInProduction) {
    return "test_mode_refused";
  }
  const refund = setup.apiKey
    ? await deps.client(setup.apiKey).fetchRefund(input.refundId)
    : refundFromCopy(input);
  if (!refund) {
    return "not_found";
  }
  if (refund.status !== "processed" && setup.apiKey) {
    throw new RefundNotProcessedError();
  }
  // A copy that is not processed is `not_processed` and records nothing.
  return await applyRefund(refund, setup.mode, deps.apply);
}
