import { describe, expect, it } from "bun:test";

import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";

import { canAccessKalakritiEventDay } from "./kalakriti-event-day-policy";

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
describe("Event day station access", () => {
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
  it.each([
    "food_lead",
    "hospitality_lead",
    "competition_coordinator",
  ] as const)("denies %s", (role) => {
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
