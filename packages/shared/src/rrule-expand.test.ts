import { describe, expect, it } from "vitest";

import {
  expandSeries,
  findOccurrence,
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
    const rule = { exdates: ["2026-04-07"], rrule: "FREQ=WEEKLY;BYDAY=MO" };
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
    const [occ] = result;
    if (
      !occ ||
      typeof occ.startTime !== "number" ||
      typeof occ.endTime !== "number"
    ) {
      throw new Error("Expected occurrence with numeric start and end times");
    }
    expect(occ.endTime - occ.startTime).toBe(2 * 60 * 60 * 1000); // 2 hours
  });

  it("excludes exdates from rule", () => {
    const ruleWithExdates: RecurrenceRule = {
      exdates: ["2026-04-13"],
      rrule: "FREQ=WEEKLY;BYDAY=MO",
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

  it("excludes dates matching excludeRules", () => {
    // Weekly on Saturdays, starting 2026-04-04 (Saturday) at 10:00 UTC
    // April 2026 Saturdays: 4(1st), 11(2nd), 18(3rd), 25(4th)
    // May 2026 Saturdays: 2(1st), 9(2nd), 16(3rd), 23(4th), 30(5th)
    const satRule: RecurrenceRule = {
      excludeRules: ["FREQ=MONTHLY;BYDAY=SA;BYSETPOS=3"],
      rrule: "FREQ=WEEKLY;BYDAY=SA",
    };
    const satStart = Date.UTC(2026, 3, 4, 10, 0); // 2026-04-04 Saturday
    const satEnd = Date.UTC(2026, 3, 4, 12, 0);
    // Range: April 4 – May 31 2026
    const rangeStart = Date.UTC(2026, 3, 4, 0, 0);
    const rangeEnd = Date.UTC(2026, 4, 31, 23, 59);

    const result = expandSeries(
      satRule,
      satStart,
      satEnd,
      rangeStart,
      rangeEnd
    );

    const dates = result.map((o) => o.date);
    // 3rd Saturdays: Apr 18, May 16 — should be excluded
    expect(dates).not.toContain("2026-04-18");
    expect(dates).not.toContain("2026-05-16");
    // Other Saturdays should still be present
    expect(dates).toContain("2026-04-04");
    expect(dates).toContain("2026-04-11");
    expect(dates).toContain("2026-04-25");
  });

  it("combines multiple excludeRules", () => {
    const satRule: RecurrenceRule = {
      excludeRules: [
        "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=1",
        "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=3",
      ],
      rrule: "FREQ=WEEKLY;BYDAY=SA",
    };
    const satStart = Date.UTC(2026, 3, 4, 10, 0);
    const satEnd = Date.UTC(2026, 3, 4, 12, 0);
    const rangeStart = Date.UTC(2026, 3, 4, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 30, 23, 59);

    const result = expandSeries(
      satRule,
      satStart,
      satEnd,
      rangeStart,
      rangeEnd
    );

    const dates = result.map((o) => o.date);
    // 1st Saturday Apr 4, 3rd Saturday Apr 18 — both excluded
    expect(dates).not.toContain("2026-04-04");
    expect(dates).not.toContain("2026-04-18");
    // 2nd (Apr 11) and 4th (Apr 25) remain
    expect(dates).toContain("2026-04-11");
    expect(dates).toContain("2026-04-25");
  });

  it("handles undefined excludeRules (backward compat)", () => {
    const rangeStart = Date.UTC(2026, 3, 6, 0, 0);
    const rangeEnd = Date.UTC(2026, 3, 20, 23, 59);

    const result = expandSeries(
      { rrule: "FREQ=WEEKLY;BYDAY=MO" },
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(3);
  });
});

describe("parseRecurrenceRule string storage", () => {
  it("accepts a rule stored as a JSON string", () => {
    expect(parseRecurrenceRule('{"rrule":"FREQ=WEEKLY"}')).toEqual({
      rrule: "FREQ=WEEKLY",
    });
    expect(parseRecurrenceRule("not json")).toBeNull();
    expect(parseRecurrenceRule('"FREQ=WEEKLY"')).toBeNull();
  });
});

describe("findOccurrence", () => {
  // Weekly on Saturdays at 04:30Z from 2026-09-05.
  const start = Date.UTC(2026, 8, 5, 4, 30);
  const rule = { exdates: ["2026-10-17"], rrule: "FREQ=WEEKLY;BYDAY=SA" };

  it("returns the session on a matching date", () => {
    expect(
      findOccurrence(rule, start, start + 7_200_000, "2026-10-10")
    ).toEqual({
      date: "2026-10-10",
      endTime: Date.UTC(2026, 9, 10, 6, 30),
      startTime: Date.UTC(2026, 9, 10, 4, 30),
    });
  });

  it("rejects dates the rule skips or never produces", () => {
    expect(findOccurrence(rule, start, null, "2026-10-17")).toBeNull();
    expect(findOccurrence(rule, start, null, "2026-10-11")).toBeNull();
    expect(findOccurrence(rule, start, null, "2026-08-29")).toBeNull();
    expect(findOccurrence(rule, start, null, "not-a-date")).toBeNull();
  });
});
