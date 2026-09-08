import { describe, expect, it } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";

import {
  createVolunteerFilterFields,
  getVolunteerFilterValue,
} from "./kalakriti-filters";
import type {
  VolunteerAssignmentItem,
  VolunteerRosterItem,
} from "./volunteers-table";

function assignment(
  overrides: Partial<VolunteerAssignmentItem>
): VolunteerAssignmentItem {
  return {
    id: "assignment",
    centerId: null,
    competitionCategoryId: null,
    competitionId: null,
    isPrimary: false,
    responsibility: "center_liaison_lead",
    scopeName: null,
    ...overrides,
  };
}

const rows: VolunteerRosterItem[] = [
  {
    id: "one",
    userId: "user-one",
    userRole: "volunteer",
    humanId: "KALV-2026-0001",
    registrationGroup: "Group A",
    snapshotName: "Asha",
    snapshotEmail: "asha@example.test",
    snapshotPhone: "+919999999999",
    assignments: [
      assignment({
        centerId: "center-one",
        scopeName: "North",
        isPrimary: true,
      }),
      assignment({
        id: "second-center",
        centerId: "center-two",
        scopeName: "South",
      }),
      assignment({
        id: "category",
        competitionCategoryId: "category-one",
        scopeName: "Arts",
        responsibility: "competition_category_lead",
      }),
      assignment({
        id: "competition",
        competitionId: "competition-one",
        scopeName: "Painting",
        responsibility: "competition_coordinator",
      }),
    ],
  },
  {
    id: "two",
    userId: "user-two",
    userRole: "volunteer",
    humanId: null,
    snapshotName: "Bala",
    snapshotEmail: null,
    snapshotPhone: null,
    assignments: [],
  },
];

function matching(path: string, operator: string, value?: unknown) {
  const query = createFilterQuery([
    createFilterRule({ id: "filter", path: [path], operator, value }),
  ]);
  return rows
    .filter(compileFilterQuery(query, getVolunteerFilterValue))
    .map((row) => row.id);
}

describe("Kalakriti volunteer filters", () => {
  it("offers text, assignment scope, responsibility, and primary filters", () => {
    expect(createVolunteerFilterFields(rows).map((field) => field.id)).toEqual([
      "snapshotName",
      "humanId",
      "snapshotEmail",
      "snapshotPhone",
      "registrationGroup",
      "centers",
      "competitionCategories",
      "competitions",
      "responsibilities",
      "primary",
    ]);
  });

  it.each([
    ["snapshotName", "ASHA"],
    ["humanId", "2026-0001"],
    ["snapshotEmail", "example.test"],
    ["snapshotPhone", "9999"],
  ])("filters %s with text operators", (path, value) => {
    expect(matching(path, "contains", value)).toEqual(["one"]);
  });

  it.each(["humanId", "snapshotEmail", "snapshotPhone"])(
    "supports empty %s values",
    (path) => {
      expect(matching(path, "empty")).toEqual(["two"]);
    }
  );

  it.each([
    ["centers", "center-two"],
    ["competitionCategories", "category-one"],
    ["competitions", "competition-one"],
  ])(
    "matches every assigned %s scope by ID rather than label",
    (path, value) => {
      expect(matching(path, "has_any_of", [value])).toEqual(["one"]);
      expect(matching(path, "has_any_of", ["not-assigned"])).toEqual([]);
      expect(getVolunteerFilterValue(rows[1]!, [path])).toEqual([]);
    }
  );

  it("builds unique scope options from roster data without mixing scope kinds", () => {
    const fields = createVolunteerFilterFields([rows[0]!, rows[0]!, rows[1]!]);
    expect(fields.find((field) => field.id === "centers")?.options).toEqual([
      { label: "North", value: "center-one" },
      { label: "South", value: "center-two" },
    ]);
    expect(
      fields.find((field) => field.id === "competitionCategories")?.options
    ).toEqual([{ label: "Arts", value: "category-one" }]);
    expect(
      fields.find((field) => field.id === "competitions")?.options
    ).toEqual([{ label: "Painting", value: "competition-one" }]);
  });

  it("filters registration groups and missing groups with unique options", () => {
    expect(matching("registrationGroup", "is", "Group A")).toEqual(["one"]);
    expect(matching("registrationGroup", "empty")).toEqual(["two"]);
    expect(
      createVolunteerFilterFields([rows[0]!, rows[0]!, rows[1]!]).find(
        (field) => field.id === "registrationGroup"
      )?.options
    ).toEqual([{ label: "Group A", value: "Group A" }]);
  });

  it("preserves unassigned and primary role filters", () => {
    expect(matching("responsibilities", "has_any_of", ["unassigned"])).toEqual([
      "two",
    ]);
    expect(matching("primary", "is", "primary")).toEqual(["one"]);
    expect(matching("primary", "is", "secondary")).toEqual(["two"]);
    expect(
      createVolunteerFilterFields([]).find((field) => field.id === "centers")
        ?.options
    ).toEqual([]);
  });
});
