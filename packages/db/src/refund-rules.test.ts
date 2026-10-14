import { describe, expect, it } from "vitest";

import { planRefund, type RefundPlanInput } from "./refund-rules";

const input = (
  overrides: Partial<RefundPlanInput> & {
    amountPaise?: number;
    status?: string;
  } = {}
): RefundPlanInput => ({
  contribution: {
    amountPaise: overrides.amountPaise ?? 50_000,
    status: overrides.status ?? "received",
  },
  known: overrides.known ?? null,
  refund: overrides.refund ?? { amountPaise: 50_000, payloadHash: "h1:a" },
  refundedBeforePaise: overrides.refundedBeforePaise ?? 0,
});

describe("planRefund", () => {
  it("turns a fully refunded received or pending contribution into refunded", () => {
    expect(planRefund(input())).toEqual({
      action: "record",
      refundAfterReceipt: false,
      status: "refunded",
    });
    expect(planRefund(input({ status: "pending" }))).toMatchObject({
      status: "refunded",
    });
  });

  it("records a partial refund and leaves the status alone", () => {
    expect(
      planRefund(input({ refund: { amountPaise: 20_000, payloadHash: "h" } }))
    ).toEqual({ action: "record", refundAfterReceipt: false, status: null });
  });

  it("counts earlier refunds, so the last partial refund completes it", () => {
    expect(
      planRefund(
        input({
          refund: { amountPaise: 30_000, payloadHash: "h" },
          refundedBeforePaise: 20_000,
        })
      )
    ).toMatchObject({ status: "refunded" });
  });

  it("flags a refund of a receipted contribution and never changes its status", () => {
    expect(planRefund(input({ status: "receipted" }))).toEqual({
      action: "record",
      refundAfterReceipt: true,
      status: null,
    });
  });

  it("only records a refund of a reversed or already refunded contribution", () => {
    for (const status of ["reversed", "refunded"]) {
      expect(planRefund(input({ status }))).toEqual({
        action: "record",
        refundAfterReceipt: false,
        status: null,
      });
    }
  });

  it("does nothing for a refund seen before with the same fingerprint", () => {
    expect(
      planRefund(
        input({ known: { amountChanged: false, payloadHash: "h1:a" } })
      )
    ).toEqual({ action: "already_applied" });
  });

  it("flags, never overwrites, a refund seen before with another amount, once", () => {
    const changed = { amountPaise: 10_000, payloadHash: "h1:b" };
    expect(
      planRefund(
        input({
          known: { amountChanged: false, payloadHash: "h1:a" },
          refund: changed,
        })
      )
    ).toEqual({ action: "flag_changed" });
    expect(
      planRefund(
        input({
          known: { amountChanged: true, payloadHash: "h1:a" },
          refund: changed,
        })
      )
    ).toEqual({ action: "already_applied" });
  });
});
