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
      fail: mock(
        async (id: string, day: string, mode: string, reason: string) => {
          calls.push(`fail:${id}:${day}:${mode}:${reason}`);
          return true;
        }
      ),
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

  it("records a payment the API does not know, or that is not captured, as an error on its row", async () => {
    const key = { id: "rzp_test_x", secret: "k" };
    const missing = deps(null);
    expect(await syncRazorpayPayment(INPUT, enabled(key), missing.deps)).toBe(
      "not_found"
    );
    expect(missing.calls).toEqual([
      "fetch",
      "fail:pay_Test0001:2026-10-12:test:not_found",
    ]);
    const refunded = deps({ ...PAYMENT, status: "refunded" });
    const statuses: string[] = [];
    expect(
      await syncRazorpayPayment(
        INPUT,
        enabled(key),
        refunded.deps,
        (status) => {
          statuses.push(status);
        }
      )
    ).toBe("not_captured");
    // The row is looked up on the payment's own India day.
    expect(refunded.calls).toEqual([
      "fetch",
      "fail:pay_Test0001:2026-10-13:test:not_captured",
    ]);
    expect(statuses).toEqual(["refunded"]);
  });

  it("refuses everything with a test key on a production server", async () => {
    const { calls, deps: d } = deps();
    expect(
      await syncRazorpayPayment(
        INPUT,
        {
          ...enabled({ id: "rzp_test_x", secret: "k" }),
          testInProduction: true,
        },
        d
      )
    ).toBe("test_mode_refused");
    expect(calls).toEqual([]);
  });

  it("fetches by ID alone when the webhook could not read the payment", async () => {
    const key = { id: "rzp_test_x", secret: "k" };
    const { calls, deps: d } = deps();
    expect(
      await syncRazorpayPayment({ paymentId: "pay_Test0001" }, enabled(key), d)
    ).toBe("ready");
    expect(calls).toEqual([
      "fetch",
      "stage",
      "process:pay_Test0001:2026-10-13:test",
    ]);
    // Without a key there is nothing to fetch and nothing staged.
    const keyless = deps();
    expect(
      await syncRazorpayPayment(
        { paymentId: "pay_Test0001" },
        enabled(null),
        keyless.deps
      )
    ).toBe("not_staged");
    expect(keyless.calls).toEqual([]);
  });
});
