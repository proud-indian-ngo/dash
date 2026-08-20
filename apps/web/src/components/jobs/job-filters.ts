import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  SELECT_IS_ONLY_OPERATORS,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

const STATE_OPTIONS = [
  { label: "Created", value: "created" },
  { label: "Retry", value: "retry" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];

const LEGACY_JOB_FILTER_PARAMS = [
  { param: "state", path: "state" },
  { param: "queue", path: "queue" },
] as const;

export function createJobFilterFields(
  queueOptions: { label: string; value: string }[]
): FilterField[] {
  return [
    selectField("state", "State", STATE_OPTIONS, SELECT_IS_ONLY_OPERATORS),
    selectField("queue", "Queue", queueOptions, SELECT_IS_ONLY_OPERATORS),
  ];
}

export function useMigrateLegacyJobFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_JOB_FILTER_PARAMS);
}
