import { describe, expect, it } from "vitest";
import { computeAdvancePaymentStats } from "./advance-payment-stats";

describe("computeAdvancePaymentStats", () => {
  it("returns four stat items for empty data", () => {
    const stats = computeAdvancePaymentStats([]);
    expect(stats).toHaveLength(4);
    expect(stats.at(0)?.label).toBe("Total");
    expect(stats.at(0)?.value).toBe(0);
    expect(stats.at(1)?.label).toBe("Pending");
    expect(stats.at(2)?.label).toBe("Approved");
    expect(stats.at(3)?.label).toBe("Rejected");
  });

  it("counts items by status", () => {
    const data = [
      { status: "pending", lineItems: [{ amount: 100 }] },
      { status: "pending", lineItems: [{ amount: 200 }] },
      { status: "approved", lineItems: [{ amount: 300 }] },
      { status: "rejected", lineItems: [{ amount: 50 }] },
    ];
    const stats = computeAdvancePaymentStats(data);

    expect(stats.at(0)?.value).toBe(4); // total
    expect(stats.at(1)?.value).toBe(2); // pending
    expect(stats.at(2)?.value).toBe(1); // approved
    expect(stats.at(3)?.value).toBe(1); // rejected
  });

  it("formats totals as INR in descriptions", () => {
    const data = [
      { status: "approved", lineItems: [{ amount: 1000 }, { amount: 500 }] },
    ];
    const stats = computeAdvancePaymentStats(data);

    const totalDesc = stats.at(0)?.description;
    expect(totalDesc).toContain("1,500");

    const approvedDesc = stats.at(2)?.description;
    expect(approvedDesc).toContain("1,500");

    // pending and rejected should be zero
    const pendingDesc = stats.at(1)?.description;
    expect(pendingDesc).toContain("0");
  });

  it("handles string amounts", () => {
    const data = [{ status: "pending", lineItems: [{ amount: "250.50" }] }];
    const stats = computeAdvancePaymentStats(data);
    expect(stats.at(0)?.value).toBe(1);
    expect(stats.at(0)?.description).toContain("250.5");
  });

  it("handles items with no matching status", () => {
    const data = [
      { status: "draft", lineItems: [{ amount: 100 }] },
      { status: null, lineItems: [{ amount: 200 }] },
    ];
    const stats = computeAdvancePaymentStats(data);
    expect(stats.at(0)?.value).toBe(2); // total
    expect(stats.at(1)?.value).toBe(0); // pending
    expect(stats.at(2)?.value).toBe(0); // approved
    expect(stats.at(3)?.value).toBe(0); // rejected
  });

  it("handles items with empty lineItems", () => {
    const data = [{ status: "pending", lineItems: [] }];
    const stats = computeAdvancePaymentStats(data);
    expect(stats.at(0)?.value).toBe(1);
    expect(stats.at(1)?.value).toBe(1);
  });

  it("sets correct accent classes", () => {
    const stats = computeAdvancePaymentStats([]);
    expect(stats.at(0)?.accent).toBe("border-l-blue-500");
    expect(stats.at(1)?.accent).toBe("border-l-amber-500");
    expect(stats.at(2)?.accent).toBe("border-l-emerald-500");
    expect(stats.at(3)?.accent).toBe("border-l-red-500");
  });
});
