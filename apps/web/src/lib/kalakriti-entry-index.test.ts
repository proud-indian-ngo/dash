import { expect, it } from "bun:test";

import {
  getEntryStudentOptionEligibility,
  indexEntriesByStudent,
} from "./kalakriti-entry-policy";

it("preserves eligibility for groups, editing, limits and overlapping sessions", () => {
  const session = {
    id: "target",
    ageCategoryId: "age",
    ageCategory: { name: "Junior" },
    competition: {
      category: { name: "Arts" },
      competitionCategoryId: "arts",
      genderEligibility: "female" as const,
      maximumGroupSize: 10,
      minimumGroupSize: 2,
      participationMode: "group" as const,
    },
    startAt: 100,
    endAt: 200,
  };
  const students = Array.from({ length: 8 }, (_, index) => ({
    id: `student-${index}`,
    ageCategoryId: index === 6 ? "other" : "age",
    ageCategory: {
      maxTotalCompetitions: index === 3 ? 1 : 5,
      maxCompetitionsPerCategory: index === 4 ? 1 : 5,
    },
    gender: index === 7 ? ("male" as const) : ("female" as const),
  }));
  const entries = [
    {
      id: "editing",
      sessionId: session.id,
      session,
      members: [
        { studentId: "student-0" },
        { studentId: "student-1" },
        { studentId: "student-1" },
      ],
    },
    {
      id: "other",
      sessionId: "other",
      session: { ...session, id: "other", startAt: 300, endAt: 400 },
      members: [{ studentId: "student-3" }, { studentId: "student-4" }],
    },
    {
      id: "overlap",
      sessionId: "overlap",
      session: { ...session, id: "overlap" },
      members: [{ studentId: "student-5" }],
    },
  ];
  const indexed = indexEntriesByStudent(entries);
  expect(indexed.get("student-1")).toHaveLength(1);
  for (const editingEntryId of [undefined, "editing"]) {
    for (const student of students) {
      expect(
        getEntryStudentOptionEligibility({
          editingEntryId,
          entries: indexed.get(student.id) ?? [],
          session,
          student,
        })
      ).toEqual(
        getEntryStudentOptionEligibility({
          editingEntryId,
          entries,
          session,
          student,
        })
      );
    }
  }
  expect(indexEntriesByStudent([]).size).toBe(0);
  const changed = indexEntriesByStudent(entries.slice(1));
  expect(changed.has("student-0")).toBe(false);
  expect(indexed.has("student-0")).toBe(true);
});
