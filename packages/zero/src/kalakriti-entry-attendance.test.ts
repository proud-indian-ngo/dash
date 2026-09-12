import { describe, expect, it } from "bun:test";

import {
  hasKalakritiSessionAttendance,
  hasKalakritiVenueArrival,
} from "./kalakriti-center-scan-rules";

const scope = { editionId: "edition", sessionId: "actual-session" };
const attendance = {
  type: "competition_attendance",
  editionId: "edition",
  competitionSessionId: "actual-session",
  supersededByOperationId: null,
};

describe("Entry session attendance projection", () => {
  it("matches effective attendance to the actual session and Edition", () => {
    expect(hasKalakritiSessionAttendance([attendance], scope)).toBe(true);
    expect(hasKalakritiSessionAttendance([], scope)).toBe(false);
  });
  it.each([
    { ...attendance, competitionSessionId: "other-session" },
    { ...attendance, competitionSessionId: "division-id" },
    { ...attendance, editionId: "other-edition" },
    { ...attendance, supersededByOperationId: "replacement" },
    { ...attendance, type: "venue_arrival" },
    { ...attendance, competitionSessionId: null },
    { ...attendance, competitionSessionId: undefined },
    { ...attendance, editionId: undefined },
  ])(
    "does not count an unrelated, incomplete, or superseded mark %j",
    (operation) => {
      expect(hasKalakritiSessionAttendance([operation], scope)).toBe(false);
    }
  );
  it("treats duplicate marks as one Student status and preserves historical presence after return", () => {
    const operations = [
      attendance,
      attendance,
      { ...attendance, type: "venue_arrival" },
      { ...attendance, type: "venue_departure" },
      { ...attendance, type: "drop_off" },
    ];
    expect(hasKalakritiSessionAttendance(operations, scope)).toBe(true);
    expect(hasKalakritiVenueArrival(operations)).toBe(true);
  });
});
