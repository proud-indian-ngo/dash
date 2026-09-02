import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import type { AuditLogResponse } from "@/components/audit/audit-types";
import {
  SELECT_IS_ONLY_OPERATORS,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

const OUTCOME_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Success", value: "success" },
  { label: "Denied", value: "denied" },
  { label: "Failure", value: "failure" },
];

const LEGACY_AUDIT_FILTER_PARAMS = [
  { param: "outcome", path: "outcome" },
  { param: "action", path: "action" },
  { param: "targetType", path: "targetType" },
] as const;

export function createAuditLogFilterFields(
  facets: AuditLogResponse["facets"]
): FilterField[] {
  return [
    selectField(
      "outcome",
      "Outcome",
      OUTCOME_OPTIONS,
      SELECT_IS_ONLY_OPERATORS
    ),
    selectField(
      "action",
      "Action",
      facets.actions.map((value) => ({ label: value, value })),
      SELECT_IS_ONLY_OPERATORS
    ),
    selectField(
      "targetType",
      "Target",
      facets.targetTypes.map((value) => ({ label: value, value })),
      SELECT_IS_ONLY_OPERATORS
    ),
  ];
}

export function useMigrateLegacyAuditFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_AUDIT_FILTER_PARAMS);
}
