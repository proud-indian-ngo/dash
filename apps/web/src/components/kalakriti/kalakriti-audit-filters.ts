import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  SELECT_IS_ONLY_OPERATORS,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

const LEGACY_KALAKRITI_AUDIT_FILTER_PARAMS = [
  { param: "auditDomain", path: "domain" },
] as const;

export function createKalakritiAuditFilterFields(
  domainOptions: { label: string; value: string }[]
): FilterField[] {
  return [
    selectField("domain", "Domain", domainOptions, SELECT_IS_ONLY_OPERATORS),
  ];
}

export function useMigrateLegacyKalakritiAuditFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_KALAKRITI_AUDIT_FILTER_PARAMS);
}
