import { describe, expect, it } from "vitest";
import { computeRequestStats } from "./request-stats";

describe("computeRequestStats", () => {
  it("returns four stat items for empty data", () => {
    const stats = computeRequestStats([]);
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
      { status: "approved", lineItems: [{ amount: 200 }] },
      { status: "approved", lineItems: [{ amount: 300 }] },
      { status: "rejected", lineItems: [{ amount: 50 }] },
      { status: "rejected", lineItems: [{ amount: 75 }] },
      { status: "rejected", lineItems: [{ amount: 25 }] },
    ];
    const stats = computeRequestStats(data);

    expect(stats.at(0)?.value).toBe(6);
    expect(stats.at(1)?.value).toBe(1);
    expect(stats.at(2)?.value).toBe(2);
    expect(stats.at(3)?.value).toBe(3);
  });

  it("sums amounts across line items per entry", () => {
    const data = [
      {
        status: "approved",
        lineItems: [{ amount: 100 }, { amount: 200 }, { amount: 300 }],
      },
    ];
    const stats = computeRequestStats(data);
    const totalDesc = stats.at(0)?.description;
    expect(totalDesc).toContain("600");
  });

  it("formats totals as INR in descriptions", () => {
    const data = [{ status: "pending", lineItems: [{ amount: 10_000 }] }];
    const stats = computeRequestStats(data);
    const pendingDesc = stats.at(1)?.description;
    expect(pendingDesc).toContain("10,000");
  });

  it("handles string amounts", () => {
    const data = [{ status: "approved", lineItems: [{ amount: "999.99" }] }];
    const stats = computeRequestStats(data);
    expect(stats.at(2)?.description).toContain("999.99");
  });

  it("handles null status", () => {
    const data = [{ status: null, lineItems: [{ amount: 500 }] }];
    const stats = computeRequestStats(data);
    expect(stats.at(0)?.value).toBe(1);
    expect(stats.at(1)?.value).toBe(0);
    expect(stats.at(2)?.value).toBe(0);
    expect(stats.at(3)?.value).toBe(0);
  });

  it("sets correct accent classes", () => {
    const stats = computeRequestStats([]);
    expect(stats.at(0)?.accent).toBe("border-l-blue-500");
    expect(stats.at(1)?.accent).toBe("border-l-amber-500");
    expect(stats.at(2)?.accent).toBe("border-l-emerald-500");
    expect(stats.at(3)?.accent).toBe("border-l-red-500");
  });
});
