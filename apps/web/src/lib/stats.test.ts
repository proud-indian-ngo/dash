import { describe, expect, it } from "vitest";
import {
  byStatus,
  computeApprovalTimeData,
  computeCategoryData,
  computeEventData,
  computeSubmitterData,
  computeTrendData,
  sumAmounts,
  sumTotal,
} from "./stats";

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
      { lineItems: [{ amount: 100 }, { amount: 50 }], status: "pending" },
      { lineItems: [{ amount: 200 }], status: "approved" },
    ];
    expect(sumTotal(data)).toBe(350);
  });

  it("returns 0 for empty data", () => {
    expect(sumTotal([])).toBe(0);
  });
});

describe("byStatus", () => {
  const data = [
    { lineItems: [], status: "pending" },
    { lineItems: [], status: "approved" },
    { lineItems: [], status: "pending" },
    { lineItems: [], status: "rejected" },
  ];

  it("filters by pending", () => {
    expect(byStatus(data, "pending")).toHaveLength(2);
  });

  it("returns empty for non-existent status", () => {
    expect(byStatus(data, "unknown")).toHaveLength(0);
  });
});

// --- Analytics aggregation tests ---

function makeItem(overrides: {
  amount?: number;
  category?: string;
  createdAt?: number;
  email?: string;
  name?: string;
  status?: string;
}) {
  return {
    createdAt: overrides.createdAt ?? Date.now(),
    lineItems: [
      {
        amount: overrides.amount ?? 100,
        category: overrides.category ? { name: overrides.category } : undefined,
      },
    ],
    status: overrides.status ?? "approved",
    user: {
      email: overrides.email ?? "test@example.com",
      name: overrides.name ?? "Test User",
    },
  };
}

describe("computeTrendData", () => {
  it("returns empty for no items", () => {
    expect(computeTrendData([], null, null)).toEqual([]);
  });

  it("returns empty when all items have null createdAt", () => {
    const item = makeItem({});
    item.createdAt = null as unknown as number;
    expect(computeTrendData([item], null, null)).toEqual([]);
  });

  it("groups items into monthly buckets for ranges > 3 months", () => {
    const jan = new Date(2026, 0, 15).getTime();
    const mar = new Date(2026, 2, 15).getTime();
    const items = [
      makeItem({ amount: 100, createdAt: jan }),
      makeItem({ amount: 200, createdAt: jan }),
      makeItem({ amount: 50, createdAt: mar }),
    ];
    const result = computeTrendData(
      items,
      new Date(2026, 0, 1),
      new Date(2026, 5, 30)
    );
    expect(result.length).toBeGreaterThan(3);
    const janBucket = result.find((r: any) => r.period === "Jan 2026");
    expect(janBucket?.count).toBe(2);
    expect(janBucket?.amount).toBe(300);
  });

  it("groups items into weekly buckets for ranges <= 3 months", () => {
    const d1 = new Date(2026, 0, 5).getTime();
    const d2 = new Date(2026, 0, 6).getTime();
    const items = [
      makeItem({ amount: 100, createdAt: d1 }),
      makeItem({ amount: 200, createdAt: d2 }),
    ];
    const result = computeTrendData(
      items,
      new Date(2026, 0, 1),
      new Date(2026, 1, 1)
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Week containing Jan 5-6 should have both items
    const weekWithData = result.find((r: any) => r.count > 0);
    expect(weekWithData?.count).toBe(2);
    expect(weekWithData?.amount).toBe(300);
  });
});

describe("computeCategoryData", () => {
  it("groups by category name", () => {
    const items = [
      makeItem({ amount: 500, category: "Travel" }),
      makeItem({ amount: 300, category: "Travel" }),
      makeItem({ amount: 100, category: "Food" }),
    ];
    const result = computeCategoryData(items);
    expect(result).toHaveLength(2);
    expect(result.at(0)?.name).toBe("Travel");
    expect(result.at(0)?.amount).toBe(800);
    expect(result.at(0)?.count).toBe(2);
    expect(result.at(1)?.name).toBe("Food");
  });

  it("uses Uncategorized for null category", () => {
    const items = [makeItem({ amount: 100 })];
    const result = computeCategoryData(items);
    expect(result.at(0)?.name).toBe("Uncategorized");
  });

  it("caps at 8 categories with Other bucket", () => {
    const items = Array.from({ length: 10 }, (_: any, i: any) =>
      makeItem({ amount: (10 - i) * 100, category: `Cat ${i}` })
    );
    const result = computeCategoryData(items);
    expect(result).toHaveLength(8);
    expect(result.at(7)?.name).toBe("Other");
    expect(result.at(7)?.count).toBe(3);
  });

  it("returns empty for no items", () => {
    expect(computeCategoryData([])).toEqual([]);
  });
});

describe("computeSubmitterData", () => {
  it("groups by user email and sorts by amount", () => {
    const items = [
      makeItem({ amount: 100, email: "a@test.com", name: "Alice" }),
      makeItem({ amount: 500, email: "b@test.com", name: "Bob" }),
      makeItem({ amount: 200, email: "a@test.com", name: "Alice" }),
    ];
    const result = computeSubmitterData(items);
    expect(result).toHaveLength(2);
    expect(result.at(0)?.email).toBe("b@test.com");
    expect(result.at(0)?.amount).toBe(500);
    expect(result.at(1)?.email).toBe("a@test.com");
    expect(result.at(1)?.amount).toBe(300);
    expect(result.at(1)?.count).toBe(2);
  });

  it("limits to top 10", () => {
    const items = Array.from({ length: 15 }, (_: any, i: any) =>
      makeItem({ amount: 100, email: `user${i}@test.com` })
    );
    const result = computeSubmitterData(items);
    expect(result).toHaveLength(10);
  });

  it("skips items with no user", () => {
    const item = makeItem({ amount: 100 });
    (item as { user: unknown }).user = undefined;
    expect(computeSubmitterData([item])).toEqual([]);
  });
});

describe("computeEventData", () => {
  function makeEventItem(eventId: string | null, amount: number) {
    return {
      event: eventId ? { id: eventId, name: `Event ${eventId}` } : null,
      lineItems: [{ amount }],
    };
  }

  it("returns empty for items with no event", () => {
    expect(computeEventData([makeEventItem(null, 100)])).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(computeEventData([])).toEqual([]);
  });

  it("groups and sums by event", () => {
    const items = [
      makeEventItem("evt1", 100),
      makeEventItem("evt1", 200),
      makeEventItem("evt2", 50),
    ];
    const result = computeEventData(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ amount: 300, count: 2, eventId: "evt1" });
    expect(result[1]).toMatchObject({ amount: 50, count: 1, eventId: "evt2" });
  });

  it("sorts by amount descending", () => {
    const items = [makeEventItem("small", 10), makeEventItem("big", 9999)];
    const result = computeEventData(items);
    expect(result[0]?.eventId).toBe("big");
  });

  it("limits to top 10", () => {
    const items = Array.from({ length: 15 }, (_: any, i: any) =>
      makeEventItem(`evt${i}`, 100)
    );
    expect(computeEventData(items)).toHaveLength(10);
  });

  it("skips items with undefined event", () => {
    const item = { event: undefined, lineItems: [{ amount: 100 }] };
    expect(computeEventData([item])).toEqual([]);
  });
});

