import { describe, expect, it } from "bun:test";

import { createRazorpayClient, PAGE_SIZE, rateLimitWait } from "./api";

const KEY = { id: "rzp_test_x", secret: "shh" };

const payment = (n: number) => ({
  amount: 10_000,
  captured: true,
  created_at: 1_791_900_000 + n,
  currency: "INR",
  id: `pay_P${n}`,
  status: "captured",
});

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });

/** A fake fetch answering from a queue, recording each URL. */
function fakeFetch(answers: (() => Response)[]) {
  const urls: string[] = [];
  const auth: (string | null)[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    auth.push(new Headers(init?.headers).get("authorization"));
    const next = answers.shift();
    if (!next) {
      throw new Error("No more answers");
    }
    return next();
  }) as unknown as typeof fetch;
  return { auth, fetchImpl, urls };
}

describe("Razorpay listings", () => {
  it("pages with count and skip until a page is short", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => payment(i));
    const { auth, fetchImpl, urls } = fakeFetch([
      () => json({ count: PAGE_SIZE, entity: "collection", items: full }),
      () =>
        json({
          count: 2,
          entity: "collection",
          items: [payment(100), { id: "not-a-payment" }],
        }),
    ]);
    const listing = await createRazorpayClient(KEY, {
      fetchImpl,
    }).listPayments({ from: 100, to: 199 });
    expect(listing.items).toHaveLength(PAGE_SIZE + 1);
    expect(listing.unreadable).toBe(1);
    expect(listing.pages).toBe(2);
    expect(urls).toEqual([
      "https://api.razorpay.com/v1/payments?count=100&from=100&to=199&skip=0",
      "https://api.razorpay.com/v1/payments?count=100&from=100&to=199&skip=100",
    ]);
    expect(auth[0]).toBe(
      `Basic ${Buffer.from("rzp_test_x:shh").toString("base64")}`
    );
  });

  it("stops at an empty page", async () => {
    const { fetchImpl, urls } = fakeFetch([
      () => json({ count: 0, entity: "collection", items: [] }),
    ]);
    const listing = await createRazorpayClient(KEY, { fetchImpl }).listRefunds({
      from: 1,
      to: 2,
    });
    expect(listing).toEqual({ items: [], pages: 1, unreadable: 0 });
    expect(urls).toHaveLength(1);
  });

  it("lists a payment's refunds without a window", async () => {
    const { fetchImpl, urls } = fakeFetch([
      () =>
        json({
          count: 1,
          items: [
            {
              amount: 500,
              created_at: 1,
              currency: "INR",
              id: "rfnd_R1",
              payment_id: "pay_P1",
              status: "processed",
            },
          ],
        }),
    ]);
    const listing = await createRazorpayClient(KEY, {
      fetchImpl,
    }).listPaymentRefunds("pay_P1");
    expect(listing.items.map((r) => r.id)).toEqual(["rfnd_R1"]);
    expect(urls).toEqual([
      "https://api.razorpay.com/v1/payments/pay_P1/refunds?count=100&skip=0",
    ]);
  });

  it("throws on an error answer and reads a 404 as unknown", async () => {
    const { fetchImpl } = fakeFetch([
      () => json({ error: {} }, 401),
      () => json({ error: {} }, 404),
    ]);
    const client = createRazorpayClient(KEY, { fetchImpl });
    await expect(client.listPayments({ from: 1, to: 2 })).rejects.toThrow(
      "Razorpay API answered 401"
    );
    expect(await client.fetchRefund("rfnd_R1")).toBeNull();
  });
});

describe("pacing and rate limits", () => {
  it("waits Retry-After on a 429 and tries again", async () => {
    const slept: number[] = [];
    const { fetchImpl, urls } = fakeFetch([
      () => json({}, 429, { "retry-after": "3" }),
      () => json({}, 429),
      () => json(payment(1)),
    ]);
    const client = createRazorpayClient(KEY, {
      fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect((await client.fetchPayment("pay_P1"))?.id).toBe("pay_P1");
    // Retry-After first, then doubling from a second.
    expect(slept).toEqual([3000, 2000]);
    expect(urls).toHaveLength(3);
  });

  it("gives up after five 429s", async () => {
    const { fetchImpl } = fakeFetch(
      Array.from({ length: 6 }, () => () => json({}, 429))
    );
    const client = createRazorpayClient(KEY, {
      fetchImpl,
      sleep: async () => undefined,
    });
    await expect(client.fetchPayment("pay_P1")).rejects.toThrow(
      "Razorpay API answered 429"
    );
  });

  it("keeps calls at least the gap apart", async () => {
    let clock = 1000;
    const slept: number[] = [];
    const { fetchImpl } = fakeFetch([
      () => json(payment(1)),
      () => json(payment(2)),
    ]);
    const client = createRazorpayClient(KEY, {
      fetchImpl,
      gapMs: 250,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await client.fetchPayment("pay_P1");
    clock += 100;
    await client.fetchPayment("pay_P2");
    expect(slept).toEqual([150]);
  });

  it("reads Retry-After as seconds or a date, capped at a minute", () => {
    expect(rateLimitWait("2", 0)).toBe(2000);
    expect(rateLimitWait(null, 3)).toBe(8000);
    expect(rateLimitWait("600", 0)).toBe(60_000);
    expect(
      rateLimitWait(new Date(10_000).toUTCString(), 0, new Date(5000).getTime())
    ).toBe(5000);
  });
});
