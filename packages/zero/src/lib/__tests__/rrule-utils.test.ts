import { describe, expect, it } from "vitest";
import {
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
