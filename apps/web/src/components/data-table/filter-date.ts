import {
  type FilterDateValue,
  formatFilterDate,
} from "@pi-dash/design-system/components/reui/filters/filters-date";
import type {
  FilterOperator,
  FilterValueDisplayContext,
} from "@pi-dash/design-system/components/reui/filters/filters-types";

export const DATE_FILTER_OPERATORS: FilterOperator[] = [
  { arity: "one", inverse: "is_not", label: "is", value: "is" },
  { arity: "one", inverse: "is", label: "is not", value: "is_not" },
  { arity: "one", label: "is before", value: "is_before" },
  { arity: "one", label: "is after", value: "is_after" },
  {
    arity: "range",
    inverse: "not_between",
    label: "is between",
    value: "between",
  },
  {
    arity: "range",
    inverse: "between",
    label: "is not between",
    value: "not_between",
  },
  { arity: "none", inverse: "not_empty", label: "is empty", value: "empty" },
  {
    arity: "none",
    inverse: "empty",
    label: "is not empty",
    value: "not_empty",
  },
];

export function isFilterDateValue(value: unknown): value is FilterDateValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as FilterDateValue;
  return (
    typeof candidate.date === "string" ||
    (candidate.relative !== undefined &&
      typeof candidate.relative.unit === "string")
  );
}

export function filterDateValueText(
  context: FilterValueDisplayContext
): string {
  const { value } = context;
  if (Array.isArray(value)) {
    const from = isFilterDateValue(value[0]) ? formatFilterDate(value[0]) : "";
    const to = isFilterDateValue(value[1]) ? formatFilterDate(value[1]) : "";
    return [from, to].filter(Boolean).join(" – ");
  }
  if (isFilterDateValue(value)) {
    return formatFilterDate(value);
  }
  return "";
}
