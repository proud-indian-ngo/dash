import { describe, expect, it } from "bun:test";

import {
  getEntryStudentArrival,
  getEntryStudentAttendance,
  getEntryStatusCounts,
} from "./entry-arrival";
import type { KalakritiEntryStudent } from "./entry-form-dialog";
function student(
  id: string,
  operations: KalakritiEntryStudent["operations"] = []
): KalakritiEntryStudent {
  return {
    id,
    humanId: id,
    name: id,
    gender: "female",
    centerId: "center",
    ageCategoryId: "age",
    ageCategory: {
      name: "Junior",
      maxCompetitionsPerCategory: 3,
      maxTotalCompetitions: 5,
    },
    operations,
  };
}
describe("Entry venue arrival", () => {
  it("uses effective venue arrival, not pickup or Competition attendance", () => {
    expect(
      getEntryStudentArrival(
        student("a", [
          { type: "competition_attendance", supersededByOperationId: null },
        ]),
        true
      )
    ).toBe("Not present");
    expect(
      getEntryStudentArrival(
        student("a", [
          { type: "venue_arrival", supersededByOperationId: "replacement" },
        ]),
        true
      )
    ).toBe("Not present");
    expect(
      getEntryStudentArrival(
        student("a", [{ type: "pickup", supersededByOperationId: null }]),
        true
      )
    ).toBe("Not present");
  });
  it("retains arrival after departure and return", () => {
    expect(
      getEntryStudentArrival(
        student(
          "a",
          ["venue_arrival", "venue_departure", "drop_off"].map((type) => ({
            type,
            supersededByOperationId: null,
          }))
        ),
        true
      )
    ).toBe("Present");
  });
  it("counts unique people rather than repeated entry memberships", () => {
    expect(
      getEntryStatusCounts(
        ["a", "a", "b"],
        new Map([
          ["a", "Present"],
          ["b", "Not present"],
        ]),
        "Present"
      )
    ).toEqual({ count: 1, total: 2, category: "partial" });
  });
  it("requires the actual Session and Edition for effective attendance", () => {
    const value = student("a", [
      {
        type: "competition_attendance",
        editionId: "edition",
        competitionSessionId: "scheduled-session",
        supersededByOperationId: null,
      },
    ]);
    expect(
      getEntryStudentAttendance(value, "edition", "scheduled-session")
    ).toBe("Attended");
    expect(getEntryStudentAttendance(value, "edition", "division-id")).toBe(
      "Not attended"
    );
    expect(getEntryStudentAttendance(value, "other", "scheduled-session")).toBe(
      "Not attended"
    );
    expect(getEntryStudentAttendance(value, "edition", undefined)).toBe(
      "Checking attendance"
    );
  });
  it("does not derive initial negatives from partial data", () => {
    expect(getEntryStudentArrival(student("a"), false)).toBe(
      "Checking presence"
    );
    expect(
      getEntryStudentArrival({ ...student("a"), operations: undefined }, true)
    ).toBe("Checking presence");
    expect(getEntryStatusCounts([], undefined, "Present").category).toBe(
      "checking"
    );
  });
  it("uses retained authoritative labels and waits for newly visible people", () => {
    const labels = new Map([
      ["a", "Present"],
      ["b", "Not present"],
    ]);
    expect(getEntryStatusCounts(["a", "a", "b"], labels, "Present")).toEqual({
      count: 1,
      total: 2,
      category: "partial",
    });
    expect(getEntryStatusCounts(["a", "c"], labels, "Present").category).toBe(
      "checking"
    );
  });
});
