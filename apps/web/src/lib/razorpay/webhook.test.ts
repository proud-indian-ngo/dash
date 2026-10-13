import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import {
  readWebhookBody,
  routeRazorpayEvent,
  verifyRazorpaySignature,
} from "./webhook";

const SECRET = "whsec-test";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

const payment = (overrides: Record<string, unknown> = {}) => ({
  amount: 50_000,
  contact: "+919876543210",
  created_at: 1_791_900_000,
  currency: "INR",
  email: "asha@example.test",
  fee: 1180,
  id: "pay_Test0001",
  notes: { name: "Asha Rao" },
  status: "captured",
  tax: 180,
  ...overrides,
});

const event = (name: string, entity: unknown = payment()) => ({
  entity: "event",
  event: name,
  payload: { payment: { entity } },
});

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify(event("payment.captured"));

  it("accepts the hex HMAC-SHA256 of the raw body", () => {
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
    expect(
      verifyRazorpaySignature(body, sign(body).toUpperCase(), SECRET)
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyRazorpaySignature(`${body} `, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyRazorpaySignature(body, sign(body, "other"), SECRET)).toBe(
      false
    );
  });

  it("rejects a missing, short or non-hex header", () => {
    expect(verifyRazorpaySignature(body, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, "", SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, sign(body).slice(2), SECRET)).toBe(
      false
    );
    expect(
      verifyRazorpaySignature(body, `zz${sign(body).slice(2)}`, SECRET)
    ).toBe(false);
  });
});

describe("routeRazorpayEvent", () => {
  it("stages the captured payment of payment.captured and order.paid", () => {
    for (const name of ["payment.captured", "order.paid"]) {
      const action = routeRazorpayEvent(event(name));
      expect(action.action).toBe("stage");
      if (action.action === "stage") {
        expect(action.payment.id).toBe("pay_Test0001");
        expect(action.event).toBe(name);
      }
    }
  });

  it("accepts the empty notes array Razorpay sends and null fee and tax", () => {
    const action = routeRazorpayEvent(
      event("payment.captured", payment({ fee: null, notes: [], tax: null }))
    );
    expect(action.action).toBe("stage");
  });

  it("ignores authorised and failed payments, since a capture can still follow", () => {
    expect(routeRazorpayEvent(event("payment.authorized"))).toMatchObject({
      action: "ignore",
      paymentId: "pay_Test0001",
      reason: "unhandled_event",
    });
    expect(routeRazorpayEvent(event("payment.failed"))).toMatchObject({
      action: "ignore",
      reason: "unhandled_event",
    });
  });

  it("acknowledges refund events without acting on them yet", () => {
    for (const name of [
      "refund.created",
      "refund.processed",
      "refund.failed",
      "refund.speed_changed",
    ]) {
      expect(routeRazorpayEvent(event(name))).toMatchObject({
        action: "ignore",
        reason: "refund_not_handled_yet",
      });
    }
  });

  it("ignores a payment event whose payment is not captured or unreadable", () => {
    expect(
      routeRazorpayEvent(
        event("payment.captured", payment({ status: "authorized" }))
      )
    ).toMatchObject({ action: "ignore", reason: "not_captured" });
    expect(
      routeRazorpayEvent(event("order.paid", payment({ id: "order_123" })))
    ).toMatchObject({ action: "ignore", reason: "malformed_payment" });
    expect(routeRazorpayEvent(event("payment.captured", null))).toMatchObject({
      action: "ignore",
      paymentId: null,
      reason: "malformed_payment",
    });
  });

  it("fetches by ID an unreadable payment only when the API key secret is set", () => {
    const unreadable = event("payment.captured", payment({ amount: "500" }));
    expect(routeRazorpayEvent(unreadable, true)).toEqual({
      action: "fetch",
      event: "payment.captured",
      paymentId: "pay_Test0001",
    });
    expect(routeRazorpayEvent(unreadable, false)).toMatchObject({
      action: "ignore",
      reason: "malformed_payment",
    });
    // An ID that is not a payment ID is never fetched.
    expect(
      routeRazorpayEvent(
        event("payment.captured", payment({ amount: "500", id: "../x" })),
        true
      )
    ).toMatchObject({ action: "ignore", reason: "malformed_payment" });
  });

  it("ignores bodies that are not events", () => {
    expect(routeRazorpayEvent(null)).toMatchObject({
      action: "ignore",
      event: "",
      reason: "unhandled_event",
    });
    expect(routeRazorpayEvent([1, 2])).toMatchObject({ action: "ignore" });
  });
});

describe("readWebhookBody", () => {
  const streamOf = (chunks: string[], { endless = false } = {}) => {
    let cancelled = false;
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
      pull: (controller) => {
        if (endless) {
          controller.enqueue(new Uint8Array(64 * 1024));
          return;
        }
        const chunk = chunks[i];
        i += 1;
        if (chunk === undefined) {
          controller.close();
        } else {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      },
    });
    return { stream, wasCancelled: () => cancelled };
  };
  const requestOf = (body: BodyInit | null, headers: HeadersInit = {}) =>
    new Request("http://localhost/api/razorpay/webhook", {
      body,
      headers,
      method: "POST",
      ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    } as RequestInit);

  it("reads a body within the limit, multi-byte characters intact", async () => {
    const { stream } = streamOf(['{"name":"Āsha', ' ₹"}']);
    expect(await readWebhookBody(requestOf(stream))).toEqual({
      ok: true,
      text: '{"name":"Āsha ₹"}',
    });
  });

  it("refuses a declared Content-Length over the limit without reading", async () => {
    const { stream, wasCancelled } = streamOf(["{}"]);
    const result = await readWebhookBody(
      requestOf(stream, { "content-length": String(1024 * 1024 + 1) })
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(wasCancelled()).toBe(false);
  });

  it("stops reading once an undeclared body passes the limit", async () => {
    const { stream, wasCancelled } = streamOf([], { endless: true });
    const result = await readWebhookBody(requestOf(stream), {
      maxBytes: 200 * 1024,
    });
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(wasCancelled()).toBe(true);
  });

  it("gives up on a body that stalls, and cancels the stream", async () => {
    let cancelled = false;
    const stalled = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
      pull: () => new Promise(() => undefined),
    });
    const result = await readWebhookBody(requestOf(stalled), {
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(cancelled).toBe(true);
  });
});
