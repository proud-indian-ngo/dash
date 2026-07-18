import { describe, expect, it } from "vitest";
import {
  canManageKalakritiResponsibility,
  deriveKalakritiAgeCategory,
  findKalakritiAgeCategoryOverlap,
  formatKalakritiStudentHumanId,
  hasValidKalakritiGroupRules,
  normalizeKalakritiCenterName,
  requireKalakritiAgeCategoryOverrideReason,
  validateKalakritiSessionSchedule,
} from "./kalakriti";

describe("formatKalakritiStudentHumanId", () => {
  it("formats an Edition-scoped monotonic sequence", () => {
    expect(formatKalakritiStudentHumanId(2027, 12)).toBe("KAL-2027-0012");
  });
});

describe("canManageKalakritiResponsibility", () => {
  it("allows Edition Administrators to manage Edition roles", () => {
    expect(
      canManageKalakritiResponsibility(
        ["edition_admin"],
        "volunteer_coordinator"
      )
    ).toBe(true);
  });

  it("prevents Volunteer Coordinators from appointing administrators", () => {
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "edition_admin"
      )
    ).toBe(false);
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "volunteer_coordinator"
      )
    ).toBe(false);
  });

  it("allows Volunteer Coordinators to assign operational roles", () => {
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "overall_events_lead"
      )
    ).toBe(true);
  });
});

describe("Kalakriti Age Categories", () => {
  const categories = [
    { id: "junior", maximumAge: 10, minimumAge: 8, name: "Junior" },
    { id: "senior", maximumAge: 14, minimumAge: 12, name: "Senior" },
  ];

  it("classifies inclusive birthday boundaries using date-only values", () => {
    expect(
      deriveKalakritiAgeCategory("2017-06-01", "2027-06-01", categories)
    ).toMatchObject({ age: 10, category: { id: "junior" }, eligible: true });
    expect(
      deriveKalakritiAgeCategory("2017-06-02", "2027-06-01", categories)
    ).toMatchObject({ age: 9, category: { id: "junior" }, eligible: true });
  });

  it("returns an explicit ineligible result for intentional gaps", () => {
    expect(
      deriveKalakritiAgeCategory("2016-06-01", "2027-06-01", categories)
    ).toEqual({ age: 11, eligible: false, reason: "no_matching_category" });
  });

  it("detects inclusive range overlap", () => {
    expect(
      findKalakritiAgeCategoryOverlap([
        ...categories,
        { id: "overlap", maximumAge: 16, minimumAge: 14, name: "Overlap" },
      ])
    ).toEqual(["Senior", "Overlap"]);
  });

  it("requires a meaningful override reason", () => {
    expect(() => requireKalakritiAgeCategoryOverrideReason("  ")).toThrow(
      "reason is required"
    );
    expect(requireKalakritiAgeCategoryOverrideReason("  School record  ")).toBe(
      "School record"
    );
  });
});

describe("normalizeKalakritiCenterName", () => {
  it("normalizes Unicode, whitespace, and case for Edition uniqueness", () => {
    expect(normalizeKalakritiCenterName("  North   Centre  ")).toEqual({
      name: "North Centre",
      normalizedName: "north centre",
    });
    expect(normalizeKalakritiCenterName("ＮＯＲＴＨ Centre")).toEqual({
      name: "NORTH Centre",
      normalizedName: "north centre",
    });
  });
});

describe("Kalakriti Competition configuration", () => {
  it("enforces individual and group participation rules", () => {
    expect(hasValidKalakritiGroupRules("individual", 1, 1)).toBe(true);
    expect(hasValidKalakritiGroupRules("individual", 1, 2)).toBe(false);
    expect(hasValidKalakritiGroupRules("group", 2, 4)).toBe(true);
    expect(hasValidKalakritiGroupRules("group", 1, 4)).toBe(false);
    expect(hasValidKalakritiGroupRules("group", 4, 3)).toBe(false);
  });

  it("accepts same-day back-to-back Sessions in one Venue", () => {
    const existing = {
      cancelledAt: null,
      endAt: Date.parse("2027-11-21T05:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: "venue-1",
    };
    expect(
      validateKalakritiSessionSchedule(
        {
          ...existing,
          endAt: Date.parse("2027-11-21T06:30:00.000Z"),
          id: "session-2",
          startAt: existing.endAt,
        },
        "2027-11-21",
        "Asia/Kolkata",
        [existing]
      )
    ).toEqual({ valid: true });
  });

  it("rejects same-Venue overlap and ignores cancelled Sessions", () => {
    const existing = {
      cancelledAt: null,
      endAt: Date.parse("2027-11-21T06:30:00.000Z"),
      id: "session-1",
      startAt: Date.parse("2027-11-21T04:30:00.000Z"),
      venueId: "venue-1",
    };
    const candidate = {
      cancelledAt: null,
      endAt: Date.parse("2027-11-21T07:00:00.000Z"),
      id: "session-2",
      startAt: Date.parse("2027-11-21T06:00:00.000Z"),
      venueId: "venue-1",
    };
    expect(
      validateKalakritiSessionSchedule(
        candidate,
        "2027-11-21",
        "Asia/Kolkata",
        [existing]
      )
    ).toEqual({
      conflictSessionId: "session-1",
      reason: "venue_overlap",
      valid: false,
    });
    expect(
      validateKalakritiSessionSchedule(
        candidate,
        "2027-11-21",
        "Asia/Kolkata",
        [{ ...existing, cancelledAt: 1 }]
      )
    ).toEqual({ valid: true });
  });

  it("rejects Sessions outside the Edition date in its timezone", () => {
    expect(
      validateKalakritiSessionSchedule(
        {
          cancelledAt: null,
          endAt: Date.parse("2027-11-21T19:00:00.000Z"),
          id: "session-1",
          startAt: Date.parse("2027-11-21T18:00:00.000Z"),
          venueId: "venue-1",
        },
        "2027-11-21",
        "Asia/Kolkata",
        []
      )
    ).toEqual({ reason: "outside_event_date", valid: false });
  });
});
