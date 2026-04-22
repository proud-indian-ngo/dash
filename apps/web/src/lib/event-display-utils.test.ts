import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandSeriesOccurrences,
  sortUpcomingFirstThenPast,
} from "./event-display-utils";

describe("sortUpcomingFirstThenPast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("places upcoming before past", () => {
    const rows = [
      { startTime: Date.UTC(2026, 3, 20), label: "past" },
      { startTime: Date.UTC(2026, 3, 25), label: "upcoming" },
    ];
    sortUpcomingFirstThenPast(rows);
    expect(rows.map((r) => r.label)).toEqual(["upcoming", "past"]);
  });

  it("sorts upcoming ascending (nearest first)", () => {
    const rows = [
      { startTime: Date.UTC(2026, 3, 30), label: "far" },
      { startTime: Date.UTC(2026, 3, 23), label: "near" },
      { startTime: Date.UTC(2026, 3, 26), label: "mid" },
    ];
    sortUpcomingFirstThenPast(rows);
    expect(rows.map((r) => r.label)).toEqual(["near", "mid", "far"]);
  });

  it("sorts past descending (most recent first)", () => {
    const rows = [
      { startTime: Date.UTC(2026, 3, 10), label: "old" },
      { startTime: Date.UTC(2026, 3, 21), label: "recent" },
      { startTime: Date.UTC(2026, 3, 15), label: "mid" },
    ];
    sortUpcomingFirstThenPast(rows);
    expect(rows.map((r) => r.label)).toEqual(["recent", "mid", "old"]);
  });

  it("handles mixed upcoming and past", () => {
    const rows = [
      { startTime: Date.UTC(2026, 3, 10), label: "past-old" },
      { startTime: Date.UTC(2026, 3, 30), label: "upcoming-far" },
      { startTime: Date.UTC(2026, 3, 21), label: "past-recent" },
      { startTime: Date.UTC(2026, 3, 23), label: "upcoming-near" },
    ];
    sortUpcomingFirstThenPast(rows);
    expect(rows.map((r) => r.label)).toEqual([
      "upcoming-near",
      "upcoming-far",
      "past-recent",
      "past-old",
    ]);
  });

  it("returns the same array reference", () => {
    const rows = [{ startTime: Date.UTC(2026, 3, 25) }];
    const result = sortUpcomingFirstThenPast(rows);
    expect(result).toBe(rows);
  });

  it("handles empty array", () => {
    const rows: { startTime: number }[] = [];
    expect(sortUpcomingFirstThenPast(rows)).toEqual([]);
  });
});

describe("expandSeriesOccurrences", () => {
  it("returns null for null recurrence rule", () => {
    expect(
      expandSeriesOccurrences(null, Date.now(), null, [], 0, Date.now())
    ).toBeNull();
  });

  it("returns null for invalid recurrence rule", () => {
    expect(
      expandSeriesOccurrences("invalid", Date.now(), null, [], 0, Date.now())
    ).toBeNull();
  });

  it("returns null for non-object recurrence rule", () => {
    expect(
      expandSeriesOccurrences(42, Date.now(), null, [], 0, Date.now())
    ).toBeNull();
  });

  const weeklyRule = { rrule: "FREQ=WEEKLY" };
  const seriesStart = Date.UTC(2026, 3, 6, 10, 0); // Monday Apr 6
  const seriesEnd = Date.UTC(2026, 3, 6, 12, 0);

  function expandWeekly(
    rangeEnd: number,
    exceptions: { originalDate: string | null }[] = [],
    rangeStart = Date.UTC(2026, 3, 6, 0, 0)
  ) {
    const result = expandSeriesOccurrences(
      weeklyRule,
      seriesStart,
      seriesEnd,
      exceptions,
      rangeStart,
      rangeEnd
    );
    if (!result) {
      throw new Error("Expected non-null result");
    }
    return result;
  }

  it("expands weekly series into occurrences", () => {
    const result = expandWeekly(Date.UTC(2026, 3, 27, 23, 59));

    expect(result.occurrences.length).toBeGreaterThanOrEqual(3);
    expect(result.seriesStartDate).toBe("2026-04-06");
  });

  it("marks series start date as seriesParent", () => {
    const result = expandWeekly(Date.UTC(2026, 3, 20, 23, 59));

    const parent = result.occurrences.find((o) => o.isSeriesParent);
    expect(parent).toBeDefined();
    expect(parent?.date).toBe("2026-04-06");

    const virtuals = result.occurrences.filter((o) => !o.isSeriesParent);
    expect(virtuals.length).toBeGreaterThan(0);
  });

  it("excludes exception dates from virtual occurrences", () => {
    const result = expandWeekly(Date.UTC(2026, 3, 27, 23, 59), [
      { originalDate: "2026-04-13" },
    ]);

    const dates = result.occurrences.map((o) => o.date);
    expect(dates).not.toContain("2026-04-13");
    expect(dates).toContain("2026-04-06");
    expect(dates).toContain("2026-04-20");
  });

  it("returns virtualOccs array matching occurrences length", () => {
    const dailyRule = { rrule: "FREQ=DAILY" };
    const result = expandSeriesOccurrences(
      dailyRule,
      Date.UTC(2026, 3, 1, 9, 0),
      Date.UTC(2026, 3, 1, 10, 0),
      [],
      Date.UTC(2026, 3, 1, 0, 0),
      Date.UTC(2026, 3, 3, 23, 59)
    );
    if (!result) {
      throw new Error("Expected non-null result");
    }

    expect(result.virtualOccs.length).toBe(result.occurrences.length);
  });
});
