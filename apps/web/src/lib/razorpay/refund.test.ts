import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

import type { RefundToApply } from "@pi-dash/db/queries/razorpay-refunds";

const {
  applyPaymentRefunds,
  holdWebhookRefund,
  RefundNotProcessedError,
  syncRazorpayRefund,
} = await import("./refund");

import type { RazorpayClient } from "./api";
import type { RazorpaySetup } from "./config";
import type { RazorpayRefund } from "./refund-schema";

const REFUND: RazorpayRefund = {
  amount: 20_000,
  // 13 Oct 2026, 00:30 in India.
  created_at: Date.parse("2026-10-12T19:00:00Z") / 1000,
  currency: "INR",
  id: "rfnd_Test0001",
  payment_id: "pay_Test0001",
  status: "processed",
};

const enabled = (apiKey: { id: string; secret: string } | null) =>
  ({
    apiKey,
    enabled: true,
    mode: "test",
    testInProduction: false,
    webhookSecret: "s",
  }) satisfies RazorpaySetup;

function deps(
  result:
    | "already_applied"
    | "amount_changed"
    | "applied"
    | "payment_not_imported",
  found: RazorpayRefund | null = REFUND
) {
  const applied: RefundToApply[] = [];
  const fetched: string[] = [];
  const client = {
    fetchRefund: async (id: string) => {
      fetched.push(id);
      return found;
    },
    listPaymentRefunds: async () => ({
      items: [
        REFUND,
        { ...REFUND, id: "rfnd_Test0002", status: "pending" },
        { ...REFUND, id: "rfnd_Test0003" },
      ],
      pages: 1,
      unreadable: 0,
    }),
  } as unknown as RazorpayClient;
  return {
    applied,
    deps: {
      apply: async (refund: RefundToApply) => {
        applied.push(refund);
        return { contributionId: "c", result, statusChanged: false };
      },
      client: () => client,
    },
    fetched,
  };
}

const JOB = {
  copy: {
    amount: 20_000,
    createdAt: REFUND.created_at,
    currency: "INR",
    status: "processed",
  },
  paymentId: "pay_Test0001",
  refundId: "rfnd_Test0001",
};

