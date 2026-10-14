import { describe, expect, it } from "vitest";

import {
  hasFeeMismatch,
  isUnlinkedLine,
  lineAmountPaise,
  settlementBreakdown,
} from "./settlements";

/**
 * Razorpay's documented recon sample as stored: the fee kept net of GST
 * (Razorpay's 296 includes 46 GST, so 250 + 46).
 */
const SAMPLE = [
  {
    creditPaise: 97_100,
    debitPaise: 0,
    feePaise: 2900,
    taxPaise: 0,
    type: "payment",
  },
  {
    creditPaise: 0,
    debitPaise: 242_500,
    feePaise: 0,
    taxPaise: 0,
    type: "refund",
  },
  {
    creditPaise: 0,
    debitPaise: 100_296,
    feePaise: 250,
    taxPaise: 46,
    type: "transfer",
  },
  {
    creditPaise: 1012,
    debitPaise: 0,
    feePaise: 0,
    taxPaise: 0,
    type: "adjustment",
  },
];

describe("settlementBreakdown", () => {
  it("adds up gross − fees − GST − refunds − transfers ± adjustments to the lines' net", () => {
    const b = settlementBreakdown(SAMPLE);
    expect(b).toEqual({
      adjustmentsPaise: 1012,
      feesPaise: 3150,
      grossPaise: 100_000,
      netPaise: 97_100 - 242_500 - 100_296 + 1012,
      paymentCount: 1,
      refundCount: 1,
      refundsPaise: 242_500,
      taxPaise: 46,
      transfersPaise: 100_000,
    });
    expect(
      b.grossPaise -
        b.feesPaise -
        b.taxPaise -
        b.refundsPaise -
        b.transfersPaise +
        b.adjustmentsPaise
    ).toBe(b.netPaise);
  });

  it("counts a payment's GST and a negative adjustment", () => {
    const b = settlementBreakdown([
      {
        creditPaise: 97_640,
        debitPaise: 0,
        feePaise: 2000,
        taxPaise: 360,
        type: "payment",
      },
      {
        creditPaise: 0,
        debitPaise: 500,
        feePaise: 0,
        taxPaise: 0,
        type: "adjustment",
      },
    ]);
    expect(b.grossPaise).toBe(100_000);
    expect(b.adjustmentsPaise).toBe(-500);
    expect(b.netPaise).toBe(97_140);
  });

  it("treats amounts a synced row leaves null as zero, and an empty settlement as zero", () => {
    expect(
      settlementBreakdown([
        {
          creditPaise: 100,
          debitPaise: null,
          feePaise: null,
          taxPaise: undefined,
          type: "payment",
        },
      ]).netPaise
    ).toBe(100);
    expect(settlementBreakdown([]).netPaise).toBe(0);
  });

  it("gives each line's amount before its fee, negative for money out", () => {
    expect(SAMPLE.map(lineAmountPaise)).toEqual([
      100_000, -242_500, -100_000, 1012,
    ]);
  });
});

describe("hasFeeMismatch", () => {
  const line = { feePaise: 2000, taxPaise: 360, type: "payment" };

  it("flags a payment whose fee or GST differs from the contribution's", () => {
    expect(
      hasFeeMismatch(line, { gatewayFeePaise: 2000, gatewayTaxPaise: 360 })
    ).toBe(false);
    expect(
      hasFeeMismatch(line, { gatewayFeePaise: 1990, gatewayTaxPaise: 360 })
    ).toBe(true);
    expect(
      hasFeeMismatch(line, { gatewayFeePaise: 2000, gatewayTaxPaise: 0 })
    ).toBe(true);
  });

  it("never flags an unlinked payment or another kind of line", () => {
    expect(hasFeeMismatch(line, null)).toBe(false);
    expect(
      hasFeeMismatch({ ...line, type: "refund" }, { gatewayFeePaise: 0 })
    ).toBe(false);
  });
});

describe("isUnlinkedLine", () => {
  it("counts payments and refunds not yet recorded, never transfers or adjustments", () => {
    expect(isUnlinkedLine({ contributionId: null, type: "payment" })).toBe(
      true
    );
    expect(isUnlinkedLine({ contributionId: "c", type: "payment" })).toBe(
      false
    );
    expect(isUnlinkedLine({ contributionRefundId: null, type: "refund" })).toBe(
      true
    );
    expect(isUnlinkedLine({ contributionRefundId: "r", type: "refund" })).toBe(
      false
    );
    expect(isUnlinkedLine({ type: "adjustment" })).toBe(false);
    expect(isUnlinkedLine({ type: "transfer" })).toBe(false);
  });
});
