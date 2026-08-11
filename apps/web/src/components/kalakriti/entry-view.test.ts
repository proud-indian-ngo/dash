import { describe, expect, it } from "vitest";
import {
  buildKalakritiEntryRows,
  buildKalakritiEntrySessions,
} from "./entry-view";

const division = {
  ageCategory: { name: "Junior" },
  ageCategoryId: "age-1",
  competition: {
    category: { name: "Performing Arts" },
    competitionCategoryId: "category-1",
    genderEligibility: "both" as const,
    id: "competition-1",
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Solo Dance",
    participationMode: "individual" as const,
  },
  id: "division-1",
  sessions: [
    {
      cancelledAt: 1,
      endAt: 200,
      startAt: 100,
      venue: { name: "Main Stage" },
    },
  ],
};

const student = {
  ageCategory: {
    maxCompetitionsPerCategory: 2,
    maxTotalCompetitions: 4,
    name: "Junior",
  },
  ageCategoryId: "age-1",
  gender: "female" as const,
  humanId: "KAL-1",
  id: "student-1",
  name: "Aarohi",
};

describe("Kalakriti Entry views", () => {
  it("keeps inactive Division Entries in validation rows", () => {
    const entries = buildKalakritiEntryRows(
      [
        {
          division,
          divisionId: division.id,
          id: "entry-1",
          members: [{ student, studentId: student.id }],
          participationMode: "individual",
        },
      ],
      []
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.session).toEqual(
      expect.objectContaining({
        id: division.id,
        scheduleActive: false,
      })
    );
  });

  it("shows only Divisions with active Sessions in the picker", () => {
    expect(buildKalakritiEntrySessions([division])).toEqual([]);
  });
});
