import { describe, expect, it } from "bun:test";

import { computePaymentStatus } from "./compute-payment-status";

describe("computePaymentStatus", () => {
  it("returns 'approved' when no payments made", () => {
    expect(computePaymentStatus([], [100, 200])).toBe("approved");
  });

  it("returns 'approved' when approved amounts are zero", () => {
    expect(computePaymentStatus([0], [100])).toBe("approved");
  });

  it("returns 'partially_paid' when some but not all is paid", () => {
    expect(computePaymentStatus([500], [1000])).toBe("partially_paid");
  });

  it("returns 'paid' when exact amount is covered", () => {
    expect(computePaymentStatus([500, 500], [1000])).toBe("paid");
  });

  it("returns 'paid' when overpaid", () => {
    expect(computePaymentStatus([600, 500], [1000])).toBe("paid");
  });

  it("compares paise exactly (33.33 + 66.67 = 100.00)", () => {
    expect(computePaymentStatus([3333, 6667], [10_000])).toBe("paid");
    expect(computePaymentStatus([10, 20], [30])).toBe("paid");
  });

  it("rejects fractional or unsafe paise", () => {
    expect(() => computePaymentStatus([0.5], [100])).toThrow(RangeError);
    expect(() =>
      computePaymentStatus([Number.MAX_SAFE_INTEGER, 1], [100])
    ).toThrow(RangeError);
  });

  it("handles multiple line items with multiple payments", () => {
    expect(
      computePaymentStatus(
        [250, 250],
        [100, 200, 300] // total 600
      )
    ).toBe("partially_paid");
  });

  it("handles empty line items (zero owed)", () => {
    // No line items means 0 owed; any payment covers it
    expect(computePaymentStatus([100], [])).toBe("paid");
  });

  it("handles both empty", () => {
    expect(computePaymentStatus([], [])).toBe("approved");
  });

  it("handles very small amounts correctly", () => {
    expect(computePaymentStatus([1], [1])).toBe("paid");
    expect(computePaymentStatus([1], [2])).toBe("partially_paid");
  });
});
