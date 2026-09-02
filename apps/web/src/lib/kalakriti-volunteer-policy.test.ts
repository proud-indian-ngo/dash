import { describe, expect, it } from "vitest";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import { canManageKalakritiVolunteers } from "./kalakriti-volunteer-policy";

function access(
  overrides: Partial<
    Pick<KalakritiEditionAccess, "isGlobalAdmin" | "membership">
  > = {}
): Pick<KalakritiEditionAccess, "isGlobalAdmin" | "membership"> {
  return {
    isGlobalAdmin: false,
    membership: {
      assignments: [],
      id: "membership-1",
      kind: "volunteer",
      responsibilities: [],
    },
    ...overrides,
  };
}

describe("canManageKalakritiVolunteers", () => {
  it.each([
    access({ isGlobalAdmin: true, membership: null }),
    access({
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["edition_admin"],
      },
    }),
    access({
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["volunteer_coordinator"],
      },
    }),
  ])("allows a volunteer manager", (candidate) => {
    expect(canManageKalakritiVolunteers(candidate)).toBe(true);
  });

  it("rejects an unrelated Edition responsibility", () => {
    expect(
      canManageKalakritiVolunteers(
        access({
          membership: {
            assignments: [],
            id: "membership-1",
            kind: "volunteer",
            responsibilities: ["overall_events_lead"],
          },
        })
      )
    ).toBe(false);
  });
});
