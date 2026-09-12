import { describe, expect, it } from "bun:test";

import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";
import {
  createStudentFilterFields,
  getStudentFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
import type { KalakritiStudentRow } from "@/components/kalakriti/student-form-dialog";

import {
  canDeleteDirectoryStudent,
  studentDirectoryPermissions,
  withStudentCenterFilter,
} from "./kalakriti-student-directory";
const centers = [
  {
    id: "a",
    name: "Shared name",
    retiredAt: null,
    studentRegistrationEnabled: true,
    competitionEntryRegistrationEnabled: false,
  },
  {
    id: "b",
    name: "Shared name",
    retiredAt: null,
    studentRegistrationEnabled: true,
    competitionEntryRegistrationEnabled: true,
  },
];
const rows: KalakritiStudentRow[] = centers.map((center) => ({
  id: center.id,
  centerId: center.id,
  center,
  ageCategoryId: "age",
  derivedAgeCategoryId: "age",
  ageCategoryOverrideReason: null,
  dateOfBirth: 0,
  gender: "female",
  humanId: `KAL-${center.id}`,
  name: center.id,
}));
describe("Student directory Center permissions", () => {
  it("uses actual row Center for locked-entry deletion and never grants unrelated scope", () => {
    const permissions = studentDirectoryPermissions(
      centers,
      "registration_open",
      1,
      false
    );
    expect(permissions.a?.canManage).toBe(true);
    expect(
      canDeleteDirectoryStudent(
        { centerId: "a", entryMemberships: [{ id: "entry" }] },
        permissions
      )
    ).toBe(false);
    expect(
      canDeleteDirectoryStudent(
        { centerId: "a", entryMemberships: [] },
        permissions
      )
    ).toBe(true);
    expect(
      canDeleteDirectoryStudent(
        { centerId: "b", entryMemberships: [{ id: "entry" }] },
        permissions
      )
    ).toBe(true);
    expect(
      canDeleteDirectoryStudent({ centerId: "unrelated" }, permissions)
    ).toBe(false);
  });
  it("fails closed for retirement, null/closed controls and incomplete reference data", () => {
    const unavailable = centers.map((center, index) => ({
      ...center,
      studentRegistrationEnabled: index ? null : false,
    }));
    expect(
      Object.values(
        studentDirectoryPermissions(unavailable, "registration_open", 1, false)
      ).every((permission) => !permission.canManage)
    ).toBe(true);
    expect(
      studentDirectoryPermissions(
        [{ ...centers[0]!, retiredAt: 10 }],
        "registration_open",
        1,
        false
      ).a?.canManage
    ).toBe(false);
    expect(
      studentDirectoryPermissions(centers, "registration_open", 1, true).a
        ?.canManage
    ).toBe(false);
    expect(
      studentDirectoryPermissions(centers, "registration_open", 0, false).a
        ?.canManage
    ).toBe(false);
  });
  it("keeps lifecycle closure independent from every Center filter", () => {
    for (const lifecycle of [
      "draft",
      "registration_locked",
      "live",
      "archived",
      "unknown",
    ])
      expect(
        Object.values(
          studentDirectoryPermissions(centers, lifecycle, 1, false)
        ).every((permission) => !permission.canManage)
      ).toBe(true);
  });
});
describe("ID-backed visible Student Center filters", () => {
  it("keeps duplicate or changed Center labels separate from filter identity", () => {
    const field = createStudentFilterFields(rows, centers).find(
      (candidate) => candidate.id === "center"
    );
    expect(field?.options).toEqual([
      { label: "Shared name", value: "a" },
      { label: "Shared name", value: "b" },
    ]);
    const filter = withStudentCenterFilter(createFilterQuery(), "b", "link");
    expect(
      rows
        .filter(compileFilterQuery(filter, getStudentFilterValue))
        .map((row) => row.id)
    ).toEqual(["b"]);
    expect(
      rows.filter(
        compileFilterQuery(
          withStudentCenterFilter(filter, "unrelated", "other"),
          getStudentFilterValue
        )
      )
    ).toEqual([]);
  });
  it("supports multiple Center IDs while retaining existing filters", () => {
    const query = createFilterGroup({
      id: "q",
      rules: [
        createFilterRule({
          id: "centers",
          path: ["center"],
          operator: "is_any_of",
          value: ["a", "b"],
        }),
        createFilterRule({
          id: "gender",
          path: ["gender"],
          operator: "is",
          value: ["female"],
        }),
      ],
    });
    expect(
      rows.filter(compileFilterQuery(query, getStudentFilterValue))
    ).toHaveLength(2);
    const linked = withStudentCenterFilter(query, "b", "link");
    expect(
      rows
        .filter(compileFilterQuery(linked, getStudentFilterValue))
        .map((row) => row.id)
    ).toEqual(["b"]);
    expect(JSON.stringify(linked)).toContain('"gender"');
    expect(createStudentFilterFields(rows).map((field) => field.id)).toEqual(
      expect.arrayContaining(["center", "gender", "ageCategory", "dateOfBirth"])
    );
  });
});
