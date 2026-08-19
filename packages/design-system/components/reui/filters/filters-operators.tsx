// @ts-nocheck
import type {
  FilterField,
  FilterOperator,
  FilterValueType,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

/**
 * Every operator label, keyed by operator value.
 *
 * Separate from `FilterLabels` because the two are overridden for different
 * reasons: chrome copy is translated once per app, while operator wording is
 * routinely reworded per domain ("contains" reads wrong on a tag field) without
 * touching anything else.
 */
export type FilterOperatorLabels = Record<string, string>

export const DEFAULT_FILTER_OPERATOR_LABELS: FilterOperatorLabels = {
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is: "is",
  is_not: "is not",
  is_any_of: "is any of",
  is_none_of: "is none of",
  has_any_of: "has any of",
  has_all_of: "has all of",
  has_none_of: "has none of",
  eq: "equals",
  neq: "does not equal",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to",
  between: "is between",
  not_between: "is not between",
  is_before: "is before",
  is_after: "is after",
  is_on_or_before: "is on or before",
  is_on_or_after: "is on or after",
  empty: "is empty",
  not_empty: "is not empty",
}

/**
 * The operator catalog, per value type.
 *
 * Declared as value plus arity plus inverse, with the label looked up at build
 * time, so a consumer translating one operator does not have to restate the
 * whole catalog. `arity` is what removes the old primitive's hardcoded
 * `operator === "empty" || operator === "not_empty"` checks: `"none"` means the
 * chip renders no value segment and the wizard skips its value step, whoever
 * declared the operator.
 */
const CATALOG: Record<
  FilterValueType,
  { value: string; arity?: FilterOperator["arity"]; inverse?: string }[]
> = {
  text: [
    { value: "contains", inverse: "not_contains" },
    { value: "not_contains", inverse: "contains" },
    { value: "starts_with" },
    { value: "ends_with" },
    { value: "is", inverse: "is_not" },
    { value: "is_not", inverse: "is" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
  number: [
    { value: "eq", inverse: "neq" },
    { value: "neq", inverse: "eq" },
    { value: "gt", inverse: "lte" },
    { value: "gte", inverse: "lt" },
    { value: "lt", inverse: "gte" },
    { value: "lte", inverse: "gt" },
    { value: "between", arity: "range", inverse: "not_between" },
    { value: "not_between", arity: "range", inverse: "between" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
  range: [
    { value: "between", arity: "range", inverse: "not_between" },
    { value: "not_between", arity: "range", inverse: "between" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
  select: [
    { value: "is", inverse: "is_not" },
    { value: "is_not", inverse: "is" },
    { value: "is_any_of", arity: "many", inverse: "is_none_of" },
    { value: "is_none_of", arity: "many", inverse: "is_any_of" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
  multiselect: [
    { value: "has_any_of", arity: "many", inverse: "has_none_of" },
    { value: "has_all_of", arity: "many" },
    { value: "has_none_of", arity: "many", inverse: "has_any_of" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
  boolean: [
    { value: "is", inverse: "is_not" },
    { value: "is_not", inverse: "is" },
    { value: "empty", arity: "none", inverse: "not_empty" },
    { value: "not_empty", arity: "none", inverse: "empty" },
  ],
}

/** The default value type used when a field does not declare one. */
export const DEFAULT_FILTER_VALUE_TYPE: FilterValueType = "text"

/**
 * Builds the operator catalog for one set of labels.
 *
 * Memoized by the caller on the label object, never rebuilt per render. The old
 * primitive called its equivalent from inside `getOperatorsForField`, which ran
 * on every miss and allocated four arrays of twenty-seven objects each, keyed on
 * a `values` array that was fresh after every single filter update.
 */
export function createFilterOperators(
  labels: FilterOperatorLabels
): Record<FilterValueType, FilterOperator[]> {
  const built = {} as Record<FilterValueType, FilterOperator[]>
  for (const type of Object.keys(CATALOG) as FilterValueType[]) {
    built[type] = CATALOG[type].map((entry) => ({
      value: entry.value,
      label: labels[entry.value] ?? entry.value,
      arity: entry.arity ?? "one",
      inverse: entry.inverse,
    }))
  }
  return built
}

export const DEFAULT_FILTER_OPERATORS: Record<FilterValueType, FilterOperator[]> =
  createFilterOperators(DEFAULT_FILTER_OPERATOR_LABELS)

/**
 * The operators available for a field.
 *
 * A field's own `operators` wins outright, as an array or as a function of the
 * field. Otherwise the catalog entry for its `type`. Unlike the old primitive
 * there is no implicit promotion from select to multiselect based on how many
 * values happen to be selected: that made the operator list change underneath
 * the user as they picked, and it meant the same field offered different
 * operators at different times.
 */
export function resolveFilterOperators<V, O>(
  field: FilterField<V, O>,
  catalog: Record<FilterValueType, FilterOperator[]> = DEFAULT_FILTER_OPERATORS
): FilterOperator[] {
  if (typeof field.operators === "function") return field.operators(field)
  if (field.operators) return field.operators
  return catalog[field.type ?? DEFAULT_FILTER_VALUE_TYPE] ?? catalog.text
}

/** Operators a user may pick from, which excludes hidden ones. */
export function visibleFilterOperators(
  operators: readonly FilterOperator[]
): FilterOperator[] {
  return operators.filter((operator) => !operator.hidden)
}

/** Looks an operator up by value. */
export function getFilterOperator(
  operators: readonly FilterOperator[],
  value: string | null | undefined
): FilterOperator | undefined {
  if (!value) return undefined
  return operators.find((operator) => operator.value === value)
}

/** An operator's arity, defaulting to `"one"`. */
export function getFilterArity(
  operator: FilterOperator | undefined
): FilterOperator["arity"] {
  return operator?.arity ?? "one"
}

/** Whether an operator takes a value at all. */
export function operatorTakesValue(
  operator: FilterOperator | undefined
): boolean {
  return getFilterArity(operator) !== "none"
}

/**
 * The operator a field starts with.
 *
 * `defaultOperator` when it names a real one, otherwise the first visible
 * operator. Falling back rather than trusting the schema matters because a
 * default naming an operator the field does not offer would leave the rule in a
 * state its own operator list cannot represent.
 */
export function getDefaultFilterOperator<V, O>(
  field: FilterField<V, O>,
  operators: readonly FilterOperator[]
): string | null {
  if (field.defaultOperator) {
    const named = getFilterOperator(operators, field.defaultOperator)
    if (named) return named.value
  }
  const visible = visibleFilterOperators(operators)
  return visible[0]?.value ?? operators[0]?.value ?? null
}

/**
 * The result of negating a rule.
 *
 * Two mechanisms, in order: swap to the declared `inverse` when there is one,
 * because "contains" flipping to "does not contain" is what a user expects to
 * read in the chip; otherwise toggle `negated`, which keeps Negate available for
 * custom operators that never declared an opposite.
 */
export function negateFilterOperator(
  operator: FilterOperator | undefined,
  operators: readonly FilterOperator[],
  negated: boolean | undefined
): { operator: string | null; negated: boolean } {
  if (operator?.inverse) {
    const inverse = getFilterOperator(operators, operator.inverse)
    if (inverse) return { operator: inverse.value, negated: Boolean(negated) }
  }
  return { operator: operator?.value ?? null, negated: !negated }
}

/**
 * Reshapes a value when the operator's arity changes.
 *
 * Changing "is" to "is any of" should keep the value the user already picked
 * rather than silently dropping it, and changing back should keep the first of
 * them. Only a genuinely incompatible move loses data, and `"none"` always does
 * because there is nowhere to put it.
 */
export function coerceFilterValue(
  value: unknown,
  from: FilterOperator | undefined,
  to: FilterOperator | undefined
): unknown {
  const nextArity = getFilterArity(to)
  if (nextArity === "none") return undefined
  if (value === undefined || value === null) return value

  const previousArity = getFilterArity(from)
  if (previousArity === nextArity) return value

  const asArray = Array.isArray(value) ? value : [value]

  if (nextArity === "many") return asArray
  if (nextArity === "one") return asArray[0]
  if (nextArity === "range") {
    return [asArray[0], asArray[1]] as [unknown, unknown]
  }
  return value
}