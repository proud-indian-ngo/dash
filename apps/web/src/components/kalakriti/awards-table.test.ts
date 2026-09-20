import { describe, expect, it } from "bun:test";

import type { KalakritiAwardEntry } from "@pi-dash/shared/kalakriti-awards";

import {
  awardRecipientCounts,
  getAwardFilterValue,
  getAwardStatus,
  searchAwardEntry,
} from "./awards-table-utils";

function entry(
  awarded: boolean[],
  type: "individual" | "group" = "group"
): KalakritiAwardEntry {
  return {
    ageCategoryName: "Junior",
    award: "winner",
    centerId: "center-a",
    centerName: "Center A",
    competitionName: "Group Dance",
    divisionId: "division-a",
    entryId: "entry-a",
    members: awarded.map((value, index) => ({
      awarded: value,
      gender: index % 2 === 0 ? "female" : "male",
      humanId: `K26-${index + 1}`,
      name: `Student ${index + 1}`,
      studentId: `student-${index + 1}`,
      version: index,
    })),
    type,
  };
}

describe("Awards table projection", () => {
  it("derives pending, partial and awarded group states", () => {
    expect(getAwardStatus(entry([false, false]))).toBe("pending");
    expect(getAwardStatus(entry([true, false]))).toBe("partial");
    expect(getAwardStatus(entry([true, true]))).toBe("awarded");
  });

  it("counts each student award independently", () => {
    expect(
      awardRecipientCounts([entry([true, false]), entry([true], "individual")])
    ).toEqual({
      awarded: 2,
      pending: 1,
      total: 3,
    });
  });

  it("searches group members and exposes group filter values", () => {
    const row = entry([true, false]);
    expect(searchAwardEntry(row, "K26-2")).toBe(true);
    expect(searchAwardEntry(row, "Group Dance")).toBe(true);
    expect(searchAwardEntry(row, "unrelated")).toBe(false);
    expect(getAwardFilterValue(row, ["status"])).toBe("partial");
    expect(getAwardFilterValue(row, ["gender"])).toEqual(["female", "male"]);
  });
});
