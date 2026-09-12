import { describe, expect, it } from "bun:test";

import { hasKalakritiVenueArrival } from "./kalakriti-center-scan-rules";
import { getKalakritiFoodStatus } from "./kalakriti-food-rules";

const mark = (type: string, supersededByOperationId: string | null = null) => ({
  type,
  supersededByOperationId,
});

describe("Food eligibility and historical status", () => {
  it("includes a registered but not-yet-picked-up Student without claiming eligibility", () => {
    expect(getKalakritiFoodStatus({ kind: "student", operations: [] })).toEqual(
      {
        eligible: false,
        breakfastServed: false,
        lunchServed: false,
        checkedIn: false,
        arrived: false,
      }
    );
  });
  it("uses effective pickup for Students and effective check-in for Volunteers", () => {
    expect(
      getKalakritiFoodStatus({ kind: "student", operations: [mark("pickup")] })
        .eligible
    ).toBe(true);
    expect(
      getKalakritiFoodStatus({
        kind: "volunteer",
        state: "active",
        operations: [mark("volunteer_check_in")],
      }).eligible
    ).toBe(true);
    expect(
      getKalakritiFoodStatus({
        kind: "student",
        operations: [mark("pickup", "replacement")],
      }).eligible
    ).toBe(false);
    expect(
      getKalakritiFoodStatus({
        kind: "volunteer",
        state: "active",
        operations: [mark("volunteer_check_in", "replacement")],
      }).eligible
    ).toBe(false);
  });
  it("requires only active Guardian registration, not a Center, pickup, or check-in", () => {
    expect(
      getKalakritiFoodStatus({
        kind: "guardian",
        state: "active",
        operations: [],
      }).eligible
    ).toBe(true);
    expect(
      getKalakritiFoodStatus({ kind: "guardian", operations: [] }).eligible
    ).toBe(false);
  });
  it.each(["volunteer", "guardian"] as const)(
    "retains %s meal history but denies archived eligibility",
    (kind) => {
      const status = getKalakritiFoodStatus({
        kind,
        state: "archived",
        operations: [
          mark("volunteer_check_in"),
          mark("breakfast"),
          mark("lunch", "replacement"),
        ],
      });
      expect(status.eligible).toBe(false);
      expect(status.breakfastServed).toBe(true);
      expect(status.lunchServed).toBe(false);
    }
  );
  it("keeps arrival Yes after venue departure and return, ignoring superseded arrival", () => {
    const operations = [
      mark("venue_arrival"),
      mark("venue_departure"),
      mark("drop_off"),
    ];
    expect(hasKalakritiVenueArrival(operations)).toBe(true);
    expect(
      getKalakritiFoodStatus({ kind: "student", operations }).arrived
    ).toBe(true);
    expect(
      hasKalakritiVenueArrival([
        mark("venue_arrival", "replacement"),
        mark("drop_off"),
      ])
    ).toBe(false);
  });
});
