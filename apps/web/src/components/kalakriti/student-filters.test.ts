import { describe, expect, it } from "bun:test";

import {
  createFilterGroup,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";
import {
  removeObsoleteStudentFilters,
  withStudentCenterFilter,
} from "@/lib/kalakriti-student-directory";

import {
  createStudentFilterFields,
  getStudentFilterValue,
} from "./kalakriti-filters";
import type { KalakritiStudentRow } from "./student-form-dialog";
import { resolveTransportStatusSnapshot } from "./use-transport-status-snapshot";
const student: KalakritiStudentRow = {
  id: "s",
  centerId: "b",
  center: { id: "b", name: "Center B" },
  humanId: "KAL-2026-0001",
  name: "Ananya",
  dateOfBirth: new Date(2026, 7, 19).getTime(),
  gender: "female",
  ageCategoryId: "senior",
  ageCategory: { name: "Senior" },
  derivedAgeCategoryId: "junior",
  ageCategoryOverrideReason: null,
};
function rule(id: string, path: string, value: unknown) {
  return createFilterRule({ id, path: [path], operator: "is", value });
}
describe("Student column filters", () => {
  it("exposes exactly the seven data columns, independent of visibility settings", () => {
    expect(
      createStudentFilterFields([student]).map((field) => [
        field.id,
        field.label,
      ])
    ).toEqual([
      ["center", "Center"],
      ["humanId", "ID"],
      ["name", "Student"],
      ["transportStatus", "Transport status"],
      ["dateOfBirth", "Date of birth"],
      ["gender", "Gender"],
      ["ageCategory", "Age Category"],
    ]);
  });
  it("filters the displayed ID, name, date and assigned category", () => {
    for (const [path, operator, value] of [
      ["humanId", "contains", "0001"],
      ["name", "contains", "ANAN"],
      ["dateOfBirth", "is", { date: "2026-08-19" }],
      ["ageCategory", "is", ["senior"]],
    ] as const) {
      const query = createFilterGroup({
        id: "q",
        rules: [createFilterRule({ id: "r", path: [path], operator, value })],
      });
      expect(compileFilterQuery(query, getStudentFilterValue)(student)).toBe(
        true
      );
    }
  });
  it("uses retained transport labels and never maps unknown to awaiting pickup", () => {
    const previous = {
      scopeKey: "edition",
      labels: new Map([[student.id, "At Event"]]),
    };
    const current = {
      scopeKey: "edition",
      labels: new Map([[student.id, "Awaiting pickup"]]),
    };
    const retained = resolveTransportStatusSnapshot(previous, current, false);
    expect(
      getStudentFilterValue(student, ["transportStatus"], retained?.labels)
    ).toBe("At Event");
    const query = createFilterGroup({
      id: "q",
      rules: [rule("r", "transportStatus", ["Awaiting pickup"])],
    });
    expect(compileFilterQuery(query, getStudentFilterValue)(student)).toBe(
      false
    );
  });
});
describe("Obsolete Student filter migration", () => {
  it("prunes all retired paths recursively without changing supported AND/OR rules", () => {
    const center = rule("center-rule", "center", ["b"]);
    const name = createFilterRule({
      id: "name-rule",
      path: ["name"],
      operator: "contains",
      value: "Anan",
    });
    const oldPaths = [
      "derivedAgeCategory",
      "ageCategoryOverride",
      "ageCategoryOverrideReason",
      "ageCategoryOverrideAt",
      "entryCount",
      "studentRegistrationEnabled",
      "competitionEntryRegistrationEnabled",
      "centerStatus",
      "createdAt",
      "updatedAt",
      "duplicateConfirmed",
      "duplicateConfirmedAt",
    ];
    const query = createFilterGroup({
      id: "root",
      rules: [
        center,
        createFilterGroup({
          id: "or",
          combinator: "or",
          rules: [rule("old", oldPaths[0]!, ["missing"]), name],
        }),
        createFilterGroup({
          id: "empty",
          rules: oldPaths.map((path) => rule(path, path, ["missing"])),
        }),
      ],
    });
    const expected = createFilterGroup({
      id: "root",
      rules: [
        center,
        createFilterGroup({ id: "or", combinator: "or", rules: [name] }),
      ],
    });
    const normalized = removeObsoleteStudentFilters(query);
    expect(normalized).toEqual(expected);
    expect(removeObsoleteStudentFilters(normalized)).toEqual(expected);
    expect(compileFilterQuery(normalized, getStudentFilterValue)(student)).toBe(
      true
    );
  });
  it("combines pruning and legacy Center replacement without restoring stale narrowing", () => {
    const query = createFilterGroup({
      id: "root",
      rules: [
        rule("old-center", "center", ["a"]),
        rule("old-meta", "entryCount", 99),
        rule("gender", "gender", ["female"]),
      ],
    });
    const migrated = withStudentCenterFilter(query, "b", "link");
    expect(JSON.stringify(migrated)).not.toContain("entryCount");
    expect(JSON.stringify(migrated)).not.toContain("old-center");
    expect(JSON.stringify(migrated)).toContain('"gender"');
    expect(compileFilterQuery(migrated, getStudentFilterValue)(student)).toBe(
      true
    );
    expect(removeObsoleteStudentFilters(migrated)).toEqual(migrated);
  });
});
