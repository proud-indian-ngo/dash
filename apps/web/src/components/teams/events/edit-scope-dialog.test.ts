import { describe, expect, it } from "bun:test";

import {
  pageSeriesStart,
  seriesCancelScopes,
  seriesEditScopes,
} from "./edit-scope-dialog";

describe("seriesCancelScopes", () => {
  const seriesStart = Date.UTC(2026, 9, 3, 4, 30);

  it("offers this and following on a session that hasn't started", () => {
    expect(seriesCancelScopes(seriesStart, "2026-10-24", false)).toEqual([
      "this",
      "following",
      "all",
    ]);
  });

  it("leaves out this and following on a started session", () => {
    expect(seriesCancelScopes(seriesStart, "2026-10-17", true)).toEqual([
      "this",
      "all",
    ]);
  });
});

describe("pageSeriesStart", () => {
  const series = { seriesId: null, startTime: Date.UTC(2026, 9, 3, 4, 30) };

  it("takes a virtual occurrence's series start from the parent", () => {
    // The page event is the parent shifted to 24 October.
    const shifted = { ...series, startTime: Date.UTC(2026, 9, 24, 4, 30) };
    const start = pageSeriesStart(shifted, series, true);
    expect(start).toBe(series.startTime);
    expect(seriesEditScopes(start, "2026-10-24")).toEqual([
      "this",
      "following",
      "all",
    ]);
  });

  it("uses the series row itself on its own page", () => {
    expect(pageSeriesStart(series, undefined, false)).toBe(series.startTime);
  });
});
