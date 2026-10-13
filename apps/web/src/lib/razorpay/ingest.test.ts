import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const { syncRazorpayPayment } = await import("./ingest");

import type { RazorpaySetup } from "./config";
import type { RazorpayPayment } from "./payment";

const PAYMENT: RazorpayPayment = {
  amount: 50_000,
  created_at: Date.parse("2026-10-12T20:00:00Z") / 1000,
  currency: "INR",
  id: "pay_Test0001",
  status: "captured",
};

const enabled = (apiKey: { id: string; secret: string } | null) =>
  ({
    apiKey,
    enabled: true,
    mode: "test",
    testInProduction: false,
    webhookSecret: "s",
  }) satisfies RazorpaySetup;

function deps(found: RazorpayPayment | null = PAYMENT) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      fetchPayment: mock(async () => {
        calls.push("fetch");
        return found;
      }),
      process: mock(async (id: string, day: string, mode: string) => {
        calls.push(`process:${id}:${day}:${mode}`);
        return "ready" as const;
      }),
      stage: mock(async () => {
        calls.push("stage");
        return {
          batchId: "b",
          day: "2026-10-13",
          rowId: "r",
          staged: "existing" as const,
        };
      }),
    },
  };
}

const INPUT = { day: "2026-10-12", paymentId: "pay_Test0001" };

describe("syncRazorpayPayment", () => {
  it("does nothing when Razorpay is not configured", async () => {
    const { calls, deps: d } = deps();
    expect(await syncRazorpayPayment(INPUT, { enabled: false }, d)).toBe(
      "disabled"
    );
    expect(calls).toEqual([]);
  });

  it("uses the staged webhook copy when there is no API key", async () => {
    const { calls, deps: d } = deps();
    expect(await syncRazorpayPayment(INPUT, enabled(null), d)).toBe("ready");
    expect(calls).toEqual(["process:pay_Test0001:2026-10-12:test"]);
  });

  it("fetches the payment, stages the API copy and processes it on the payment's day", async () => {
    const { calls, deps: d } = deps();
    const key = { id: "rzp_test_x", secret: "k" };
    expect(await syncRazorpayPayment(INPUT, enabled(key), d)).toBe("ready");
    expect(d.fetchPayment).toHaveBeenCalledWith("pay_Test0001", key);
    expect(calls).toEqual([
      "fetch",
      "stage",
      "process:pay_Test0001:2026-10-13:test",
    ]);
  });

  it("records nothing for a payment the API does not know or that is not captured", async () => {
    const key = { id: "rzp_test_x", secret: "k" };
    const missing = deps(null);
    expect(await syncRazorpayPayment(INPUT, enabled(key), missing.deps)).toBe(
      "not_found"
    );
    expect(missing.calls).toEqual(["fetch"]);
    const refunded = deps({ ...PAYMENT, status: "refunded" });
    expect(await syncRazorpayPayment(INPUT, enabled(key), refunded.deps)).toBe(
      "not_captured"
    );
    expect(refunded.calls).toEqual(["fetch"]);
  });
});
