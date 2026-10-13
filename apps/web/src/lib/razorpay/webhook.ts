import { createHmac, timingSafeEqual } from "node:crypto";

import { type RazorpayPayment, razorpayPaymentSchema } from "./payment";

/**
 * Server-only. Verifying a Razorpay webhook delivery and deciding what it
 * asks for. Pure, so the route stays thin and both are unit-tested.
 */

const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;

/**
 * `X-Razorpay-Signature` is the hex HMAC-SHA256 of the raw body with the
 * webhook secret. Compared in constant time; a missing or malformed header
 * fails.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!(signature && HEX_SIGNATURE.test(signature))) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Events that carry a captured payment to record. */
const PAYMENT_EVENTS = new Set(["payment.captured", "order.paid"]);
/** Refunds arrive in the next layer; until then they are acknowledged and logged. */
const REFUND_EVENTS = new Set([
  "refund.created",
  "refund.failed",
  "refund.processed",
  "refund.speed_changed",
]);

export type WebhookAction =
  | { action: "stage"; event: string; payment: RazorpayPayment }
  | {
      action: "ignore";
      event: string;
      paymentId: string | null;
      reason:
        | "malformed_payment"
        | "not_captured"
        | "refund_not_handled_yet"
        | "unhandled_event";
    };

const paymentIdOf = (body: unknown): string | null => {
  const id = (
    body as {
      payload?: { payment?: { entity?: { id?: unknown } } };
    } | null
  )?.payload?.payment?.entity?.id;
  return typeof id === "string" ? id : null;
};

/**
 * What a verified delivery asks for. `payment.captured` and `order.paid`
 * stage their payment; everything else, including `payment.failed` (a
 * capture can still follow) and refunds, is acknowledged and ignored.
 */
export function routeRazorpayEvent(body: unknown): WebhookAction {
  const event =
    typeof (body as { event?: unknown } | null)?.event === "string"
      ? (body as { event: string }).event
      : "";
  const paymentId = paymentIdOf(body);
  if (REFUND_EVENTS.has(event)) {
    return {
      action: "ignore",
      event,
      paymentId,
      reason: "refund_not_handled_yet",
    };
  }
  if (!PAYMENT_EVENTS.has(event)) {
    return { action: "ignore", event, paymentId, reason: "unhandled_event" };
  }
  const parsed = razorpayPaymentSchema.safeParse(
    (body as { payload?: { payment?: { entity?: unknown } } }).payload?.payment
      ?.entity
  );
  if (!parsed.success) {
    return { action: "ignore", event, paymentId, reason: "malformed_payment" };
  }
  if (parsed.data.status !== "captured") {
    return { action: "ignore", event, paymentId, reason: "not_captured" };
  }
  return { action: "stage", event, payment: parsed.data };
}
