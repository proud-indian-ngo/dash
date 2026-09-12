import { describe, expect, it } from "bun:test";

import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";

import { getKalakritiScanActivities } from "./kalakriti-event-day-policy";

function canAccessKalakritiEventDay(
  value: Parameters<typeof getKalakritiScanActivities>[0]
) {
  return getKalakritiScanActivities(value).length > 0;
}
function access(
  role: KalakritiResponsibility,
  centerId: string | null = "center"
) {
  return {
    isGlobalAdmin: false,
    edition: { lifecycle: "live" },
    membership: {
      id: "member",
      kind: "volunteer" as const,
      responsibilities: [role],
      assignments: [
        {
          centerId,
          competitionCategoryId: null,
          competitionId: null,
          responsibility: role,
        },
      ],
    },
  };
}
describe("Sidebar scan activity access", () => {
  it.each(["food_lead", "food_member"] as const)(
    "gives %s meals only",
    (role) => {
      expect(getKalakritiScanActivities(access(role))).toEqual(["meals"]);
    }
  );
  it.each(["hospitality_lead", "hospitality_member"] as const)(
    "gives %s check-in only",
    (role) => {
      expect(getKalakritiScanActivities(access(role))).toEqual(["check_in"]);
    }
  );
  it("combines assigned activities and puts transport first", () => {
    const value = access("food_member");
    value.membership.assignments.push(
      ...access("transport_lead").membership.assignments
    );
    expect(getKalakritiScanActivities(value)).toEqual(["transport", "meals"]);
  });
  it("requires Competition scope for attendance", () => {
    const value = access("competition_volunteer");
    expect(getKalakritiScanActivities(value)).toEqual([]);
    expect(
      getKalakritiScanActivities({
        ...value,
        membership: {
          ...value.membership,
          assignments: value.membership.assignments.map((a) => ({
            ...a,
            competitionId: "competition",
          })),
        },
      })
    ).toEqual(["attendance"]);
  });
  it("gives admins all four activities", () => {
    expect(getKalakritiScanActivities(access("edition_admin"))).toEqual([
      "transport",
      "check_in",
      "meals",
      "attendance",
    ]);
  });

  it.each([
    "edition_admin",
    "transport_lead",
    "liaison",
    "center_liaison_lead",
    "liaison_volunteer",
  ] as const)("allows %s", (role) => {
    expect(canAccessKalakritiEventDay(access(role))).toBe(true);
  });
  it("requires a Center scope for a liaison", () => {
    expect(canAccessKalakritiEventDay(access("liaison", null))).toBe(false);
  });
  it.each(["competition_coordinator"] as const)("denies %s", (role) => {
    expect(canAccessKalakritiEventDay(access(role))).toBe(false);
  });
  it("denies Guardians, absent memberships and archived stations", () => {
    expect(
      canAccessKalakritiEventDay({
        ...access("transport_lead"),
        membership: {
          ...access("transport_lead").membership,
          kind: "guardian",
        },
      })
    ).toBe(false);
    expect(
      canAccessKalakritiEventDay({ isGlobalAdmin: false, membership: null })
    ).toBe(false);
    expect(
      canAccessKalakritiEventDay({
        isGlobalAdmin: true,
        membership: null,
        edition: { lifecycle: "archived" },
      })
    ).toBe(false);
    expect(canAccessKalakritiEventDay(null)).toBe(false);
  });
  it("allows admins before live for the disabled station notice", () => {
    expect(
      canAccessKalakritiEventDay({
        isGlobalAdmin: true,
        membership: null,
        edition: { lifecycle: "draft" },
      })
    ).toBe(true);
  });
});
