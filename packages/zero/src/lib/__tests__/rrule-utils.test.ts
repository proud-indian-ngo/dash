import { describe, expect, it } from "vitest";
import {
  expandSeries,
  formStateToRRule,
  rruleToFormState,
  rruleToLabel,
  toISODate,
  truncateRRule,
} from "../rrule-utils";

describe("toISODate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 3, 12))).toBe("2026-04-12");
  });

  it("pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("expandSeries", () => {
  const rule = { rrule: "FREQ=WEEKLY;BYDAY=SA" };
  // Saturday April 4, 2026 at 10:00 AM
  const seriesStart = new Date(2026, 3, 4, 10, 0).getTime();
  const seriesEnd = new Date(2026, 3, 4, 12, 0).getTime(); // 2h duration

  it("expands weekly occurrences within range", () => {
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 30).getTime();

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    // April 2026 Saturdays: 4, 11, 18, 25
    expect(result).toHaveLength(4);
    expect(result.map((o) => o.date)).toEqual([
      "2026-04-04",
      "2026-04-11",
      "2026-04-18",
      "2026-04-25",
    ]);
  });

  it("preserves duration from series", () => {
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 7).getTime();

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(1);
    // Duration should be 2 hours
    const endTime = result[0]?.endTime;
    const startTime = result[0]?.startTime;
    expect(endTime).not.toBeNull();
    expect(startTime).toBeDefined();
    expect((endTime as number) - (startTime as number)).toBe(
      2 * 60 * 60 * 1000
    );
  });

  it("handles null endTime (no duration)", () => {
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 7).getTime();

    const result = expandSeries(rule, seriesStart, null, rangeStart, rangeEnd);

    expect(result[0]?.endTime).toBeNull();
  });

  it("excludes exdates", () => {
    const ruleWithExdates = {
      rrule: "FREQ=WEEKLY;BYDAY=SA",
      exdates: ["2026-04-11", "2026-04-25"],
    };
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 30).getTime();

    const result = expandSeries(
      ruleWithExdates,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result.map((o) => o.date)).toEqual(["2026-04-04", "2026-04-18"]);
  });

  it("excludes materialized exception dates", () => {
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 30).getTime();
    const exceptionDates = new Set(["2026-04-18"]);

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd,
      exceptionDates
    );

    expect(result.map((o) => o.date)).toEqual([
      "2026-04-04",
      "2026-04-11",
      "2026-04-25",
    ]);
  });

  it("handles daily frequency", () => {
    const dailyRule = { rrule: "FREQ=DAILY;COUNT=5" };
    const start = new Date(2026, 3, 1, 9, 0).getTime();
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 3, 30).getTime();

    const result = expandSeries(dailyRule, start, null, rangeStart, rangeEnd);

    expect(result).toHaveLength(5);
  });

  it("handles monthly with nth weekday", () => {
    // First Saturday of every month
    const monthlyRule = { rrule: "FREQ=MONTHLY;BYDAY=1SA" };
    const start = new Date(2026, 3, 4, 10, 0).getTime(); // Sat Apr 4
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 5, 30).getTime(); // Through June

    const result = expandSeries(monthlyRule, start, null, rangeStart, rangeEnd);

    // First Saturdays: Apr 4, May 2, Jun 6
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("handles biweekly (interval=2)", () => {
    const biweeklyRule = { rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU" };
    const start = new Date(2026, 3, 7, 14, 0).getTime(); // Tue Apr 7
    const rangeStart = new Date(2026, 3, 1).getTime();
    const rangeEnd = new Date(2026, 4, 31).getTime(); // Through May

    const result = expandSeries(
      biweeklyRule,
      start,
      null,
      rangeStart,
      rangeEnd
    );

    // Should be every other Tuesday
    expect(result.length).toBeGreaterThanOrEqual(3);
    // Verify 2-week gaps
    if (result.length >= 2) {
      const d1 = new Date(result[0]?.date ?? "").getTime();
      const d2 = new Date(result[1]?.date ?? "").getTime();
      const daysBetween = (d2 - d1) / (24 * 60 * 60 * 1000);
      expect(daysBetween).toBe(14);
    }
  });

  it("returns empty array for range with no occurrences", () => {
    const rangeStart = new Date(2026, 3, 6).getTime(); // Monday
    const rangeEnd = new Date(2026, 3, 10).getTime(); // Friday

    const result = expandSeries(
      rule,
      seriesStart,
      seriesEnd,
      rangeStart,
      rangeEnd
    );

    expect(result).toHaveLength(0);
  });
});

