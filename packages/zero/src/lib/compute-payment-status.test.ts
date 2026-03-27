import { describe, expect, it } from "vitest";
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

  it("handles string amounts", () => {
    expect(computePaymentStatus(["500.00"], ["1000.00"])).toBe(
      "partially_paid"
    );
    expect(computePaymentStatus(["1000.00"], ["1000.00"])).toBe("paid");
  });

  it("handles floating-point edge case (33.33 + 66.67 = 100.00)", () => {
    // This is the classic JS float bug: 33.33 + 66.67 !== 100.00 in floats
    expect(computePaymentStatus(["33.33", "66.67"], ["100.00"])).toBe("paid");
  });

  it("handles floating-point edge case (0.1 + 0.2)", () => {
    expect(computePaymentStatus(["0.10", "0.20"], ["0.30"])).toBe("paid");
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
    expect(computePaymentStatus(["0.01"], ["0.01"])).toBe("paid");
    expect(computePaymentStatus(["0.01"], ["0.02"])).toBe("partially_paid");
  });
});
