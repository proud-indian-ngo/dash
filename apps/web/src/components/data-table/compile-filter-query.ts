import {
  type FilterDateValue,
  resolveFilterDate,
} from "@pi-dash/design-system/components/reui/filters/filters-date";
import {
  flattenFilterRules,
  isFilterGroup,
  isFilterRule,
  isFilterRuleComplete,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterNode,
  FilterQuery,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { endOfDay, startOfDay } from "date-fns";

export type FilterValueGetter<T> = (row: T, path: string[]) => unknown;

const NONE_ARITY_OPERATORS = new Set(["empty", "not_empty"]);
const DATE_COMPARE_OPERATORS = new Set([
  "is_before",
  "is_after",
  "is_on_or_before",
  "is_on_or_after",
]);
const TEXT_OPERATORS = new Set([
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
]);
const MEMBERSHIP_OPERATORS = new Set([
  "is",
  "is_not",
  "is_any_of",
  "is_none_of",
  "has_any_of",
  "has_all_of",
  "has_none_of",
]);
const NUMBER_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "not_between",
]);

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function isFilterDateValue(value: unknown): value is FilterDateValue {
  if (typeof value !== "object" || isNil(value)) {
    return false;
  }
  const candidate = value as FilterDateValue;
  const relative = candidate.relative;
  if (isNil(relative)) {
    return typeof candidate.date === "string";
  }
  return (
    typeof relative === "object" &&
    (relative.unit === "day" ||
      relative.unit === "week" ||
      relative.unit === "month" ||
      relative.unit === "year") &&
    typeof relative.offset === "number" &&
    Number.isFinite(relative.offset)
  );
}

function isEmptyValue(value: unknown): boolean {
  if (isNil(value)) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function asString(value: unknown): string {
  if (isNil(value)) {
    return "";
  }
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (isNil(value)) {
    return [];
  }
  return [String(value)];
}

function stringListHasAny(value: unknown, wanted: Set<string>): boolean {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (wanted.has(String(item))) {
        return true;
      }
    }
    return false;
  }
  return !isNil(value) && wanted.has(String(value));
}

