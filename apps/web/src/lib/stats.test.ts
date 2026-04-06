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
    status: overrides.status ?? "approved",
    createdAt: overrides.createdAt ?? Date.now(),
    lineItems: [
      {
        amount: overrides.amount ?? 100,
        category: overrides.category ? { name: overrides.category } : undefined,
      },
    ],
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
      makeItem({ createdAt: jan, amount: 100 }),
      makeItem({ createdAt: jan, amount: 200 }),
      makeItem({ createdAt: mar, amount: 50 }),
    ];
    const result = computeTrendData(
      items,
      new Date(2026, 0, 1),
      new Date(2026, 5, 30)
    );
    expect(result.length).toBeGreaterThan(3);
    const janBucket = result.find((r) => r.period === "Jan 2026");
    expect(janBucket?.count).toBe(2);
    expect(janBucket?.amount).toBe(300);
  });

  it("groups items into weekly buckets for ranges <= 3 months", () => {
    const d1 = new Date(2026, 0, 5).getTime();
    const d2 = new Date(2026, 0, 6).getTime();
    const items = [
      makeItem({ createdAt: d1, amount: 100 }),
      makeItem({ createdAt: d2, amount: 200 }),
    ];
    const result = computeTrendData(
      items,
      new Date(2026, 0, 1),
      new Date(2026, 1, 1)
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Week containing Jan 5-6 should have both items
    const weekWithData = result.find((r) => r.count > 0);
    expect(weekWithData?.count).toBe(2);
    expect(weekWithData?.amount).toBe(300);
  });
});

describe("computeCategoryData", () => {
  it("groups by category name", () => {
    const items = [
      makeItem({ category: "Travel", amount: 500 }),
      makeItem({ category: "Travel", amount: 300 }),
      makeItem({ category: "Food", amount: 100 }),
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
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ category: `Cat ${i}`, amount: (10 - i) * 100 })
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
      makeItem({ email: "a@test.com", name: "Alice", amount: 100 }),
      makeItem({ email: "b@test.com", name: "Bob", amount: 500 }),
      makeItem({ email: "a@test.com", name: "Alice", amount: 200 }),
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
    const items = Array.from({ length: 15 }, (_, i) =>
      makeItem({ email: `user${i}@test.com`, amount: 100 })
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
    expect(result[0]).toMatchObject({ eventId: "evt1", amount: 300, count: 2 });
    expect(result[1]).toMatchObject({ eventId: "evt2", amount: 50, count: 1 });
  });

  it("sorts by amount descending", () => {
    const items = [makeEventItem("small", 10), makeEventItem("big", 9999)];
    const result = computeEventData(items);
    expect(result[0]?.eventId).toBe("big");
  });

  it("limits to top 10", () => {
    const items = Array.from({ length: 15 }, (_, i) =>
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
      submittedAt: base,
      reviewedAt: base + Math.floor(daysElapsed * MS_PER_DAY),
      status,
    };
  }

  it("returns all 6 buckets with zero counts for empty input", () => {
    const result = computeApprovalTimeData([]);
    expect(result).toHaveLength(6);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("skips pending items", () => {
    const result = computeApprovalTimeData([makeApprovalItem(1, "pending")]);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("skips items with missing timestamps", () => {
    const result = computeApprovalTimeData([
      { submittedAt: null, reviewedAt: base, status: "approved" },
      { submittedAt: base, reviewedAt: null, status: "approved" },
    ]);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("bins < 1 day (0 elapsed days) into first bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(0.5)]);
    expect(result[0]).toMatchObject({ label: "< 1 day", count: 1 });
  });

  it("bins exactly 1 day into '1–3 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(1)]);
    expect(result[1]).toMatchObject({ label: "1–3 days", count: 1 });
  });

  it("bins exactly 3 days into '3–7 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(3)]);
    expect(result[2]).toMatchObject({ label: "3–7 days", count: 1 });
  });

  it("bins exactly 7 days into '7–14 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(7)]);
    expect(result[3]).toMatchObject({ label: "7–14 days", count: 1 });
  });

  it("bins exactly 30 days into '> 30 days' bucket", () => {
    const result = computeApprovalTimeData([makeApprovalItem(30)]);
    expect(result[5]).toMatchObject({ label: "> 30 days", count: 1 });
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
      submittedAt: base,
      reviewedAt: base - MS_PER_DAY,
      status: "approved",
    };
    const result = computeApprovalTimeData([item]);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });
});
