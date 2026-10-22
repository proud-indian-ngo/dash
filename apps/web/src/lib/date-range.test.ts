import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { filterByDateRange, resolveDateRange } from "./date-range";

describe("rolling presets", () => {
  afterEach(() => {
    setSystemTime();
  });

  it("start at the start of the day, so a spend dated that day counts", () => {
    setSystemTime(new Date(2026, 4, 15, 14, 30));
    const items = [
      { ts: new Date(2026, 4, 8).getTime() },
      { ts: new Date(2026, 3, 15).getTime() },
      { ts: new Date(2026, 1, 15).getTime() },
    ];
    for (const [key, expected] of [
      ["7d", 1],
      ["30d", 2],
      ["3m", 3],
    ] as const) {
      const range = resolveDateRange(key, "", "");
      expect(filterByDateRange(items, range, (i) => i.ts)).toHaveLength(
        expected
      );
    }
  });
});

describe("resolveDateRange", () => {
  it("resolves last fiscal year as April to the end of March", () => {
    const { from, to } = resolveDateRange("last_fiscal_year", "", "");
    expect([from?.getMonth(), from?.getDate()]).toEqual([3, 1]);
    expect([to?.getMonth(), to?.getDate()]).toEqual([2, 31]);
    expect((to?.getFullYear() ?? 0) - (from?.getFullYear() ?? 0)).toBe(1);
  });

  it("includes the whole end day of a custom range", () => {
    const range = resolveDateRange("custom", "2026-01-01", "2026-03-31");
    const items = [
      { id: "end-day-evening", ts: new Date(2026, 2, 31, 18, 30).getTime() },
      { id: "next-day", ts: new Date(2026, 3, 1).getTime() },
    ];
    const result = filterByDateRange(items, range, (item) => item.ts);
    expect(result.map((item) => item.id)).toEqual(["end-day-evening"]);
  });

  it("falls back to null for invalid custom dates", () => {
    const range = resolveDateRange("custom", "garbage", "also-garbage");
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });

  it("falls back to null for partially invalid custom dates", () => {
    const range = resolveDateRange("custom", "2026-01-01", "invalid");
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });
});

describe("filterByDateRange", () => {
  const items = [
    { id: 1, ts: new Date(2026, 0, 10).getTime() },
    { id: 2, ts: new Date(2026, 0, 20).getTime() },
    { id: 3, ts: new Date(2026, 1, 5).getTime() },
    { id: 4, ts: null as number | null },
  ];
  const accessor = (item: (typeof items)[number]) => item.ts;

  it("filters items within date range", () => {
    const result = filterByDateRange(
      items,
      {
        from: new Date(2026, 0, 15),
        to: new Date(2026, 0, 25),
      },
      accessor
    );
    expect(result).toHaveLength(1);
    expect(result.at(0)?.id).toBe(2);
  });

  it("excludes items with null timestamps", () => {
    const result = filterByDateRange(
      items,
      {
        from: new Date(2025, 0, 1),
        to: new Date(2027, 0, 1),
      },
      accessor
    );
    expect(result).toHaveLength(3);
    expect(result.every((i) => i.ts !== null)).toBe(true);
  });

  it("handles from-only range", () => {
    const result = filterByDateRange(
      items,
      { from: new Date(2026, 0, 15), to: null },
      accessor
    );
    expect(result).toHaveLength(2);
  });
});