function rowInstant(value: unknown): Date | null {
  if (isNil(value) || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function localDayKey(date: Date): number {
  return date.getFullYear() * 10_000 + date.getMonth() * 100 + date.getDate();
}

function isValuePending(rule: FilterRule): boolean {
  if (NONE_ARITY_OPERATORS.has(rule.operator)) {
    return false;
  }
  if (isNil(rule.value)) {
    return true;
  }
  if (
    (rule.operator === "between" || rule.operator === "not_between") &&
    (!Array.isArray(rule.value) || isNil(rule.value[0]) || isNil(rule.value[1]))
  ) {
    return true;
  }
  if (
    (rule.operator === "is_any_of" ||
      rule.operator === "is_none_of" ||
      rule.operator === "has_any_of" ||
      rule.operator === "has_all_of" ||
      rule.operator === "has_none_of") &&
    Array.isArray(rule.value) &&
    rule.value.length === 0
  ) {
    return true;
  }
  return false;
}

type ValueMatcher = (rowValue: unknown) => boolean;
type DateMatcher = (rowValue: unknown) => boolean | null;

function compileDateMatcher(
  operator: string,
  ruleValue: unknown,
  now: Date
): DateMatcher {
  if (operator === "between" || operator === "not_between") {
    const range = Array.isArray(ruleValue) ? ruleValue : [];
    const from = isFilterDateValue(range[0])
      ? resolveFilterDate(range[0], now)
      : null;
    const to = isFilterDateValue(range[1])
      ? resolveFilterDate(range[1], now)
      : null;
    const fromTime = isNil(from) ? null : startOfDay(from).getTime();
    const toTime = isNil(to) ? null : endOfDay(to).getTime();

    return (rowValue) => {
      const rowDate = rowInstant(rowValue);
      if (isNil(rowDate)) {
        return false;
      }
      if (isNil(fromTime) || isNil(toTime)) {
        return null;
      }
      const rowTime = rowDate.getTime();
      const inRange = rowTime >= fromTime && rowTime <= toTime;
      return operator === "between" ? inRange : !inRange;
    };
  }

  const token = isFilterDateValue(ruleValue)
    ? resolveFilterDate(ruleValue, now)
    : null;
  const tokenDay = isNil(token) ? null : localDayKey(token);

  return (rowValue) => {
    const rowDate = rowInstant(rowValue);
    if (isNil(rowDate)) {
      return false;
    }
    if (isNil(tokenDay)) {
      return null;
    }
    const rowDay = localDayKey(rowDate);

    switch (operator) {
      case "is":
      case "eq":
        return rowDay === tokenDay;
      case "is_not":
      case "neq":
        return rowDay !== tokenDay;
      case "is_before":
      case "lt":
        return rowDay < tokenDay;
      case "is_on_or_before":
      case "lte":
        return rowDay <= tokenDay;
      case "is_after":
      case "gt":
        return rowDay > tokenDay;
      case "is_on_or_after":
      case "gte":
        return rowDay >= tokenDay;
      default:
        return null;
    }
  };
}

function compileTextMatcher(
  operator: string,
  ruleValue: unknown
): ValueMatcher | null {
  if (!TEXT_OPERATORS.has(operator)) {
    return null;
  }
  const needle = asString(ruleValue).toLowerCase();
  return (rowValue) => {
    const haystack = asString(rowValue).toLowerCase();
    switch (operator) {
      case "contains":
        return haystack.includes(needle);
      case "not_contains":
        return !haystack.includes(needle);
      case "starts_with":
        return haystack.startsWith(needle);
      case "ends_with":
        return haystack.endsWith(needle);
      default:
        return true;
    }
  };
}

function compileMembershipMatcher(
  operator: string,
  ruleValue: unknown
): ValueMatcher | null {
  if (!MEMBERSHIP_OPERATORS.has(operator)) {
    return null;
  }
  switch (operator) {
    case "is": {
      const booleanValue = Boolean(ruleValue);
      const stringValue = asString(ruleValue);
      return (rowValue) =>
        typeof rowValue === "boolean"
          ? rowValue === booleanValue
          : asString(rowValue) === stringValue;
    }
    case "is_not": {
      const booleanValue = Boolean(ruleValue);
      const stringValue = asString(ruleValue);
      return (rowValue) =>
        typeof rowValue === "boolean"
          ? rowValue !== booleanValue
          : asString(rowValue) !== stringValue;
    }
    case "is_any_of": {
      const wanted = new Set(asStringList(ruleValue));
      return (rowValue) => wanted.has(asString(rowValue));
    }
    case "is_none_of": {
      const blocked = new Set(asStringList(ruleValue));
      return (rowValue) => !blocked.has(asString(rowValue));
    }
    case "has_any_of": {
      const wanted = new Set(asStringList(ruleValue));
      return (rowValue) => stringListHasAny(rowValue, wanted);
    }
    case "has_all_of": {
      const wanted = asStringList(ruleValue);
      return (rowValue) => {
        const rowSet = new Set(asStringList(rowValue));
        return wanted.every((item) => rowSet.has(item));
      };
    }
    case "has_none_of": {
      const blocked = new Set(asStringList(ruleValue));
      return (rowValue) => !stringListHasAny(rowValue, blocked);
    }
    default:
      return null;
  }
}

function compileNumberMatcher(
  operator: string,
  ruleValue: unknown
): ValueMatcher | null {
  if (!NUMBER_OPERATORS.has(operator)) {
    return null;
  }
  if (operator === "between" || operator === "not_between") {
    const range = Array.isArray(ruleValue) ? ruleValue : [];
    const from = asNumber(range[0]);
    const to = asNumber(range[1]);
    return (rowValue) => {
      const actual = asNumber(rowValue);
      if (isNil(actual) || isNil(from) || isNil(to)) {
        return true;
      }
      const inRange = actual >= from && actual <= to;
      return operator === "between" ? inRange : !inRange;
    };
  }

  const bound = asNumber(ruleValue);
  if (isNil(bound)) {
    const stringValue = asString(ruleValue);
    if (operator === "eq") {
      return (rowValue) => asString(rowValue) === stringValue;
    }
    if (operator === "neq") {
      return (rowValue) => asString(rowValue) !== stringValue;
    }
    return () => false;
  }
  return (rowValue) => {
    const actual = asNumber(rowValue);
    if (isNil(actual)) {
      return false;
    }
    switch (operator) {
      case "eq":
        return actual === bound;
      case "neq":
        return actual !== bound;
      case "gt":
        return actual > bound;
      case "gte":
        return actual >= bound;
      case "lt":
        return actual < bound;
      case "lte":
        return actual <= bound;
      default:
        return true;
    }
  };
}

function shouldTryDateMatch(operator: string, ruleValue: unknown): boolean {
  return (
    isFilterDateValue(ruleValue) ||
    DATE_COMPARE_OPERATORS.has(operator) ||
    (Array.isArray(ruleValue) && ruleValue.some(isFilterDateValue))
  );
}

function compileRuleMatcher(
  operator: string,
  ruleValue: unknown,
  now: Date
): ValueMatcher {
  if (operator === "empty") {
    return isEmptyValue;
  }
  if (operator === "not_empty") {
    return (rowValue) => !isEmptyValue(rowValue);
  }

  const dateMatcher = shouldTryDateMatch(operator, ruleValue)
    ? compileDateMatcher(operator, ruleValue, now)
    : null;
  const fallbackMatcher =
    compileTextMatcher(operator, ruleValue) ??
    compileMembershipMatcher(operator, ruleValue) ??
    compileNumberMatcher(operator, ruleValue) ??
    (() => true);

  if (isNil(dateMatcher)) {
    return fallbackMatcher;
  }
  return (rowValue) => dateMatcher(rowValue) ?? fallbackMatcher(rowValue);
}

type RowMatcher<T> = (row: T) => boolean;

function compileNode<T>(
  node: FilterNode,
  getValue: FilterValueGetter<T>,
  now: Date
): RowMatcher<T> | null {
  if (isFilterRule(node)) {
    if (!isFilterRuleComplete(node) || isValuePending(node)) {
      return null;
    }
    const matchValue = compileRuleMatcher(node.operator, node.value, now);
    if (node.negated) {
      return (row) => !matchValue(getValue(row, node.path));
    }
    return (row) => matchValue(getValue(row, node.path));
  }

  if (!isFilterGroup(node)) {
    return null;
  }

  const matchers = node.rules.flatMap((child) => {
    const matcher = compileNode(child, getValue, now);
    return isNil(matcher) ? [] : [matcher];
  });
  if (matchers.length === 0) {
    return null;
  }

  if (node.combinator === "or") {
    return (row) => {
      for (const matcher of matchers) {
        if (matcher(row)) {
          return true;
        }
      }
      return false;
    };
  }

  return (row) => {
    for (const matcher of matchers) {
      if (!matcher(row)) {
        return false;
      }
    }
    return true;
  };
}

export function compileFilterQuery<T>(
  query: FilterQuery,
  getValue: FilterValueGetter<T>,
  now: Date = new Date()
): (row: T) => boolean {
  return compileNode(query, getValue, now) ?? (() => true);
}

export function readSelectEquality(
  query: FilterQuery,
  path: string
): string | undefined {
  for (const rule of flattenFilterRules(query)) {
    if (
      !isFilterRuleComplete(rule) ||
      rule.operator !== "is" ||
      rule.negated ||
      rule.path[0] !== path ||
      typeof rule.value !== "string" ||
      rule.value === ""
    ) {
      continue;
    }
    return rule.value;
  }
}

function stripFilterPath(node: FilterNode, path: string): FilterNode[] {
  if (isFilterRule(node)) {
    return node.path[0] === path ? [] : [node];
  }
  if (!isFilterGroup(node)) {
    return [];
  }
  const rules = node.rules.flatMap((child) => stripFilterPath(child, path));
  if (rules.length === 0) {
    return [];
  }
  return [{ ...node, rules }];
}

export function removeFilterPath(
  query: FilterQuery,
  path: string
): FilterQuery {
  const rules = query.rules.flatMap((node) => stripFilterPath(node, path));
  return { ...query, rules };
}
