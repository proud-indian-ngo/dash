import { describe, expect, it } from "vitest";
import {
  expandSeries,
  parseRecurrenceRule,
  type RecurrenceRule,
} from "./rrule-expand";

describe("parseRecurrenceRule", () => {
  it("returns null for null/undefined", () => {
    expect(parseRecurrenceRule(null)).toBeNull();
    expect(parseRecurrenceRule(undefined)).toBeNull();
  });

  it("returns null for non-object", () => {
    expect(parseRecurrenceRule("string")).toBeNull();
    expect(parseRecurrenceRule(42)).toBeNull();
  });

  it("returns null for object without rrule property", () => {
    expect(parseRecurrenceRule({ foo: "bar" })).toBeNull();
  });

  it("parses a valid recurrence rule", () => {
    const rule = { rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: ["2026-04-07"] };
    expect(parseRecurrenceRule(rule)).toEqual(rule);
  });
});

describe("expandSeries", () => {
  // Weekly on Mondays, starting 2026-04-06 (Monday) at 10:00 UTC
  const rule: RecurrenceRule = {
    rrule: "FREQ=WEEKLY;BYDAY=MO",
  };
  const seriesStart = Date.UTC(2026, 3, 6, 10, 0); // 2026-04-06T10:00Z
  const seriesEnd = Date.UTC(2026, 3, 6, 12, 0); // 2h duration

  it("expands occurrences within range", () => {
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 20, 23, 59);

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(3);
    expect(result.map((o) => o.date)).toEqual([
      "2026-04-06",
      "2026-04-13",
      "2026-04-20",
    ]);
  });

  it("preserves duration from series parent", () => {
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 6, 23, 59);

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(1);
    const occ = result[0];
    expect(occ).toBeDefined();
    expect(occ?.endTime).toBeTypeOf("number");
    expect((occ?.endTime ?? 0) - (occ?.startTime ?? 0)).toBe(
      2 * 60 * 60 * 1000
    ); // 2 hours
  });

  it("excludes exdates from rule", () => {
    const ruleWithExdates: RecurrenceRule = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      exdates: ["2026-04-13"],
    };
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 20, 23, 59);

    const result = expandSeries(
      ruleWithExdates,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(2);
    expect(result.map((o) => o.date)).toEqual(["2026-04-06", "2026-04-20"]);
  });

  it("excludes exception dates (materialized rows)", () => {
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 20, 23, 59);

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd,
      new Set(["2026-04-13"])
    );

    expect(result).toHaveLength(2);
    expect(result.map((o) => o.date)).toEqual(["2026-04-06", "2026-04-20"]);
  });

  it("returns empty array for range with no occurrences", () => {
    const rangeStart = Date.UTC(2026, 3, 7, 0, 0); // Tuesday
    const rangeEnd = Date.UTC(2026, 3, 12, 23, 59); // Sunday

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(0);
  });

  it("handles null seriesEnd (no duration)", () => {
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 6, 23, 59);

    const result = expandSeries(rule, seriesStart, null, rangeStart, rangeEnd);

    expect(result).toHaveLength(1);
    expect(result[0]?.endTime).toBeNull();
  });
});
