import { describe, expect, it } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import {
  canManageKalakritiVolunteers,
  canRegisterKalakritiIdCards,
  canViewKalakritiVolunteers,
} from "./kalakriti-volunteer-policy";

function access(
  overrides: Partial<
    Pick<KalakritiEditionAccess, "edition" | "isGlobalAdmin" | "membership">
  > = {}
): Pick<KalakritiEditionAccess, "edition" | "isGlobalAdmin" | "membership"> {
  return {
    isGlobalAdmin: false,
    edition: { lifecycle: "live" } as KalakritiEditionAccess["edition"],
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

  it("gives Volunteer Management Volunteers read and printed-card registration access only", () => {
    const candidate = access({
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["volunteer_management_volunteer"],
      },
    });
    expect(canViewKalakritiVolunteers(candidate)).toBe(true);
    expect(canRegisterKalakritiIdCards(candidate)).toBe(true);
    expect(canManageKalakritiVolunteers(candidate)).toBe(false);
    expect(
      canViewKalakritiVolunteers({
        ...candidate,
        edition: { ...candidate.edition, lifecycle: "archived" },
      })
    ).toBe(false);
  });

  it("preserves archived roster reads for existing volunteer managers", () => {
    const candidate = access({
      edition: {
        ...access().edition,
        lifecycle: "archived",
      },
      membership: {
        assignments: [],
        id: "membership-1",
        kind: "volunteer",
        responsibilities: ["volunteer_coordinator"],
      },
    });
    expect(canViewKalakritiVolunteers(candidate)).toBe(true);
    expect(canRegisterKalakritiIdCards(candidate)).toBe(false);
  });
});
