import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { filterByDateRange, resolveDateRange } from "./date-range";
import {
  byStatus,
  computeApprovalTimeData,
  computeCategoryData,
  computeEventData,
  computeProgrammeData,
  computeSubmitterData,
  computeTrendData,
  spentAt,
  sumAmounts,
  sumTotal,
} from "./stats";

describe("sumAmounts", () => {
  it("sums paise exactly", () => {
    expect(sumAmounts([{ amountPaise: 10_000 }, { amountPaise: 20_050 }])).toBe(
      30_050
    );
    expect(sumAmounts([{ amountPaise: 10 }, { amountPaise: 20 }])).toBe(30);
  });

  it("returns 0 for empty array", () => {
    expect(sumAmounts([])).toBe(0);
  });
});

describe("sumTotal", () => {
  it("sums line items across submissions", () => {
    const data = [
      {
        lineItems: [{ amountPaise: 100 }, { amountPaise: 50 }],
        status: "pending",
      },
      { lineItems: [{ amountPaise: 200 }], status: "approved" },
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
        amountPaise: overrides.amount ?? 100,
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

  it("spans the data itself when the range is all time", () => {
    const jan = new Date(2026, 0, 15).getTime();
    const jul = new Date(2026, 6, 15).getTime();
    const result = computeTrendData(
      [makeItem({ createdAt: jan }), makeItem({ createdAt: jul })],
      null,
      null
    );
    expect(result).toHaveLength(7);
    expect(result.reduce((sum, point) => sum + point.count, 0)).toBe(2);
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
    const janBucket = result.find((r) => r.period === "Jan 2026");
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
    const weekWithData = result.find((r) => r.count > 0);
    expect(weekWithData?.count).toBe(2);
    expect(weekWithData?.amount).toBe(300);
  });
});

describe("spending by expense date", () => {
  afterEach(() => {
    setSystemTime();
  });

  // Submitted 10 April 2026 for an expense on 20 March 2026 (UTC midnight, as Zero sends a date).
  const claim = {
    ...makeItem({ amount: 500, createdAt: new Date(2026, 3, 10).getTime() }),
    expenseDate: Date.UTC(2026, 2, 20),
  };

  it("dates a claim by its expense date, not its submission", () => {
    expect(spentAt(claim)).toBe(new Date(2026, 2, 20).getTime());
  });

  it("lands under a March range, not an April one", () => {
    const march = resolveDateRange("custom", "2026-03-01", "2026-03-31");
    const april = resolveDateRange("custom", "2026-04-01", "2026-04-30");
    expect(filterByDateRange([claim], march, spentAt)).toHaveLength(1);
    expect(filterByDateRange([claim], april, spentAt)).toHaveLength(0);
  });

  it("lands in the financial year of the expense", () => {
    setSystemTime(new Date(2026, 4, 15));
    const thisYear = resolveDateRange("fiscal_year", "", "");
    const lastYear = resolveDateRange("last_fiscal_year", "", "");
    expect(filterByDateRange([claim], thisYear, spentAt)).toHaveLength(0);
    expect(filterByDateRange([claim], lastYear, spentAt)).toHaveLength(1);
  });

  it("buckets the trend by expense month", () => {
    const result = computeTrendData(
      [claim],
      new Date(2026, 0, 1),
      new Date(2026, 5, 30)
    );
    expect(result.find((r) => r.period === "Mar 2026")?.amount).toBe(500);
    expect(result.find((r) => r.period === "Apr 2026")?.count).toBe(0);
  });

  it("dates a vendor payment by its invoice, else its first approved payment", () => {
    const createdAt = new Date(2026, 4, 1).getTime();
    const paidOn = new Date(2026, 3, 5).getTime();
    const transactions = [
      { status: "rejected", transactionDate: paidOn - 1, voidedAt: null },
      { status: "approved", transactionDate: paidOn + 1, voidedAt: paidOn },
      { status: "approved", transactionDate: paidOn, voidedAt: null },
    ];
    expect(
      spentAt({ createdAt, invoiceDate: Date.UTC(2026, 3, 2), transactions })
    ).toBe(new Date(2026, 3, 2).getTime());
    expect(spentAt({ createdAt, invoiceDate: null, transactions })).toBe(
      paidOn
    );
    expect(spentAt({ createdAt, invoiceDate: null, transactions: [] })).toBe(
      createdAt
    );
  });

  it("ignores a rejected invoice's date", () => {
    const paidOn = new Date(2026, 3, 5).getTime();
    expect(
      spentAt({
        createdAt: new Date(2026, 4, 1).getTime(),
        invoiceDate: Date.UTC(2026, 3, 20),
        invoiceRejectionReason: "Wrong vendor",
        transactions: [
          { status: "approved", transactionDate: paidOn, voidedAt: null },
        ],
      })
    ).toBe(paidOn);
  });

  it("falls back to when an advance was raised", () => {
    expect(spentAt({ createdAt: 123 })).toBe(123);
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
    const items = Array.from({ length: 10 }, (_, i) =>
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
    const items = Array.from({ length: 15 }, (_, i) =>
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
      lineItems: [{ amountPaise: amount }],
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
    const items = Array.from({ length: 15 }, (_, i) =>
      makeEventItem(`evt${i}`, 100)
    );
    expect(computeEventData(items)).toHaveLength(10);
  });

  it("skips items with undefined event", () => {
    const item = { event: undefined, lineItems: [{ amountPaise: 100 }] };
    expect(computeEventData([item])).toEqual([]);
  });
});

describe("computeProgrammeData", () => {
  const item = (programme: string | null | undefined, amount: number) => ({
    chargedTo: "event" as const,
    event:
      programme === undefined
        ? null
        : { programme: programme === null ? null : { name: programme } },
    lineItems: [{ amountPaise: amount }],
  });

  it("groups spend by the event's programme, sorted by amount", () => {
    const result = computeProgrammeData([
      item("Education", 100),
      item("Education", 50),
      item("Arts and culture", 400),
    ]);
    expect(result).toEqual([
      { amount: 400, count: 1, name: "Arts and culture" },
      { amount: 150, count: 2, name: "Education" },
    ]);
  });

  it("counts a programme chosen without an event and admin spend", () => {
    const result = computeProgrammeData([
      item("Education", 100),
      {
        chargedProgramme: { name: "Education" },
        chargedProgrammeId: "edu",
        chargedTo: "programme",
        lineItems: [{ amountPaise: 30 }],
      },
      { chargedTo: "organisation", lineItems: [{ amountPaise: 70 }] },
    ]);
    expect(result).toEqual([
      { amount: 130, count: 2, name: "Education" },
      { amount: 70, count: 1, name: "Admin" },
    ]);
  });

  it("buckets legacy advances and programmes that have not loaded", () => {
    const result = computeProgrammeData([
      { lineItems: [{ amountPaise: 10 }] },
      item(null, 20),
      item("Unallocated", 5),
    ]);
    expect(result).toEqual([
      { amount: 20, count: 1, name: "Programme unknown" },
      { amount: 10, count: 1, name: "No programme" },
      { amount: 5, count: 1, name: "Unallocated" },
    ]);
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
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("skips pending items", () => {
    const result = computeApprovalTimeData([makeApprovalItem(1, "pending")]);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("skips items with missing timestamps", () => {
    const result = computeApprovalTimeData([
      { reviewedAt: base, status: "approved", submittedAt: null },
      { reviewedAt: null, status: "approved", submittedAt: base },
    ]);
    expect(result.every((b) => b.count === 0)).toBe(true);
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
    expect(result.every((b) => b.count === 0)).toBe(true);
  });
});
