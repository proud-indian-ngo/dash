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
  knownPayloadHash: overrides.knownPayloadHash ?? null,
  refund: overrides.refund ?? { amountPaise: 50_000, payloadHash: "h1:a" },
  refundedBeforePaise: overrides.refundedBeforePaise ?? 0,
});

describe("planRefund", () => {
  it("turns a fully refunded received or pending contribution into refunded", () => {
    expect(planRefund(input())).toEqual({
      action: "record",
      attention: null,
      status: "refunded",
    });
    expect(planRefund(input({ status: "pending" }))).toMatchObject({
      status: "refunded",
    });
  });

  it("records a partial refund and leaves the status alone", () => {
    expect(
      planRefund(input({ refund: { amountPaise: 20_000, payloadHash: "h" } }))
    ).toEqual({ action: "record", attention: null, status: null });
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
      attention: "refund_after_receipt",
      status: null,
    });
  });

  it("only records a refund of a reversed or already refunded contribution", () => {
    for (const status of ["reversed", "refunded"]) {
      expect(planRefund(input({ status }))).toEqual({
        action: "record",
        attention: null,
        status: null,
      });
    }
  });

  it("does nothing for a refund seen before with the same fingerprint", () => {
    expect(planRefund(input({ knownPayloadHash: "h1:a" }))).toEqual({
      action: "already_applied",
    });
  });

  it("flags, never overwrites, a refund seen before with another amount", () => {
    expect(
      planRefund(
        input({
          knownPayloadHash: "h1:a",
          refund: { amountPaise: 10_000, payloadHash: "h1:b" },
        })
      )
    ).toEqual({ action: "flag_changed" });
  });
});
