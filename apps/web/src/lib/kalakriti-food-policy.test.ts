import { describe, expect, it } from "bun:test";

import {
  canScanKalakritiPerson,
  getKalakritiScanActivities,
} from "./kalakriti-event-day-policy";
import {
  canViewKalakritiFood,
  canUndoKalakritiMeal,
} from "./kalakriti-food-policy";
import { buildKalakritiNavGroups } from "./nav-items";

const candidate = (role: string, centerId: string | null = null) => ({
  isGlobalAdmin: false,
  edition: { lifecycle: "live" },
  membership: {
    kind: "volunteer",
    assignments: [{ responsibility: role, centerId }],
  },
});

describe("Food view and recording authority remain separate", () => {
  it("admits Food staff, administrators, Guardians and scoped Liaisons", () => {
    for (const role of ["edition_admin", "food_lead", "food_member"])
      expect(canViewKalakritiFood(candidate(role))).toBe(true);
    for (const role of [
      "liaison",
      "center_liaison_lead",
      "liaison_volunteer",
    ]) {
      expect(canViewKalakritiFood(candidate(role, "center-a"))).toBe(true);
      expect(canViewKalakritiFood(candidate(role))).toBe(false);
    }
    expect(
      canViewKalakritiFood({ isGlobalAdmin: true, membership: null })
    ).toBe(true);
    expect(
      canViewKalakritiFood({
        isGlobalAdmin: false,
        membership: { kind: "guardian", assignments: [] },
      })
    ).toBe(true);
  });
  it("limits meal undo to live administrators and Food Leads, excluding Food Members and readers", () => {
    for (const role of ["edition_admin", "food_lead"])
      expect(canUndoKalakritiMeal(candidate(role))).toBe(true);
    for (const role of [
      "food_member",
      "liaison_lead",
      "liaison",
      "volunteer_coordinator",
    ])
      expect(canUndoKalakritiMeal(candidate(role, "a"))).toBe(false);
    expect(
      canUndoKalakritiMeal({
        isGlobalAdmin: true,
        edition: { lifecycle: "live" },
        membership: null,
      })
    ).toBe(true);
    expect(
      canUndoKalakritiMeal({
        ...candidate("food_lead"),
        edition: { lifecycle: "archived" },
      })
    ).toBe(false);
    expect(
      canUndoKalakritiMeal({
        isGlobalAdmin: true,
        edition: { lifecycle: "draft" },
        membership: null,
      })
    ).toBe(false);
  });
  it("does not expand unrelated roles or archived Edition access", () => {
    for (const role of [
      "volunteer_coordinator",
      "hospitality_lead",
      "competition_coordinator",
      "overall_events_lead",
    ])
      expect(canViewKalakritiFood(candidate(role))).toBe(false);
    expect(canViewKalakritiFood(null)).toBe(false);
    expect(
      canViewKalakritiFood({
        ...candidate("food_member"),
        edition: { lifecycle: "archived" },
      })
    ).toBe(false);
  });
  it("admits the Overall Liaison Lead's all-Center read scope without meal recording", () => {
    expect(canViewKalakritiFood(candidate("liaison_lead"))).toBe(true);
    expect(
      getKalakritiScanActivities({
        isGlobalAdmin: false,
        membership: {
          id: "overall-liaison",
          kind: "volunteer",
          responsibilities: ["liaison_lead"],
          assignments: [
            {
              responsibility: "liaison_lead",
              centerId: null,
              competitionCategoryId: null,
              competitionId: null,
            },
          ],
        },
      })
    ).not.toContain("meals");
  });
  it("shows Food navigation only with explicit view access", () => {
    const links = (canViewFood: boolean) =>
      buildKalakritiNavGroups({ year: 2026, canViewFood }).flatMap(
        (group) => group.items
      );
    expect(links(false).some((item) => item.title === "Food")).toBe(false);
    expect(links(true).find((item) => item.title === "Food")?.url).toBe(
      "/kalakriti/2026/food"
    );
  });
  it("allows Guardian meal subjects without giving Guardians a meal recording activity", () => {
    expect(canScanKalakritiPerson("breakfast", "guardian")).toBe(true);
    expect(canScanKalakritiPerson("lunch", "guardian")).toBe(true);
    expect(canScanKalakritiPerson("volunteer_check_in", "guardian")).toBe(
      false
    );
    expect(canScanKalakritiPerson("competition_attendance", "guardian")).toBe(
      false
    );
    expect(canScanKalakritiPerson("volunteer_check_in", "student")).toBe(false);
    expect(canScanKalakritiPerson("competition_attendance", "volunteer")).toBe(
      false
    );
    expect(
      getKalakritiScanActivities({
        isGlobalAdmin: false,
        membership: {
          id: "guardian",
          kind: "guardian",
          assignments: [],
          responsibilities: [],
        },
      })
    ).toEqual([]);
    expect(
      getKalakritiScanActivities({
        isGlobalAdmin: false,
        membership: {
          id: "liaison",
          kind: "volunteer",
          assignments: [
            {
              responsibility: "liaison",
              centerId: "a",
              competitionCategoryId: null,
              competitionId: null,
            },
          ],
          responsibilities: ["liaison"],
        },
      })
    ).not.toContain("meals");
  });
});
