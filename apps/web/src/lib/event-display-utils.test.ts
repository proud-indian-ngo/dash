import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  expandSeriesOccurrences,
  sessionOccDate,
  startDateRow,
} from "./event-display-utils";

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

  describe("outside UTC", () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = "Asia/Kolkata";
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("marks a series starting before the UTC date changes as seriesParent", () => {
      // Monday Apr 6, 00:00 in Kolkata is Sunday Apr 5, 18:30 UTC.
      const start = Date.UTC(2026, 3, 5, 18, 30);
      const result = expandSeriesOccurrences(
        weeklyRule,
        start,
        start + 3_600_000,
        [],
        Date.UTC(2026, 3, 5, 0, 0),
        Date.UTC(2026, 3, 20, 23, 59)
      );

      expect(result?.seriesStartDate).toBe("2026-04-05");
      const parents = result?.occurrences.filter((o) => o.isSeriesParent);
      expect(parents?.map((o) => o.startTime)).toEqual([start]);
    });
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

describe("sessionOccDate", () => {
  const series = {
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    seriesId: null,
    startTime: Date.UTC(2026, 9, 3, 4, 30),
  };

  it("shows the series parent itself on its own start date", () => {
    expect(sessionOccDate(series, "2026-10-03")).toBeUndefined();
  });

  it("keeps later dates as virtual occurrences", () => {
    expect(sessionOccDate(series, "2026-10-10")).toBe("2026-10-10");
  });

  it("leaves standalone events and exceptions alone", () => {
    expect(
      sessionOccDate({ ...series, recurrenceRule: null }, "2026-10-03")
    ).toBe("2026-10-03");
    expect(sessionOccDate({ ...series, seriesId: "s" }, "2026-10-03")).toBe(
      "2026-10-03"
    );
  });
});

describe("startDateRow", () => {
  const series = {
    exceptions: [
      { cancelledAt: null, id: "exc-later", originalDate: "2026-10-10" },
      { cancelledAt: null, id: "exc-first", originalDate: "2026-10-03" },
    ],
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    seriesId: null,
    startTime: Date.UTC(2026, 9, 3, 4, 30),
  };

  it("finds a live row saved on the series' own start date", () => {
    expect(startDateRow(series)).toEqual({ cancelled: false, id: "exc-first" });
  });

  it("flags a cancelled start-date row", () => {
    expect(
      startDateRow({
        ...series,
        exceptions: [
          { cancelledAt: 1, id: "exc-first", originalDate: "2026-10-03" },
        ],
      })
    ).toEqual({ cancelled: true, id: "exc-first" });
  });

  it("finds nothing without one, or on a row that is not a parent", () => {
    expect(
      startDateRow({ ...series, exceptions: series.exceptions.slice(0, 1) })
    ).toBeUndefined();
    expect(startDateRow({ ...series, seriesId: "s" })).toBeUndefined();
  });
});
