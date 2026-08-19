import {
  type FilterDateValue,
  resolveFilterDate,
} from "@pi-dash/design-system/components/reui/filters/filters-date";
import {
  isFilterGroup,
  isFilterQueryEmpty,
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
  return (
    typeof candidate.date === "string" ||
    (candidate.relative !== undefined &&
      typeof candidate.relative.unit === "string")
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

function isActiveNode(node: FilterNode): boolean {
  if (isFilterRule(node)) {
    return isFilterRuleComplete(node) && !isValuePending(node);
  }
  if (!isFilterGroup(node)) {
    return false;
  }
  return node.rules.some(isActiveNode);
}

function matchDate(
  rowValue: unknown,
  operator: string,
  ruleValue: unknown,
  now: Date
): boolean | null {
  const rowDate = rowInstant(rowValue);
  if (operator === "empty") {
    return isNil(rowDate);
  }
  if (operator === "not_empty") {
    return !isNil(rowDate);
  }
  if (isNil(rowDate)) {
    return false;
  }

  if (operator === "between" || operator === "not_between") {
    const range = Array.isArray(ruleValue) ? ruleValue : [];
    const from = isFilterDateValue(range[0])
      ? resolveFilterDate(range[0], now)
      : null;
    const to = isFilterDateValue(range[1])
      ? resolveFilterDate(range[1], now)
      : null;
    if (isNil(from) || isNil(to)) {
      return null;
    }
    const inRange =
      rowDate.getTime() >= startOfDay(from).getTime() &&
      rowDate.getTime() <= endOfDay(to).getTime();
    return operator === "between" ? inRange : !inRange;
  }

  const token = isFilterDateValue(ruleValue)
    ? resolveFilterDate(ruleValue, now)
    : null;
  if (isNil(token)) {
    return null;
  }
  const rowDay = startOfDay(rowDate).getTime();
  const tokenDay = startOfDay(token).getTime();

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
}

function matchNumberCompare(
  rowValue: unknown,
  operator: string,
  bound: number
): boolean {
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
}

function matchText(
  rowValue: unknown,
  operator: string,
  ruleValue: unknown
): boolean | null {
  if (!TEXT_OPERATORS.has(operator)) {
    return null;
  }
  const haystack = asString(rowValue).toLowerCase();
  const needle = asString(ruleValue).toLowerCase();
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
      return null;
  }
}

function matchMembership(
  rowValue: unknown,
  operator: string,
  ruleValue: unknown
): boolean | null {
  if (!MEMBERSHIP_OPERATORS.has(operator)) {
    return null;
  }
  switch (operator) {
    case "is":
      if (typeof rowValue === "boolean") {
        return rowValue === Boolean(ruleValue);
      }
      return asString(rowValue) === asString(ruleValue);
    case "is_not":
      if (typeof rowValue === "boolean") {
        return rowValue !== Boolean(ruleValue);
      }
      return asString(rowValue) !== asString(ruleValue);
    case "is_any_of":
      return new Set(asStringList(ruleValue)).has(asString(rowValue));
    case "is_none_of":
      return !new Set(asStringList(ruleValue)).has(asString(rowValue));
    case "has_any_of": {
      const wanted = new Set(asStringList(ruleValue));
      return asStringList(rowValue).some((item) => wanted.has(item));
    }
    case "has_all_of": {
      const rowSet = new Set(asStringList(rowValue));
      return asStringList(ruleValue).every((item) => rowSet.has(item));
    }
    case "has_none_of": {
      const blocked = new Set(asStringList(ruleValue));
      return asStringList(rowValue).every((item) => !blocked.has(item));
    }
    default:
      return null;
  }
}

function matchNumber(
  rowValue: unknown,
  operator: string,
  ruleValue: unknown
): boolean | null {
  if (!NUMBER_OPERATORS.has(operator)) {
    return null;
  }
  if (operator === "between" || operator === "not_between") {
    const range = Array.isArray(ruleValue) ? ruleValue : [];
    const actual = asNumber(rowValue);
    const from = asNumber(range[0]);
    const to = asNumber(range[1]);
    if (isNil(actual) || isNil(from) || isNil(to)) {
      return true;
    }
    const inRange = actual >= from && actual <= to;
    return operator === "between" ? inRange : !inRange;
  }

  const bound = asNumber(ruleValue);
  if (isNil(bound)) {
    if (operator === "eq") {
      return asString(rowValue) === asString(ruleValue);
    }
    if (operator === "neq") {
      return asString(rowValue) !== asString(ruleValue);
    }
    return false;
  }
  return matchNumberCompare(rowValue, operator, bound);
}

function shouldTryDateMatch(operator: string, ruleValue: unknown): boolean {
  return (
    isFilterDateValue(ruleValue) ||
    DATE_COMPARE_OPERATORS.has(operator) ||
    (Array.isArray(ruleValue) && ruleValue.some(isFilterDateValue))
  );
}

function matchRule(
  rowValue: unknown,
  operator: string,
  ruleValue: unknown,
  now: Date
): boolean {
  if (operator === "empty") {
    return isEmptyValue(rowValue);
  }
  if (operator === "not_empty") {
    return !isEmptyValue(rowValue);
  }

  const dateMatch = shouldTryDateMatch(operator, ruleValue)
    ? matchDate(rowValue, operator, ruleValue, now)
    : null;
  if (dateMatch !== null) {
    return dateMatch;
  }

  const textMatch = matchText(rowValue, operator, ruleValue);
  if (textMatch !== null) {
    return textMatch;
  }

  const membershipMatch = matchMembership(rowValue, operator, ruleValue);
  if (membershipMatch !== null) {
    return membershipMatch;
  }

  const numberMatch = matchNumber(rowValue, operator, ruleValue);
  if (numberMatch !== null) {
    return numberMatch;
  }

  return true;
}

function matchNode<T>(
  node: FilterNode,
  row: T,
  getValue: FilterValueGetter<T>,
  now: Date
): boolean {
  if (isFilterRule(node)) {
    if (!isFilterRuleComplete(node) || isValuePending(node)) {
      return true;
    }
    const matched = matchRule(
      getValue(row, node.path),
      node.operator,
      node.value,
      now
    );
    return node.negated ? !matched : matched;
  }

  if (!isFilterGroup(node)) {
    return true;
  }

  const activeRules = node.rules.filter(isActiveNode);
  if (activeRules.length === 0) {
    return true;
  }

  if (node.combinator === "or") {
    return activeRules.some((child) => matchNode(child, row, getValue, now));
  }

  return activeRules.every((child) => matchNode(child, row, getValue, now));
}

export function compileFilterQuery<T>(
  query: FilterQuery,
  getValue: FilterValueGetter<T>,
  now: Date = new Date()
): (row: T) => boolean {
  if (isFilterQueryEmpty(query)) {
    return () => true;
  }
  return (row: T) => matchNode(query, row, getValue, now);
}
