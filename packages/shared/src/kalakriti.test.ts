import { describe, expect, it } from "vitest";
import {
  canManageKalakritiResponsibility,
  deriveKalakritiAgeCategory,
  findKalakritiAgeCategoryOverlap,
  normalizeKalakritiCenterName,
  requireKalakritiAgeCategoryOverrideReason,
} from "./kalakriti";

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