describe("computeApprovalTimeData", () => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const base = new Date("2026-01-01").getTime();

  function makeApprovalItem(daysElapsed: number, status = "approved") {
    return {
      reviewedAt: base + Math.floor(daysElapsed * MS_PER_DAY),
      status,
      submittedAt: base,
    };
  }

  it("returns all 6 buckets with zero counts for empty input", () => {
    const result = computeApprovalTimeData([]);
    expect(result).toHaveLength(6);
    expect(result.every((b: any) => b.count === 0)).toBe(true);
  });

  it("skips pending items", () => {
    const result = computeApprovalTimeData([makeApprovalItem(1, "pending")]);
    expect(result.every((b: any) => b.count === 0)).toBe(true);
  });

  it("skips items with missing timestamps", () => {
    const result = computeApprovalTimeData([
      { reviewedAt: base, status: "approved", submittedAt: null },
      { reviewedAt: null, status: "approved", submittedAt: base },
    ]);
    expect(result.every((b: any) => b.count === 0)).toBe(true);
  });

  it("bins < 1 day (0 elapsed days) into first bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(0.5)]);
    expect(result[0]).toMatchObject({ count: 1, label: "< 1 day" });
  });

  it("bins exactly 1 day into '1–3 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(1)]);
    expect(result[1]).toMatchObject({ count: 1, label: "1–3 days" });
  });

  it("bins exactly 3 days into '3–7 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(3)]);
    expect(result[2]).toMatchObject({ count: 1, label: "3–7 days" });
  });

  it("bins exactly 7 days into '7–14 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(7)]);
    expect(result[3]).toMatchObject({ count: 1, label: "7–14 days" });
  });

  it("bins exactly 30 days into '> 30 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(30)]);
    expect(result[5]).toMatchObject({ count: 1, label: "> 30 days" });
  });

  it("counts both approved and rejected", () => {
    const items = [
      makeApprovalItem(1, "approved"),
      makeApprovalItem(1, "rejected"),
    ];
    const result = computeApprovalTimeData(items);
    expect(result[1]?.count).toBe(2);
  });

  it("silently ignores negative deltas (reviewedAt < submittedAt)", () => {
    const item = {
      reviewedAt: base - MS_PER_DAY,
      status: "approved",
      submittedAt: base,
    };
    const result = computeApprovalTimeData([item]);
    expect(result.every((b: any) => b.count === 0)).toBe(true);
  });
});
