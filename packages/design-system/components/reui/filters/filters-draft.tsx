// @ts-nocheck
import type {
  FilterDraft,
  FilterDraftStep,
  FilterOperatorArity,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

/**
 * The filter builder's step machine.
 *
 * Pure, and deliberately kept in the tier that imports nothing from React, Base
 * UI or any shadcn part. The entire create and amend flow (which panel is
 * showing, what Back means from each one, when the value step is skipped, what
 * survives an operator change) is therefore a table test in the node
 * environment with no DOM at all. In the old primitive the same logic lived
 * inside a 526 line component across seven `useState` and seven `useEffect`,
 * where the only way to assert any of it was to render and click.
 *
 * How much of it the SHIPPED chrome drives is worth stating plainly: only
 * `openCreate`, the browse and query actions, `selectField` and `close`.
 * Picking a field commits immediately and the operator menu opens on the new
 * chip, so `selectOperator`, `setValue`, `commit`, `back` and `goto` - the
 * later steps of a walked wizard - are headless surface for a consumer who
 * composes their own multi-step panel, kept modelled here so that panel gets
 * the same table-tested transitions rather than seven `useState` of its own.
 *
 * Every arity decision arrives ON THE ACTION rather than being looked up here.
 * That is what keeps the reducer free of the schema index while still owning
 * the branch that skips the value step.
 */
export type FilterDraftAction<V = unknown> =
  /** Start creating a new filter. */
  | { type: "openCreate"; cascaderPath?: string[] }
  /** Start amending an existing rule at a given step. */
  | {
      type: "openAmend"
      ruleId: string
      step: FilterDraftStep
      path: string[]
      operator: string | null
      value: V | undefined
      /** Where the field picker should open. Defaults to the rule's parent. */
      cascaderPath?: string[]
    }
  | { type: "close" }
  /** The cascader navigated. Records where the user is BROWSING. */
  | { type: "setCascaderPath"; path: string[] }
  /** Search text for the current step's panel. */
  | { type: "setQuery"; query: string }
  | {
      type: "selectField"
      path: string[]
      /** The field's starting operator, already resolved. */
      defaultOperator: string | null
    }
  | {
      type: "selectOperator"
      operator: string
      arity: FilterOperatorArity
      /** The value carried across the operator change, already coerced. */
      value: V | undefined
    }
  | { type: "setValue"; value: V | undefined }
  /** Explicitly finish, from an editor's commit or the Enter key. */
  | { type: "commit"; value?: V }
  | { type: "back" }
  | { type: "goto"; step: FilterDraftStep }

/** The draft a fresh create flow starts from. */
export function createFilterDraft<V = unknown>(
  cascaderPath: string[] = []
): FilterDraft<V> {
  return {
    step: "field",
    status: "editing",
    ruleId: null,
    path: [],
    cascaderPath,
    operator: null,
    value: undefined,
    query: "",
  }
}

/**
 * Where Back goes from each step.
 *
 * The value step returns to the operator step, and the operator step returns to
 * the field picker. Backing out of the field picker closes the builder, which
 * the reducer signals by returning null.
 */
function previousStep(step: FilterDraftStep): FilterDraftStep | null {
  if (step === "value") return "operator"
  if (step === "operator") return "field"
  return null
}

/**
 * `null` is the closed state, not a separate boolean.
 *
 * One value rather than `{ open, draft }` means there is no way to represent
 * "open with no draft" or "closed but still holding one", so the impossible
 * states are unrepresentable rather than merely unused.
 */
export function filterDraftReducer<V = unknown>(
  state: FilterDraft<V> | null,
  action: FilterDraftAction<V>
): FilterDraft<V> | null {
  switch (action.type) {
    case "openCreate":
      return createFilterDraft<V>(action.cascaderPath ?? [])

    case "openAmend":
      return {
        step: action.step,
        status: "editing",
        ruleId: action.ruleId,
        path: action.path,
        // Default the picker to the chosen field's own level, so amending a
        // nested attribute opens beside its siblings rather than at the root.
        cascaderPath: action.cascaderPath ?? action.path.slice(0, -1),
        operator: action.operator,
        value: action.value,
        query: "",
      }

    case "close":
      return null

    case "setCascaderPath":
      if (!state) return state
      if (state.cascaderPath === action.path) return state
      return { ...state, cascaderPath: action.path }

    case "setQuery":
      if (!state) return state
      if (state.query === action.query) return state
      return { ...state, query: action.query }

    case "selectField": {
      if (!state) return state
      // Choosing a field COMMITS straight away. The chip appears immediately
      // with no condition, and the operator menu opens on the chip itself, so
      // the popover never holds a second and third step the user has to walk.
      return {
        ...state,
        path: action.path,
        operator: action.defaultOperator,
        status: "ready",
        // A field change invalidates the value: "Status is Active" cannot keep
        // "Active" when the field becomes "Created at".
        value: undefined,
        step: "operator",
        query: "",
      }
    }

    case "selectOperator": {
      if (!state) return state
      // An operator that takes no value is the whole filter. Advancing to a
      // value step for it would show an empty panel the user has to dismiss.
      if (action.arity === "none") {
        return {
          ...state,
          operator: action.operator,
          value: undefined,
          status: "ready",
          query: "",
        }
      }
      return {
        ...state,
        operator: action.operator,
        value: action.value,
        step: "value",
        status: "editing",
        query: "",
      }
    }

    case "setValue":
      if (!state) return state
      return { ...state, value: action.value }

    case "commit":
      if (!state) return state
      return {
        ...state,
        value: action.value === undefined ? state.value : action.value,
        status: "ready",
      }

    case "back": {
      if (!state) return state
      const step = previousStep(state.step)
      if (!step) return null
      return { ...state, step, status: "editing", query: "" }
    }

    case "goto":
      if (!state) return state
      if (state.step === action.step) return state
      return { ...state, step: action.step, status: "editing", query: "" }

    default:
      return state
  }
}

/**
 * Whether a draft holds enough to become a rule.
 *
 * A path is enough. Not an operator: the shipped flow commits the moment a
 * field is picked and the condition is chosen on the chip after it exists, so
 * `operator: ""` is a legitimate committed state. Not a value either: an
 * `arity: "none"` operator has none by definition, and an editor may
 * legitimately commit `undefined` to mean "clear this", so requiring one here
 * would make both unrepresentable.
 */
export function isFilterDraftCommittable<V>(
  draft: FilterDraft<V> | null
): draft is FilterDraft<V> {
  return Boolean(draft && draft.path.length > 0)
}