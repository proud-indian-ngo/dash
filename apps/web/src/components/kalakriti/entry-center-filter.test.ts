import { describe, expect, it } from "bun:test";

import { selectEntryStudentsForCenter } from "@/lib/kalakriti-entry-policy";

import {
  createCompetitionFilterFields,
  getCompetitionFilterValue,
} from "./kalakriti-filters";
describe("Entry directory filters", () => {
  it("keeps creation members within the explicitly chosen Center", () => {
    expect(
      selectEntryStudentsForCenter(
        [
          { id: "a", centerId: "a" },
          { id: "b", centerId: "b" },
          { id: "partial" },
        ],
        "b"
      )
    ).toEqual([{ id: "b", centerId: "b" }]);
  });
  it("does not expose Center or arrival filters in the Competition directory", () => {
    const ids = createCompetitionFilterFields([]).map((field) => field.id);
    expect(ids).not.toContain("centerNames");
    expect(ids).not.toContain("center");
    expect(ids).not.toContain("arrival");
    expect(ids).not.toContain("present");
    expect(ids).toContain("entryCount");
  });
});

it("filters each row by its own age category while preserving all divisions for editing", () => {
  expect(
    getCompetitionFilterValue(
      {
        id: "singing",
        name: "Singing",
        categoryName: "Music",
        competitionCategoryId: "music",
        cancelledAt: null,
        retiredAt: null,
        musicUploadEnabled: false,
        sequentialPerformances: false,
        genderEligibility: "both",
        participationMode: "individual",
        minimumGroupSize: 1,
        maximumGroupSize: 1,
        divisionId: "junior-singing",
        ageCategoryId: "junior",
        ageCategoryName: "Junior",
        divisions: [
          { id: "junior-singing", ageCategoryId: "junior" },
          { id: "senior-singing", ageCategoryId: "senior" },
        ],
      },
      ["ageCategories"]
    )
  ).toEqual(["junior"]);
});
