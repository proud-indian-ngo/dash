import { describe, expect, it } from "vitest";
import { byStatus, sumAmounts, sumTotal } from "./stats";

describe("sumAmounts", () => {
  it("sums numeric amounts", () => {
    expect(sumAmounts([{ amount: 100 }, { amount: 200.5 }])).toBeCloseTo(300.5);
  });

  it("sums string amounts", () => {
    expect(sumAmounts([{ amount: "100" }, { amount: "50.25" }])).toBeCloseTo(
      150.25
    );
  });

  it("returns 0 for empty array", () => {
    expect(sumAmounts([])).toBe(0);
  });
});

describe("sumTotal", () => {
  it("sums line items across submissions", () => {
    const data = [
      { status: "pending", lineItems: [{ amount: 100 }, { amount: 50 }] },
      { status: "approved", lineItems: [{ amount: 200 }] },
    ];
    expect(sumTotal(data)).toBe(350);
  });

  it("returns 0 for empty data", () => {
    expect(sumTotal([])).toBe(0);
  });
});

describe("byStatus", () => {
  const data = [
    { status: "pending", lineItems: [] },
    { status: "approved", lineItems: [] },
    { status: "pending", lineItems: [] },
    { status: "rejected", lineItems: [] },
  ];

  it("filters by pending", () => {
    expect(byStatus(data, "pending")).toHaveLength(2);
  });

  it("returns empty for non-existent status", () => {
    expect(byStatus(data, "unknown")).toHaveLength(0);
  });
});
