import { describe, expect, it } from "vitest";
import {
  canAccessKalakritiStudents,
  getStudentRegistrationAvailability,
  type KalakritiStudentAccess,
  selectKalakritiStudentCenters,
} from "./kalakriti-student-policy";

function access(
  overrides: Partial<KalakritiStudentAccess> = {}
): KalakritiStudentAccess {
  return {
    isGlobalAdmin: false,
    membership: {
      assignments: [],
      kind: "volunteer",
      responsibilities: [],
    },
    ...overrides,
  };
}

describe("Kalakriti Student policy", () => {
  it.each([
    access({ isGlobalAdmin: true, membership: null }),
    access({
      membership: { assignments: [], kind: "guardian", responsibilities: [] },
    }),
    access({
      membership: {
        assignments: [],
        kind: "volunteer",
        responsibilities: ["edition_admin"],
      },
    }),
    access({
      membership: {
        assignments: [],
        kind: "volunteer",
        responsibilities: ["liaison"],
      },
    }),
  ])("allows an authorized registration role", (candidate) => {
    expect(canAccessKalakritiStudents(candidate)).toBe(true);
  });

  it("rejects an unrelated Edition responsibility", () => {
    expect(
      canAccessKalakritiStudents(
        access({
          membership: {
            assignments: [],
            kind: "volunteer",
            responsibilities: ["transport_coordinator"],
          },
        })
      )
    ).toBe(false);
  });

  it("gives Guardians and Edition Administrators all visible Centers", () => {
    const centers = [{ id: "center-1" }, { id: "center-2" }];
    const guardian = access({
      membership: { assignments: [], kind: "guardian", responsibilities: [] },
    });
    expect(selectKalakritiStudentCenters(centers, guardian)).toEqual(centers);
  });

  it("limits a Liaison to explicitly assigned Centers", () => {
    const centers = [{ id: "center-1" }, { id: "center-2" }];
    const liaison = access({
      membership: {
        assignments: [
          {
            centerId: "center-2",
            responsibility: "liaison",
          },
          {
            centerId: "center-1",
            responsibility: "transport_coordinator",
          },
        ],
        kind: "volunteer",
        responsibilities: ["liaison", "transport_coordinator"],
      },
    });
    expect(selectKalakritiStudentCenters(centers, liaison)).toEqual([
      { id: "center-2" },
    ]);
  });

  it.each([
    ["draft", true, false, 1, 1, "edition_closed"],
    ["registration_open", false, false, 1, 1, "center_closed"],
    ["registration_open", true, true, 0, 0, "loading"],
    ["registration_open", true, false, 0, 0, "missing_configuration"],
    ["registration_open", true, false, 1, 1, "open"],
  ] as const)(
    "reports the authoritative registration availability",
    (lifecycle, centerEnabled, referenceDataLoading, ageCategoryCount, quotaCount, expected) => {
      expect(
        getStudentRegistrationAvailability({
          ageCategoryCount,
          centerEnabled,
          lifecycle,
          quotaCount,
          referenceDataLoading,
        })
      ).toBe(expected);
    }
  );
});
