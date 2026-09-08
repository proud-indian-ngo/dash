import { describe, expect, it } from "bun:test";

import { buildParticipationCompliance } from "./kalakriti-participation-compliance";

function student(id: string, count: number, centerId = "center-1") {
  return {
    centerId,
    entryMemberships: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
    })),
    humanId: id,
    id,
    name: `Student ${id}`,
  };
}

describe("participation compliance", () => {
  it("keeps empty centers separate from centers with zero-entry students", () => {
    expect(buildParticipationCompliance([], 2).size).toBe(0);
    const result = buildParticipationCompliance([student("zero", 0)], 2).get(
      "center-1"
    );
    expect(result?.students).toBe(1);
    expect(result?.issues).toEqual([
      { count: 0, humanId: "zero", id: "zero", name: "Student zero" },
    ]);
  });

  it("counts memberships for individual and group participation and flags every below-minimum student", () => {
    const result = buildParticipationCompliance(
      [
        student("zero", 0),
        student("below", 1),
        student("exact", 2),
        student("above", 3),
      ],
      2
    ).get("center-1");
    expect(result?.students).toBe(4);
    expect(result?.issues).toEqual([
      { count: 0, humanId: "zero", id: "zero", name: "Student zero" },
      { count: 1, humanId: "below", id: "below", name: "Student below" },
    ]);
  });

  it("keeps centers separate and responds to changed minimums and registrations", () => {
    const students = [student("a", 2), student("b", 3, "center-2")];
    expect(
      buildParticipationCompliance(students, 2).get("center-1")?.issues
    ).toEqual([]);
    expect(
      buildParticipationCompliance(students, 3).get("center-1")?.issues
    ).toHaveLength(1);
    expect(
      buildParticipationCompliance(students, 3).get("center-2")?.issues
    ).toEqual([]);
    expect(
      buildParticipationCompliance([student("a", 3)], 3).get("center-1")?.issues
    ).toEqual([]);
  });
});