describe("rruleToFormState", () => {
  it("parses a simple weekly rule", () => {
    const state = rruleToFormState("FREQ=WEEKLY;BYDAY=SA");
    expect(state.frequency).toBe("weekly");
    expect(state.interval).toBe(1);
    expect(state.byDay).toContain(5); // SA = 5 in rrule.js
    expect(state.endType).toBe("never");
  });

  it("parses a biweekly rule", () => {
    const state = rruleToFormState("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(state.frequency).toBe("weekly");
    expect(state.interval).toBe(2);
  });

  it("parses a rule with COUNT", () => {
    const state = rruleToFormState("FREQ=DAILY;COUNT=30");
    expect(state.frequency).toBe("daily");
    expect(state.endType).toBe("count");
    expect(state.count).toBe(30);
  });

  it("parses a rule with UNTIL", () => {
    const state = rruleToFormState(
      "FREQ=MONTHLY;BYDAY=1SA;UNTIL=20261231T235959Z"
    );
    expect(state.frequency).toBe("monthly");
    expect(state.endType).toBe("until");
    expect(state.until).toBe("2026-12-31");
  });

  it("parses multi-day weekly rule", () => {
    const state = rruleToFormState("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(state.byDay).toHaveLength(3);
  });
});

describe("formStateToRRule", () => {
  it("generates a simple weekly rule", () => {
    const rrule = formStateToRRule({
      frequency: "weekly",
      interval: 1,
      byDay: [5], // SA
      endType: "never",
    });
    expect(rrule).toContain("FREQ=WEEKLY");
    expect(rrule).toContain("BYDAY=SA");
  });

  it("generates a biweekly rule", () => {
    const rrule = formStateToRRule({
      frequency: "weekly",
      interval: 2,
      byDay: [1], // TU
      endType: "never",
    });
    expect(rrule).toContain("INTERVAL=2");
  });

  it("generates a rule with COUNT", () => {
    const rrule = formStateToRRule({
      frequency: "daily",
      interval: 1,
      byDay: [],
      endType: "count",
      count: 30,
    });
    expect(rrule).toContain("COUNT=30");
  });

  it("generates a rule with UNTIL", () => {
    const rrule = formStateToRRule({
      frequency: "monthly",
      interval: 1,
      byDay: [5], // SA
      bySetPos: 1,
      endType: "until",
      until: "2026-12-31",
    });
    expect(rrule).toContain("UNTIL=");
    expect(rrule).toContain("BYSETPOS=1");
  });

  it("round-trips through formState and back", () => {
    const original = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR";
    const state = rruleToFormState(original);
    const rebuilt = formStateToRRule(state);

    // Re-parse both and compare semantics (not exact string)
    const stateFromRebuilt = rruleToFormState(rebuilt);
    expect(stateFromRebuilt.frequency).toBe(state.frequency);
    expect(stateFromRebuilt.interval).toBe(state.interval);
    expect(stateFromRebuilt.byDay.sort()).toEqual(state.byDay.sort());
    expect(stateFromRebuilt.endType).toBe(state.endType);
  });
});

describe("rruleToLabel", () => {
  it("generates human-readable text for weekly", () => {
    const label = rruleToLabel("FREQ=WEEKLY;BYDAY=SA");
    expect(label.toLowerCase()).toContain("week");
  });

  it("generates human-readable text for daily", () => {
    const label = rruleToLabel("FREQ=DAILY");
    expect(label.toLowerCase()).toContain("day");
  });

  it("returns fallback for invalid input", () => {
    const label = rruleToLabel("NOT_A_RULE");
    expect(label).toBe("Recurring");
  });
});

describe("truncateRRule", () => {
  it("adds UNTIL to a rule without one", () => {
    const result = truncateRRule("FREQ=WEEKLY;BYDAY=SA", "2026-04-18");
    expect(result).toContain("UNTIL=");
    // Should be day before: April 17
    expect(result).toContain("20260417");
  });

  it("replaces existing UNTIL", () => {
    const result = truncateRRule(
      "FREQ=WEEKLY;BYDAY=SA;UNTIL=20261231T235959Z",
      "2026-06-01"
    );
    // Should now be May 31
    expect(result).toContain("20260531");
    expect(result).not.toContain("20261231");
  });

  it("removes COUNT when adding UNTIL", () => {
    const result = truncateRRule("FREQ=DAILY;COUNT=100", "2026-05-01");
    expect(result).toContain("UNTIL=");
    expect(result).not.toContain("COUNT=");
  });
});
