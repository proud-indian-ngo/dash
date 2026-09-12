import { describe, expect, it } from "bun:test";

import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";

import {
  createVolunteerFilterFields,
  getVolunteerFilterValue,
  removeObsoleteVolunteerFilters,
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
  it("offers contact, ID, group and responsibility filters only", () => {
    expect(createVolunteerFilterFields(rows).map((field) => field.id)).toEqual([
      "checkInStatus",
      "snapshotName",
      "humanId",
      "snapshotEmail",
      "snapshotPhone",
      "registrationGroup",
      "responsibilities",
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

  it("removes obsolete nested saved filters while preserving unrelated rules", () => {
    const retained = createFilterRule({
      id: "name",
      path: ["snapshotName"],
      operator: "contains",
      value: "Asha",
    });
    const obsolete = [
      "centers",
      "competitionCategories",
      "competitions",
      "primary",
    ].map((path) =>
      createFilterRule({ id: path, path: [path], operator: "is", value: "old" })
    );
    const query = createFilterQuery([
      retained,
      createFilterGroup({ id: "nested", combinator: "or", rules: obsolete }),
    ]);
    const normalized = removeObsoleteVolunteerFilters(query);
    expect(normalized.rules).toEqual([retained]);
    expect(
      rows
        .filter(compileFilterQuery(normalized, getVolunteerFilterValue))
        .map((row) => row.id)
    ).toEqual(["one"]);
    expect(
      removeObsoleteVolunteerFilters(createFilterQuery(obsolete)).rules
    ).toEqual([]);
    expect(removeObsoleteVolunteerFilters(normalized)).toEqual(normalized);
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

  it("filters Checked in from authoritative labels only, never unknown raw-operation defaults", () => {
    const field = createVolunteerFilterFields(rows).find(
      (item) => item.id === "checkInStatus"
    );
    expect(field?.label).toBe("Checked in");
    expect(field?.options).toEqual([
      { label: "Checked in", value: "Checked in" },
      { label: "Not checked in", value: "Not checked in" },
    ]);
    const query = createFilterQuery([
      createFilterRule({
        id: "check-in",
        path: ["checkInStatus"],
        operator: "is",
        value: "Not checked in",
      }),
    ]);
    expect(
      rows.filter(compileFilterQuery(query, getVolunteerFilterValue))
    ).toEqual([]);
    const retained = new Map([
      ["one", "Checked in"],
      ["two", "Not checked in"],
    ]);
    expect(
      rows
        .filter(
          compileFilterQuery(query, (row, path) =>
            getVolunteerFilterValue(row, path, retained)
          )
        )
        .map((row) => row.id)
    ).toEqual(["two"]);
    expect(
      getVolunteerFilterValue(
        { ...rows[0]!, operations: [] },
        ["checkInStatus"],
        retained
      )
    ).toBe("Checked in");
  });
  it("preserves the Unassigned responsibility filter", () => {
    expect(matching("responsibilities", "has_any_of", ["unassigned"])).toEqual([
      "two",
    ]);
    for (const path of [
      "centers",
      "competitionCategories",
      "competitions",
      "primary",
    ])
      expect(getVolunteerFilterValue(rows[0]!, [path])).toBeUndefined();
  });
});
