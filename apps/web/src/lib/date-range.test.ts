import { describe, expect, it } from "vitest";
import { filterByDateRange, resolveDateRange } from "./date-range";

describe("resolveDateRange", () => {
  it("returns null range for 'all' preset", () => {
    const range = resolveDateRange("all", "", "");
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });

  it("resolves known preset keys", () => {
    const range = resolveDateRange("7d", "", "");
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
  });

  it("resolves custom range with valid ISO dates", () => {
    const range = resolveDateRange("custom", "2026-01-01", "2026-03-31");
    expect(range.from?.getFullYear()).toBe(2026);
    expect(range.to?.getMonth()).toBe(2);
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

  it("falls back to null for unknown preset key", () => {
    const range = resolveDateRange("nonexistent", "", "");
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

  it("returns all items when range is null", () => {
    const result = filterByDateRange(items, { from: null, to: null }, accessor);
    expect(result).toHaveLength(4);
  });

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