describe("syncRazorpayRefund", () => {
  it("does nothing when Razorpay is off, or with a test key in production", async () => {
    const d = deps("applied");
    expect(await syncRazorpayRefund(JOB, { enabled: false }, d.deps)).toBe(
      "disabled"
    );
    expect(
      await syncRazorpayRefund(
        JOB,
        { ...enabled(null), testInProduction: true },
        d.deps
      )
    ).toBe("test_mode_refused");
    expect(d.applied).toEqual([]);
  });

  it("uses the verified webhook copy when there is no key secret", async () => {
    const d = deps("applied");
    expect(await syncRazorpayRefund(JOB, enabled(null), d.deps)).toBe(
      "applied"
    );
    expect(d.fetched).toEqual([]);
    expect(d.applied).toHaveLength(1);
    expect(d.applied[0]).toMatchObject({
      amountPaise: 20_000,
      currency: "INR",
      mode: "test",
      paymentId: "pay_Test0001",
      refundId: "rfnd_Test0001",
      refundedAt: new Date("2026-10-12T19:00:00Z"),
      // The India date of the refund.
      refundedOn: "2026-10-13",
    });
    expect(d.applied[0]?.payloadHash).toStartWith("h1:");
  });

  it("fetches the refund with the key secret, the source of truth", async () => {
    const d = deps("applied", { ...REFUND, amount: 15_000 });
    expect(
      await syncRazorpayRefund(
        JOB,
        enabled({ id: "rzp_test_x", secret: "k" }),
        d.deps
      )
    ).toBe("applied");
    expect(d.fetched).toEqual(["rfnd_Test0001"]);
    expect(d.applied[0]?.amountPaise).toBe(15_000);
    const missing = deps("applied", null);
    expect(
      await syncRazorpayRefund(
        JOB,
        enabled({ id: "rzp_test_x", secret: "k" }),
        missing.deps
      )
    ).toBe("not_found");
  });

  it("records only processed refunds", async () => {
    const d = deps("applied");
    expect(
      await syncRazorpayRefund(
        { ...JOB, copy: { ...JOB.copy, status: "pending" } },
        enabled(null),
        d.deps
      )
    ).toBe("not_processed");
    expect(d.applied).toEqual([]);
  });

  it("is idempotent and reports a changed amount", async () => {
    expect(
      await syncRazorpayRefund(JOB, enabled(null), deps("already_applied").deps)
    ).toBe("already_applied");
    expect(
      await syncRazorpayRefund(JOB, enabled(null), deps("amount_changed").deps)
    ).toBe("amount_changed");
  });

  it("ends with the refund held when its payment is not imported yet", async () => {
    expect(
      await syncRazorpayRefund(
        JOB,
        enabled(null),
        deps("payment_not_imported").deps
      )
    ).toBe("payment_not_imported");
  });

  it("retries when the API does not show the refund as processed yet", async () => {
    const d = deps("applied", { ...REFUND, status: "pending" });
    await expect(
      syncRazorpayRefund(
        JOB,
        enabled({ id: "rzp_test_x", secret: "k" }),
        d.deps
      )
    ).rejects.toBeInstanceOf(RefundNotProcessedError);
    expect(d.applied).toEqual([]);
  });

  it("gives the same fingerprint to the webhook copy and the API copy", async () => {
    const webhook = deps("applied");
    await syncRazorpayRefund(JOB, enabled(null), webhook.deps);
    const api = deps("applied");
    await syncRazorpayRefund(
      JOB,
      enabled({ id: "rzp_test_x", secret: "k" }),
      api.deps
    );
    expect(webhook.applied[0]?.payloadHash).toBe(api.applied[0]?.payloadHash);
    const changed = deps("applied", { ...REFUND, amount: 10_000 });
    await syncRazorpayRefund(
      JOB,
      enabled({ id: "rzp_test_x", secret: "k" }),
      changed.deps
    );
    expect(changed.applied[0]?.payloadHash).not.toBe(
      api.applied[0]?.payloadHash
    );
  });
});

describe("applyPaymentRefunds", () => {
  it("applies a payment's processed refunds and tallies them", async () => {
    const d = deps("applied");
    const tally = await applyPaymentRefunds(
      "pay_Test0001",
      d.deps.client(),
      "test",
      d.deps.apply
    );
    expect(tally).toEqual({ applied: 2, changed: 0, waiting: 0 });
    expect(d.applied.map((r) => r.refundId)).toEqual([
      "rfnd_Test0001",
      "rfnd_Test0003",
    ]);
    const waiting = deps("payment_not_imported");
    expect(
      await applyPaymentRefunds(
        "pay_Test0001",
        waiting.deps.client(),
        "test",
        waiting.deps.apply
      )
    ).toEqual({ applied: 0, changed: 0, waiting: 2 });
  });
});

describe("holdWebhookRefund", () => {
  it("keeps a processed webhook copy before its job runs, and nothing else", async () => {
    const held: RefundToApply[] = [];
    const hold = async (refund: RefundToApply) => {
      held.push(refund);
    };
    expect(await holdWebhookRefund(JOB, "live", hold)).toBe(true);
    expect(held[0]).toMatchObject({
      amountPaise: 20_000,
      mode: "live",
      paymentId: "pay_Test0001",
      refundId: "rfnd_Test0001",
      refundedOn: "2026-10-13",
    });
    expect(
      await holdWebhookRefund(
        { ...JOB, copy: { ...JOB.copy, status: "failed" } },
        "live",
        hold
      )
    ).toBe(false);
    expect(held).toHaveLength(1);
  });
});
