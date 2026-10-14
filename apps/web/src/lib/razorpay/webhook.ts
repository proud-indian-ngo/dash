import { createHmac, timingSafeEqual } from "node:crypto";

import {
  isCapturedPayment,
  type RazorpayPayment,
  razorpayPaymentSchema,
} from "./payment";
import { REFUND_ID, razorpayRefundSchema } from "./refund-schema";
import { SETTLEMENT_ID } from "./settlement-schema";

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
  | { ok: false; reason: "aborted" | "timeout" | "too_large" };

/**
 * Reads the raw body, refusing it as soon as it passes `maxBytes`: at once
 * when Content-Length says so, else while streaming, so an oversized or
 * endless body is never buffered. A body that stalls past `timeoutMs` is
 * abandoned and the stream cancelled. A read that fails (the client
 * aborted) is `aborted`. The timer is always cleared.
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
      const next = await Promise.race([
        reader.read().catch(() => "aborted" as const),
        timedOut,
      ]);
      if (next === "aborted") {
        stop();
        return { ok: false, reason: "aborted" };
      }
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
/** Only a processed refund gives money back; the others are acknowledged and logged. */
const REFUND_PROCESSED = "refund.processed";
const OTHER_REFUND_EVENTS = new Set([
  "refund.created",
  "refund.failed",
  "refund.speed_changed",
]);
/** A payout to the bank; recorded only with the key secret, which lists its lines. */
const SETTLEMENT_PROCESSED = "settlement.processed";

/** The verified webhook's copy of a refund: amount, time and status only. */
export interface RefundCopy {
  amount: number;
  createdAt: number;
  currency: string;
  status: string;
}

export type WebhookAction =
  | { action: "stage"; event: string; payment: RazorpayPayment }
  /** The payment could not be read, but its ID could: the job fetches it from the API. */
  | { action: "fetch"; event: string; paymentId: string }
  /** A processed refund to apply; without a readable copy the job fetches it. */
  | {
      action: "refund";
      copy: RefundCopy | null;
      event: string;
      paymentId: string;
      refundId: string;
    }
  /** A processed settlement; the job fetches it and the lines it covered. */
  | { action: "settlement"; event: string; settlementId: string }
  | {
      action: "ignore";
      event: string;
      paymentId: string | null;
      reason:
        | "malformed_payment"
        | "malformed_refund"
        | "malformed_settlement"
        | "not_captured"
        | "refund_not_processed"
        | "settlements_need_key_secret"
        | "unhandled_event";
      settlementId?: string;
    };

const paymentIdOf = (body: unknown): string | null => {
  const id = (
    body as {
      payload?: { payment?: { entity?: { id?: unknown } } };
    } | null
  )?.payload?.payment?.entity?.id;
  return typeof id === "string" ? id : null;
};

interface RefundIds {
  paymentId: string | null;
  refundId: string | null;
}

const refundIdsOf = (body: unknown): RefundIds => {
  const entity = (
    body as {
      payload?: {
        refund?: { entity?: { id?: unknown; payment_id?: unknown } };
      };
    } | null
  )?.payload?.refund?.entity;
  return {
    paymentId:
      typeof entity?.payment_id === "string" ? entity.payment_id : null,
    refundId: typeof entity?.id === "string" ? entity.id : null,
  };
};

/**
 * A `refund.processed` delivery: the refund with its copy, or, when the copy
 * cannot be read but its IDs can, the IDs alone for the job to fetch (only
 * with the API key secret).
 */
function routeRefund(
  body: unknown,
  event: string,
  canFetch: boolean
): WebhookAction {
  const parsed = razorpayRefundSchema.safeParse(
    (body as { payload?: { refund?: { entity?: unknown } } }).payload?.refund
      ?.entity
  );
  if (parsed.success) {
    return {
      action: "refund",
      copy: {
        amount: parsed.data.amount,
        createdAt: parsed.data.created_at,
        currency: parsed.data.currency,
        status: parsed.data.status,
      },
      event,
      paymentId: parsed.data.payment_id,
      refundId: parsed.data.id,
    };
  }
  const ids = refundIdsOf(body);
  if (
    canFetch &&
    ids.refundId &&
    REFUND_ID.test(ids.refundId) &&
    ids.paymentId &&
    PAYMENT_ID.test(ids.paymentId)
  ) {
    return {
      action: "refund",
      copy: null,
      event,
      paymentId: ids.paymentId,
      refundId: ids.refundId,
    };
  }
  return {
    action: "ignore",
    event,
    paymentId: ids.paymentId,
    reason: "malformed_refund",
  };
}

/**
 * A `settlement.processed` delivery: its settlement ID for the job to
 * fetch. Without the key secret the settlement's lines cannot be listed,
 * so it is acknowledged and not recorded.
 */
function routeSettlement(
  body: unknown,
  event: string,
  canFetch: boolean
): WebhookAction {
  const id = (
    body as {
      payload?: { settlement?: { entity?: { id?: unknown } } };
    } | null
  )?.payload?.settlement?.entity?.id;
  if (!(typeof id === "string" && SETTLEMENT_ID.test(id))) {
    return {
      action: "ignore",
      event,
      paymentId: null,
      reason: "malformed_settlement",
    };
  }
  if (!canFetch) {
    return {
      action: "ignore",
      event,
      paymentId: null,
      reason: "settlements_need_key_secret",
      settlementId: id,
    };
  }
  return { action: "settlement", event, settlementId: id };
}

/**
 * What a verified delivery asks for. `payment.captured` and `order.paid`
 * stage their payment; one pi-dash cannot read is fetched by ID when the
 * API key secret is set (`canFetch`), and otherwise ignored.
 * `refund.processed` queues its refund, and `settlement.processed` (key
 * secret only) its settlement. Everything else, including
 * `payment.failed` (a capture can still follow) and the other refund
 * events, is acknowledged and ignored.
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
  if (event === REFUND_PROCESSED) {
    return routeRefund(body, event, canFetch);
  }
  if (event === SETTLEMENT_PROCESSED) {
    return routeSettlement(body, event, canFetch);
  }
  if (OTHER_REFUND_EVENTS.has(event)) {
    return {
      action: "ignore",
      event,
      paymentId: paymentId ?? refundIdsOf(body).paymentId,
      reason: "refund_not_processed",
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
  if (!isCapturedPayment(parsed.data)) {
    return { action: "ignore", event, paymentId, reason: "not_captured" };
  }
  return { action: "stage", event, payment: parsed.data };
}
