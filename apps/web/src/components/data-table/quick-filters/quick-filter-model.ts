import {
  createFilterQuery,
  createFilterRule,
  isFilterGroup,
  isFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterField,
  FilterQuery,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types";

import { filterDateValueText } from "@/components/data-table/filter-date";

export type QuickFilterKind = "date" | "number" | "select";

export function quickFilterKind(field: FilterField): QuickFilterKind | null {
  if (field.editor === "date") {
    return "date";
  }
  if (field.type === "number") {
    return "number";
  }
  if (field.type === "select" && Array.isArray(field.options)) {
    return "select";
  }
  return null;
}

/**
 * The quick toolbar shows one flat chip per field. Queries the advanced
 * builder made (nested groups, "or", two rules on one field) need that builder.
 */
export function isQuickFilterQuery(
  query: FilterQuery,
  fields: readonly FilterField[]
): boolean {
  if (query.rules.length > 1 && query.combinator !== "and") {
    return false;
  }
  const seen = new Set<string>();
  for (const node of query.rules) {
    if (isFilterGroup(node) || !isFilterRule(node) || node.negated) {
      return false;
    }
    const id = node.path[0];
    const field = fields.find((candidate) => candidate.id === id);
    if (!(id && field && quickFilterKind(field)) || seen.has(id)) {
      return false;
    }
    seen.add(id);
  }
  return true;
}

export function getFieldRule(
  query: FilterQuery,
  fieldId: string
): FilterRule | undefined {
  return query.rules.find(
    (node): node is FilterRule => isFilterRule(node) && node.path[0] === fieldId
  );
}

/** Replaces the field's rule, keeping its position, or removes it when null. */
export function setFieldRule(
  query: FilterQuery,
  fieldId: string,
  next: { operator: string; value: unknown } | null
): FilterQuery {
  const index = query.rules.findIndex(
    (node) => isFilterRule(node) && node.path[0] === fieldId
  );
  const rules = [...query.rules];
  const rule = next
    ? createFilterRule({
        id: `quick-${fieldId}`,
        operator: next.operator,
        path: [fieldId],
        value: next.value,
      })
    : null;
  if (index === -1) {
    if (rule) {
      rules.push(rule);
    }
  } else if (rule) {
    rules[index] = rule;
  } else {
    rules.splice(index, 1);
  }
  return createFilterQuery(rules, query.combinator, query.id);
}

/** Selected option values for a select rule, whatever operator stored them. */
export function selectedValues(rule: FilterRule | undefined): string[] {
  if (!rule) {
    return [];
  }
  if (Array.isArray(rule.value)) {
    return rule.value.filter(
      (value): value is string => typeof value === "string"
    );
  }
  return typeof rule.value === "string" && rule.value ? [rule.value] : [];
}

export function isExcluding(rule: FilterRule | undefined): boolean {
  return rule?.operator === "is_not" || rule?.operator === "is_none_of";
}

/** Writes a select rule: one value as `is`, several as `is_any_of`. */
export function selectRule(
  values: readonly string[],
  exclude: boolean
): { operator: string; value: unknown } | null {
  if (values.length === 0) {
    return null;
  }
  if (values.length === 1) {
    return { operator: exclude ? "is_not" : "is", value: values[0] };
  }
  return { operator: exclude ? "is_none_of" : "is_any_of", value: [...values] };
}

export interface DatePreset {
  days: number;
  label: string;
}

/** Ranges ending today. Stored relative, so a saved link stays current. */
export const DATE_PRESETS: readonly DatePreset[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

export function datePresetRule(preset: DatePreset): {
  operator: string;
  value: unknown;
} {
  if (preset.days === 1) {
    return { operator: "is", value: { relative: { offset: 0, unit: "day" } } };
  }
  return {
    operator: "between",
    value: [
      { relative: { offset: -(preset.days - 1), unit: "day" } },
      { relative: { offset: 0, unit: "day" } },
    ],
  };
}

export function matchDatePreset(
  rule: FilterRule | undefined
): DatePreset | undefined {
  if (!rule) {
    return;
  }
  const value = JSON.stringify({ operator: rule.operator, value: rule.value });
  return DATE_PRESETS.find(
    (preset) => JSON.stringify(datePresetRule(preset)) === value
  );
}

const NUMBER_OPERATOR_LABELS: Record<string, string> = {
  eq: "",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  neq: "≠",
};

const DATE_OPERATOR_LABELS: Record<string, string> = {
  between: "",
  empty: "is empty",
  is: "",
  is_after: "after",
  is_before: "before",
  is_not: "not",
  not_between: "not",
  not_empty: "is set",
};

/** The value part of a chip, e.g. "Mumbai, Pune", "Last 30 days", "≥ 500". */
export function summarizeRule(field: FilterField, rule: FilterRule): string {
  const kind = quickFilterKind(field);
  if (kind === "select") {
    const options = Array.isArray(field.options) ? field.options : [];
    const labels = selectedValues(rule).map(
      (value) =>
        options.find((option) => option.value === value)?.label ?? value
    );
    const shown =
      labels.length > 2
        ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
        : labels.join(", ");
    return isExcluding(rule) ? `not ${shown}` : shown;
  }
  if (kind === "date") {
    const preset = matchDatePreset(rule);
    if (preset) {
      return preset.label;
    }
    const operator = DATE_OPERATOR_LABELS[rule.operator] ?? rule.operator;
    const value = filterDateValueText({ value: rule.value } as never);
    return [operator, value].filter(Boolean).join(" ");
  }
  const operator = NUMBER_OPERATOR_LABELS[rule.operator] ?? rule.operator;
  return `${operator} ${String(rule.value ?? "")}`.trim();
}

/** A rule is worth a chip only once it filters something. */
export function isRuleComplete(rule: FilterRule): boolean {
  if (rule.operator === "empty" || rule.operator === "not_empty") {
    return true;
  }
  if (Array.isArray(rule.value)) {
    return rule.value.length > 0 && rule.value.every((item) => item !== null);
  }
  return rule.value !== undefined && rule.value !== null && rule.value !== "";
}

/** Per select field, how many rows hold each option value. */
export function countOptions<TData>(
  data: readonly TData[],
  fields: readonly FilterField[],
  getValue: (row: TData, path: string[]) => unknown
): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  for (const field of fields) {
    if (quickFilterKind(field) !== "select") {
      continue;
    }
    const perValue = new Map<string, number>();
    for (const row of data) {
      const raw = getValue(row, [field.id]);
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of new Set(values)) {
        if (typeof value === "string") {
          perValue.set(value, (perValue.get(value) ?? 0) + 1);
        }
      }
    }
    counts.set(field.id, perValue);
  }
  return counts;
}
