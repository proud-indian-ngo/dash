import { createHmac, timingSafeEqual } from "node:crypto";

import { type RazorpayPayment, razorpayPaymentSchema } from "./payment";

/**
 * Server-only. Verifying a Razorpay webhook delivery and deciding what it
 * asks for. Pure, so the route stays thin and both are unit-tested.
 */

const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;
const PAYMENT_ID = /^pay_\w{1,40}$/;

/** Razorpay's deliveries are a few kilobytes; anything over this is refused. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export type WebhookBody =
  | { ok: true; text: string }
  | { ok: false; reason: "timeout" | "too_large" };

/**
 * Reads the raw body, refusing it as soon as it passes `maxBytes`: at once
 * when Content-Length says so, else while streaming, so an oversized or
 * endless body is never buffered. A body that stalls past `timeoutMs` is
 * abandoned and the stream cancelled. The timer is always cleared.
 */
export async function readWebhookBody(
  request: Request,
  { maxBytes = MAX_WEBHOOK_BODY_BYTES, timeoutMs = 3000 } = {}
): Promise<WebhookBody> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) {
    return { ok: true, text: "" };
  }
  const reader = request.body.getReader();
  const stop = () => {
    reader.cancel().catch(() => undefined);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), timedOut]);
      if (next === "timeout") {
        stop();
        return { ok: false, reason: "timeout" };
      }
      if (next.done) {
        break;
      }
      size += next.value.byteLength;
      if (size > maxBytes) {
        stop();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(next.value);
    }
  } finally {
    clearTimeout(timer);
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

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
  /** The payment could not be read, but its ID could: the job fetches it from the API. */
  | { action: "fetch"; event: string; paymentId: string }
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
 * stage their payment; one pi-dash cannot read is fetched by ID when the
 * API key secret is set (`canFetch`), and otherwise ignored. Everything
 * else, including `payment.failed` (a capture can still follow) and
 * refunds, is acknowledged and ignored.
 */
export function routeRazorpayEvent(
  body: unknown,
  canFetch = false
): WebhookAction {
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
    return canFetch && paymentId && PAYMENT_ID.test(paymentId)
      ? { action: "fetch", event, paymentId }
      : { action: "ignore", event, paymentId, reason: "malformed_payment" };
  }
  if (parsed.data.status !== "captured") {
    return { action: "ignore", event, paymentId, reason: "not_captured" };
  }
  return { action: "stage", event, payment: parsed.data };
}
