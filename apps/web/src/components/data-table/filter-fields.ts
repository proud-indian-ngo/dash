import type {
  FilterField,
  FilterOperator,
  FilterOption,
} from "@pi-dash/design-system/components/reui/filters/filters-types";

import {
  DATE_FILTER_OPERATORS,
  filterDateValueText,
} from "@/components/data-table/filter-date";

export const SELECT_IS_ONLY_OPERATORS: FilterOperator[] = [
  { arity: "one", label: "is", value: "is" },
];

export function selectField(
  id: string,
  label: string,
  options: FilterOption[],
  operators?: FilterOperator[]
): FilterField {
  return {
    defaultOperator: "is",
    id,
    label,
    options,
    type: "select",
    ...(operators ? { operators } : {}),
  };
}

export function numberField(id: string, label: string): FilterField {
  return {
    defaultOperator: "gte",
    id,
    label,
    type: "number",
  };
}

export function dateField(id: string, label: string): FilterField {
  return {
    defaultOperator: "is",
    editor: "date",
    id,
    label,
    operators: DATE_FILTER_OPERATORS,
    valueText: filterDateValueText,
  };
}

export function optionsFromRows<T>(
  rows: readonly T[],
  getId: (row: T) => string | null | undefined,
  getLabel: (row: T) => string
): FilterOption[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const id = getId(row);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.set(id, getLabel(row) || id);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
