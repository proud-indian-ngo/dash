import { describe, expect, it } from "bun:test";

import { deriveCompetitionStatus } from "./kalakriti-competition-status";

const competition = {
  cancelled: false,
  retired: false,
  endAt: 2000,
  hasAttendance: false,
  hasPublishedWinner: false,
};

describe("Competition operational status", () => {
  it("stays scheduled until a participant is scanned", () => {
    expect(deriveCompetitionStatus(competition, 1500)).toBe("scheduled");
    expect(
      deriveCompetitionStatus({ ...competition, hasAttendance: true }, 1500)
    ).toBe("running");
  });
  it("finishes at the end time even without a scan", () => {
    expect(deriveCompetitionStatus(competition, 1999)).toBe("scheduled");
    expect(deriveCompetitionStatus(competition, 2000)).toBe("finished");
    expect(
      deriveCompetitionStatus({ ...competition, hasAttendance: true }, 2000)
    ).toBe("finished");
  });
  it("prioritizes published winners over time and attendance", () => {
    expect(
      deriveCompetitionStatus(
        { ...competition, hasPublishedWinner: true },
        2500
      )
    ).toBe("winner_assigned");
  });
  it("keeps cancellation and retirement ahead of published results", () => {
    expect(
      deriveCompetitionStatus(
        { ...competition, cancelled: true, hasPublishedWinner: true },
        2500
      )
    ).toBe("cancelled");
    expect(
      deriveCompetitionStatus(
        { ...competition, retired: true, hasPublishedWinner: true },
        2500
      )
    ).toBe("retired");
  });
  it("does not invent a schedule", () => {
    expect(deriveCompetitionStatus({ ...competition, endAt: null }, 2500)).toBe(
      "not_scheduled"
    );
  });
});
