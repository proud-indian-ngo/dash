import { describe, expect, it } from "bun:test";

import {
  countScheduledSessionsByVenue,
  getCompetitionPageMetrics,
} from "./kalakriti-competition-page-metrics";

describe("competition page metrics", () => {
  it("counts active Divisions and excludes cancelled Sessions and Competitions", () => {
    const metrics = getCompetitionPageMetrics(
      [
        {
          id: "active",
          cancelledAt: null,
          retiredAt: null,
          divisions: [{ id: "one" }, { id: "two" }],
        },
        {
          id: "cancelled",
          cancelledAt: 1,
          retiredAt: null,
          divisions: [{ id: "three" }],
        },
        {
          id: "missing",
          cancelledAt: null,
          retiredAt: null,
          divisions: [],
        },
      ],
      [
        { cancelledAt: null, divisionId: "one", venueId: "venue-a" },
        { cancelledAt: 1, divisionId: "two", venueId: "venue-b" },
        { cancelledAt: null, divisionId: "three", venueId: "venue-c" },
      ]
    );
    expect(metrics).toEqual({
      activeCompetitions: 2,
      activeDivisions: 2,
      activeSessions: 1,
      cancelledSessions: 1,
      missingDivisions: 1,
      scheduledVenues: 1,
      unscheduledDivisions: 1,
    });
  });

  it("only counts active Competition Sessions at each Venue", () => {
    const active = { cancelledAt: null, retiredAt: null };
    const cancelled = { cancelledAt: 1, retiredAt: null };
    const counts = countScheduledSessionsByVenue([
      { cancelledAt: null, venueId: "a", division: { competition: active } },
      { cancelledAt: 1, venueId: "a", division: { competition: active } },
      { cancelledAt: null, venueId: "a", division: { competition: cancelled } },
      { cancelledAt: null, venueId: "b", division: null },
    ]);
    expect([...counts.entries()]).toEqual([["a", 1]]);
  });
});
