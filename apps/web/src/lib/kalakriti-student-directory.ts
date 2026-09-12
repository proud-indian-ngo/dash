import {
  createFilterGroup,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type { FilterQuery } from "@pi-dash/design-system/components/reui/filters/filters-types";

import { removeFilterPath } from "@/components/data-table/compile-filter-query";

import {
  canDeleteKalakritiStudent,
  getStudentRegistrationAvailability,
} from "./kalakriti-student-policy";
export interface StudentCenterPermissions {
  canManage: boolean;
  entryRegistrationEnabled: boolean;
}
export function studentDirectoryPermissions(
  centers: readonly {
    id: string;
    retiredAt: number | null;
    studentRegistrationEnabled: boolean | null;
    competitionEntryRegistrationEnabled: boolean | null;
  }[],
  lifecycle: string,
  ageCategoryCount: number,
  referenceDataLoading: boolean
): Record<string, StudentCenterPermissions> {
  return Object.fromEntries(
    centers.map((center) => [
      center.id,
      {
        canManage:
          center.retiredAt === null &&
          getStudentRegistrationAvailability({
            ageCategoryCount,
            centerEnabled: center.studentRegistrationEnabled === true,
            lifecycle,
            referenceDataLoading,
          }) === "open",
        entryRegistrationEnabled:
          center.competitionEntryRegistrationEnabled === true,
      },
    ])
  );
}
export function canDeleteDirectoryStudent(
  student: { centerId: string; entryMemberships?: readonly { id: string }[] },
  permissions: Record<string, StudentCenterPermissions>
): boolean {
  const permission = permissions[student.centerId];
  return (
    permission?.canManage === true &&
    canDeleteKalakritiStudent({
      entryCount: student.entryMemberships?.length ?? 0,
      entryRegistrationEnabled: permission.entryRegistrationEnabled,
    })
  );
}
const REMOVED_STUDENT_FILTER_PATHS = [
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
export function removeObsoleteStudentFilters(query: FilterQuery): FilterQuery {
  return REMOVED_STUDENT_FILTER_PATHS.reduce(removeFilterPath, query);
}

// A deep link replaces only Center rules; other visible filter groups survive.
export function withStudentCenterFilter(
  query: FilterQuery,
  centerId: string,
  id: string
): FilterQuery {
  const remaining = removeFilterPath(
    removeObsoleteStudentFilters(query),
    "center"
  );
  return createFilterGroup({
    id,
    combinator: "and",
    rules: [
      ...(remaining.rules.length ? [remaining] : []),
      createFilterRule({
        id: `${id}-center`,
        path: ["center"],
        operator: "is",
        value: [centerId],
      }),
    ],
  });
}
