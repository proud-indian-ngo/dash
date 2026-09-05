import { describe, expect, it } from "bun:test";

import { getKalakritiGoLiveReadiness } from "./kalakriti-go-live-readiness";

const baseSnapshot = {
  ageCategories: [
    {
      femaleStudentLimit: 10,
      id: "age-1",
      maleStudentLimit: 10,
      maximumAge: 12,
      minimumAge: 6,
    },
  ],
  assignments: [
    { responsibility: "overall_events_lead" },
    { responsibility: "transport_lead" },
    { responsibility: "food_lead" },
  ],
  centers: [
    {
      competitionEntryRegistrationEnabled: false,
      id: "center-1",
      retiredAt: null,
      studentRegistrationEnabled: false,
    },
  ],
  competitionCategories: [{ id: "category-1", retiredAt: null }],
  competitions: [
    {
      cancelledAt: null,
      competitionCategoryId: "category-1",
      editionId: "edition-1",
      id: "competition-1",
      retiredAt: null,
    },
  ],
  credentials: [
    {
      membershipId: null,
      revokedAt: null,
      studentId: "student-1",
    },
    {
      membershipId: "volunteer-1",
      revokedAt: null,
      studentId: null,
    },
  ],
  divisions: [
    {
      ageCategoryId: "age-1",
      competitionId: "competition-1",
      id: "division-1",
    },
  ],
  edition: {
    ageCutoffDate: Date.parse("2027-06-30"),
    eventDate: Date.parse("2027-11-21"),
    lifecycle: "registration_locked",
    plannedRegistrationCloseAt: Date.parse("2027-10-31"),
    timezone: "Asia/Kolkata",
  },
  sessions: [
    {
      cancelledAt: null,
      divisionId: "division-1",
      endAt: Date.parse("2027-11-21T11:00:00+05:30"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T10:00:00+05:30"),
      venueId: "venue-1",
    },
  ],
  students: [{ id: "student-1" }],
  transportAssignments: [{ centerId: "center-1" }],
  venues: [{ id: "venue-1", retiredAt: null }],
  volunteerMemberships: [{ id: "volunteer-1" }],
} as const;

describe("getKalakritiGoLiveReadiness", () => {
  it("returns no blockers for a ready locked Edition", () => {
    expect(getKalakritiGoLiveReadiness(baseSnapshot)).toEqual([]);
  });

  it("requires registration_locked lifecycle", () => {
    expect(
      getKalakritiGoLiveReadiness({
        ...baseSnapshot,
        edition: { ...baseSnapshot.edition, lifecycle: "registration_open" },
      }).map((blocker) => blocker.code)
    ).toContain("edition_not_locked");
  });

  it("requires every Center registration control to be disabled", () => {
    expect(
      getKalakritiGoLiveReadiness({
        ...baseSnapshot,
        centers: [
          {
            competitionEntryRegistrationEnabled: true,
            id: "center-1",
            retiredAt: null,
            studentRegistrationEnabled: false,
          },
        ],
      }).map((blocker) => blocker.code)
    ).toContain("center_registration_open");
  });

  it("requires transport assignments and active Credentials", () => {
    const blockers = getKalakritiGoLiveReadiness({
      ...baseSnapshot,
      credentials: [],
      transportAssignments: [],
    }).map((blocker) => blocker.code);
    expect(blockers).toContain("missing_transport_assignment");
    expect(blockers).toContain("student_missing_credential");
  });
});
