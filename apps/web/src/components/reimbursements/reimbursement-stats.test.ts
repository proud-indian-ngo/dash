import { describe, expect, it } from "bun:test";

import { computeReimbursementStats } from "./reimbursement-stats";

describe("computeReimbursementStats", () => {
  it("returns four stat items for empty data", () => {
    const stats = computeReimbursementStats([]);
    expect(stats).toHaveLength(4);
    expect(stats.at(0)?.label).toBe("Total");
    expect(stats.at(0)?.value).toBe(0);
    expect(stats.at(1)?.label).toBe("Pending");
    expect(stats.at(2)?.label).toBe("Approved");
    expect(stats.at(3)?.label).toBe("Rejected");
  });

  it("counts items by status", () => {
    const data = [
      { lineItems: [{ amountPaise: 100 }], status: "pending" },
      { lineItems: [{ amountPaise: 200 }], status: "approved" },
      { lineItems: [{ amountPaise: 300 }], status: "approved" },
      { lineItems: [{ amountPaise: 50 }], status: "rejected" },
      { lineItems: [{ amountPaise: 75 }], status: "rejected" },
      { lineItems: [{ amountPaise: 25 }], status: "rejected" },
    ];
    const stats = computeReimbursementStats(data);

    expect(stats.at(0)?.value).toBe(6);
    expect(stats.at(1)?.value).toBe(1);
    expect(stats.at(2)?.value).toBe(2);
    expect(stats.at(3)?.value).toBe(3);
  });

  it("sums amounts across line items per entry", () => {
    const data = [
      {
        lineItems: [
          { amountPaise: 10_000 },
          { amountPaise: 20_000 },
          { amountPaise: 30_000 },
        ],
        status: "approved",
      },
    ];
    const stats = computeReimbursementStats(data);
    const totalDesc = stats.at(0)?.description;
    expect(totalDesc).toBe("₹600.00");
  });

  it("formats totals as INR in descriptions", () => {
    const data = [
      { lineItems: [{ amountPaise: 1_000_000 }], status: "pending" },
    ];
    const stats = computeReimbursementStats(data);
    const pendingDesc = stats.at(1)?.description;
    expect(pendingDesc).toContain("10,000");
  });

  it("formats paise fractions", () => {
    const data = [{ lineItems: [{ amountPaise: 99_999 }], status: "approved" }];
    const stats = computeReimbursementStats(data);
    expect(stats.at(2)?.description).toContain("999.99");
  });

  it("handles null status", () => {
    const data = [{ lineItems: [{ amountPaise: 500 }], status: null }];
    const stats = computeReimbursementStats(data);
    expect(stats.at(0)?.value).toBe(1);
    expect(stats.at(1)?.value).toBe(0);
    expect(stats.at(2)?.value).toBe(0);
    expect(stats.at(3)?.value).toBe(0);
  });
});
