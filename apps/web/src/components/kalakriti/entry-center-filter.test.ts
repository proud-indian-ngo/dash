import { describe, expect, it } from "bun:test";

import { selectEntryStudentsForCenter } from "@/lib/kalakriti-entry-policy";

import { getCompetitionFilterValue } from "./kalakriti-filters";
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
