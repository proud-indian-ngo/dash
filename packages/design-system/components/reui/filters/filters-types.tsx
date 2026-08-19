// @ts-nocheck
import type * as React from "react"

/* -------------------------------------------------------------------------- */
/*                                 Query tree                                 */
/* -------------------------------------------------------------------------- */

/** How the rules inside one group combine. */
export type FilterCombinator = "and" | "or"

/**
 * One condition: a field, an operator, and a value.
 *
 * `path` rather than a single `field` key, because a field may nest
 * (`["name", "first"]`). It maps one to one onto the cascader's
 * `details.path`, so committing a field selection needs no translation step.
 *
 * `value` is SINGULAR, not an array. The old primitive stored `values: T[]`
 * for every field, which meant every text editor read `values[0]` and every
 * consumer had to remember that an empty operator still carried `[]`. The
 * operator's `arity` decides the shape instead: `"many"` operators hold an
 * array because they mean one, `"range"` operators hold a tuple, and an
 * `arity: "none"` operator holds `undefined` because there is nothing to hold.
 */
export interface FilterRule<V = unknown> {
  id: string
  type: "rule"
  /** Field path, root first. `["name", "first"]` for a nested attribute. */
  path: string[]
  operator: string
  value: V | undefined
  /**
   * Flips the rule's meaning without changing its operator. Set by the chip
   * menu's Negate action when the operator declares no `inverse` to swap to.
   */
  negated?: boolean
}

/**
 * A set of rules combined by one operator, and the recursive case that makes
 * `(A and B) or C` expressible.
 *
 * Groups nest to any depth from day one even though the shipped chrome renders
 * only the flat case. The alternative was a flat `FilterRule[]` plus a second
 * breaking change later, since adding nesting to a flat array changes the shape
 * every consumer persists.
 */
export interface FilterGroupNode<V = unknown> {
  id: string
  type: "group"
  combinator: FilterCombinator
  rules: FilterNode<V>[]
}

export type FilterNode<V = unknown> = FilterRule<V> | FilterGroupNode<V>

/**
 * A whole query. Always a group, never a bare array.
 *
 * A root that is always a group is what lets the combinator live somewhere
 * addressable: a flat chip row is simply a root group whose `rules` happen to
 * contain no nested groups, so the flat and nested cases are one code path
 * rather than two.
 */
export type FilterQuery<V = unknown> = FilterGroupNode<V>

/** Why `onQueryChange` fired. */
export type FilterChangeReason =
  | "add"
  | "update"
  | "remove"
  | "duplicate"
  | "negate"
  | "reorder"
  | "combinator"
  | "clear"

/**
 * Second argument handed to `onQueryChange`.
 *
 * The query alone forces every consumer to diff two trees to answer "what just
 * happened". The details object answers it directly.
 */
export interface FilterChangeDetails<V = unknown, O = unknown> {
  reason: FilterChangeReason
  /** The rule that changed, or null for whole-query changes like `clear`. */
  rule: FilterRule<V> | null
  /** The field the rule points at, resolved. Null when the path is unknown. */
  field: FilterField<V, O> | null
}

/* -------------------------------------------------------------------------- */
/*                                  Operators                                 */
/* -------------------------------------------------------------------------- */

/**
 * How many values an operator takes.
 *
 * This is the single most load-bearing field in the whole schema. The old
 * primitive had no arity, so "does this operator need a value editor" was
 * answered by hardcoding `operator === "empty" || operator === "not_empty"` in
 * four separate places, and a consumer who added their own valueless operator
 * had no way to say so. Arity replaces every one of those special cases.
 */
export type FilterOperatorArity = "none" | "one" | "many" | "range"

export interface FilterOperator {
  value: string
  label: string
  /** Defaults to `"one"`. */
  arity?: FilterOperatorArity
  /**
   * The operator that means the opposite. Powers the chip menu's Negate action,
   * which flips to this operator when it exists and sets `rule.negated`
   * otherwise.
   */
  inverse?: string
  /** Hidden from the operator list but still valid in a restored query. */
  hidden?: boolean
}

/* -------------------------------------------------------------------------- */
/*                                   Fields                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which built-in editor a field uses when it does not name its own.
 *
 * A field's type is a DEFAULT, not a constraint: `editor` overrides it, and an
 * operator may override both (a `between` operator on a number field wants the
 * range editor whatever the field said).
 */
/**
 * Note what is NOT here: dates.
 *
 * A date filter is a rich control with its own parsing, presets and calendar,
 * and every product wants a different one. Shipping a half-opinionated date
 * editor in the core would make it the default nobody quite wants, and would
 * add a calendar dependency to every install. A date is an `editor` like any
 * other consumer control.
 */
export type FilterValueType =
  | "text"
  | "number"
  | "range"
  | "select"
  | "multiselect"
  | "boolean"

/** One choosable value, for the option-backed editors. */
export interface FilterOption<O = unknown> {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  disabled?: boolean
  /**
   * The row that means NONE OF THE ABOVE: Unassigned, No label, No due date.
   *
   * Picking it clears every other pick, picking anything else clears it, and it
   * is drawn apart from the rest of the list under a rule of its own. This is
   * the standard None option, and it belongs in the primitive rather than in
   * each consumer's `onQueryChange`: a consumer can rewrite the value array
   * after the fact, but they cannot reach the MENU, so the rule above the row
   * and the visual deselection of the rows it just cleared stay impossible
   * however careful they are.
   *
   * ONE flag carries both the logic and the rule, deliberately. The rule is not
   * decoration: it is the only thing on screen that says this row does not
   * behave like its neighbours, and a list that wipes a selection without
   * looking any different from one that does not is a list that surprises. A
   * second flag would let a consumer ship exactly the surprising half. The
   * rendering is still reachable rather than welded shut, which is the other
   * half of the rule: the line is a `[data-slot=filter-menu-divider]` span
   * inside the panel that `className` below already reaches, so
   * `"[&_[data-slot=filter-menu-divider]]:hidden"` turns it off without adding
   * a knob that one consumer in a hundred would ever set.
   *
   * Meaningless on a SINGLE-valued operator, where every pick already replaces
   * the last one, and harmless there: the same normalization hands back the
   * same one-element selection either way. No warning is issued for that, and
   * none can be: single or multi is a property of the OPERATOR's arity rather
   * than of the field, so one option is exclusive-redundant under `is` and
   * exclusive-load-bearing under `is any of` in the same schema, minutes apart.
   * `findFilterSchemaIssues` reports what is BROKEN, never what is redundant.
   *
   * Applied under EVERY operator, negative ones included, and that is a ruling
   * rather than an oversight. `has none of (nobody, Ada)` genuinely does read
   * as "has an assignee, and it is not Ada", so the rule costs a sentence
   * there. Making it depend on the operator would cost more: the same row would
   * behave one way under `has any of` and another under `has none of`, so what
   * a press does would change when a dropdown two clicks away changes, and
   * switching an existing rule's operator would strand a value array the new
   * operator forbids - which only a rewrite on read could clear up, and that is
   * what the paragraph in `applyFilterExclusiveSelection` refuses to do. The
   * sentence the ruling costs is already sayable without the None row anyway:
   * `is not empty` plus `has none of (Ada)` is two conditions that say it
   * exactly, and every type in the catalog ships `empty` and `not_empty`.
   *
   * Its own value has to be RESOLVABLE for any of this to hold, which matters
   * on an async field: the rule is applied through the option service, so an
   * exclusive option that exists only inside a `loadOptions` page nobody has
   * fetched is invisible to it. See `applyFilterExclusiveSelection` for what
   * happens then and what to declare instead.
   *
   * Said out loud, too. The rule above the row is a pixel, so it reaches nobody
   * who cannot see it: `labels.exclusiveHint` joins the row's accessible name
   * BEFORE the press, and `labels.exclusiveAnnouncement` reports the clearing
   * to the bar's live region after it.
   *
   * See `applyFilterExclusiveSelection` for the selection algebra, and
   * `FilterMenu` for where the row is drawn.
   */
  exclusive?: boolean
  /** Arbitrary payload, carried untouched through every render callback. */
  data?: O
}

/** Argument handed to `loadOptions`. */
export interface FilterLoadContext {
  /** Aborted when the query changes, the editor closes, or a load supersedes. */
  signal: AbortSignal
  /** Cursor returned by the previous page, or undefined for the first. */
  cursor?: string
}

/**
 * Value returned by `loadOptions`. A bare array is also accepted.
 *
 * Shape-identical to the cascader's `CascaderLoadResult` on purpose, and the
 * two must not drift: `useFilterOptions` is a deliberate fork of the cascader's
 * async machinery (see the note on that hook), and a consumer moving a loader
 * between the two primitives should not have to reshape its result.
 */
export interface FilterLoadResult<O = unknown> {
  items: FilterOption<O>[]
  nextCursor?: string
  /** Defaults to whether `nextCursor` was supplied. */
  hasMore?: boolean
}

/**
 * One filterable field, or a branch holding more of them.
 *
 * There is deliberately no separate `FilterFieldGroup` type. The old primitive
 * had one, plus a `group` string, plus a `groupLabel` string, plus a
 * `type: "separator"`, and NONE of them rendered: `flattenFields` threw the
 * grouping away and `selectableFields` filtered separators out. A group here is
 * simply a field that carries `fields` and is not `selectable`, which is the
 * same shape the cascader already navigates.
 */
export interface FilterField<V = unknown, O = unknown> {
  /** Stable id. Unique among its siblings; the full path must be unique. */
  id: string
  label: string
  icon?: React.ReactNode
  description?: string
  /** Extra terms matched by search alongside the label. */
  keywords?: string[]
  /**
   * Trailing count on the picker row. Falls back to the number of known
   * children. Set it explicitly when the real total is known before the
   * children are fetched.
   */
  count?: number
  /** Nested sub-attributes. A field with these renders as a branch. */
  fields?: FilterField<V, O>[]
  /**
   * Whether a BRANCH may itself be filtered on.
   *
   * Leaves are always selectable. A branch is not, unless it says so: a picker
   * showing "Name >" alongside "Description" needs Name to be both drillable
   * and, when the consumer allows it, filterable as a whole.
   */
  selectable?: boolean
  disabled?: boolean

  type?: FilterValueType
  options?: FilterOption<O>[]
  /**
   * Async options. Receives the current search text and may page via `cursor`.
   * When both `options` and `loadOptions` are given, `options` seeds the first
   * view and the value-to-label cache while `loadOptions` supplies live results.
   */
  loadOptions?: (
    query: string,
    context: FilterLoadContext
  ) => FilterOption<O>[] | Promise<FilterOption<O>[] | FilterLoadResult<O>>
  /**
   * Resolves stored values whose options the loader has never returned, so a
   * chip restored from a saved view can render "John Doe" rather than the raw
   * id it was persisted with.
   */
  resolveValues?: (
    values: string[]
  ) => FilterOption<O>[] | Promise<FilterOption<O>[]>

  /** Operators for this field. Falls back to the catalog for its `type`. */
  operators?:
    | FilterOperator[]
    | ((field: FilterField<V, O>) => FilterOperator[])
  defaultOperator?: string

  /**
   * Overrides the editor chosen from `type`. Either a registered editor's name
   * or a component. See `FilterEditorProps` for what it receives.
   */
  editor?: FilterEditorRef<V, O>
  /** Overrides how a committed value is drawn in the chip's value segment. */
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  /**
   * The committed value as PLAIN TEXT, for accessible names and titles.
   *
   * The built-in display falls back to `String(value)`, so an object-valued
   * editor (a date token, a custom range) that only supplies `renderValue`
   * announces as "[object Object]" even while the chip DRAWS the right thing.
   * A field whose values do not stringify meaningfully supplies this alongside
   * `renderValue`; it receives the same context and returns the sentence a
   * screen reader should hear.
   */
  valueText?: (context: FilterValueDisplayContext<V, O>) => string

  /** Placeholder for the value editor's input. */
  placeholder?: string
  /**
   * Whether an option-backed editor SHOWS its search box.
   *
   * Defaults to true. Turn it off for a short, closed list where a search input
   * is more chrome than the four options underneath it. The field is still
   * rendered, visually hidden: it is the element that owns focus and
   * `aria-activedescendant` for the list, so removing it would take the whole
   * keyboard with it. Typing still narrows the list, exactly as typing into a
   * native `<select>` does.
   */
  searchable?: boolean
  /**
   * Whether an option-backed editor STACKS the picks at the top of its list.
   *
   * Off by default. The rows then stay exactly where the schema declared them,
   * ticked or not, which is what a short closed list wants: a four row status
   * menu is read as a whole, the check marks already say what is chosen, and
   * lifting a row out of a sequence the reader has memorised costs more than
   * the reordering buys.
   *
   * Turn it on for the lists where the fold is a real problem - a 120 country
   * select, a directory paged over the wire, a tag cloud - so what is already
   * chosen is visible without scrolling for it. The picks are lifted into
   * their own group above the rest with a full-bleed rule between the two, and
   * the partition is taken LIVE unless `sortSelected: "snapshot"` freezes it.
   *
   * The price of live is that ticking a row moves every row it passes, so a
   * pointer that has not moved is over a different one afterwards. That is
   * paid for rather than ignored (the highlight is carried across the reorder
   * by VALUE, and nothing scrolls), but it is the reason this is opt-in: a
   * list short enough to take in at a glance should not move at all.
   *
   * Exclusive options never join the stack. They are grouped by ROLE, so a row
   * whose job is to be visibly not one of the values keeps its place at the
   * bottom whether it is ticked or not.
   */
  pinSelected?: boolean
  /**
   * How an option list is ordered, and - under `pinSelected` - when the
   * partition is taken.
   *
   * With `pinSelected` on, the built-in select and multi-select partition
   * their rows into SELECTED then unselected, with a rule between them, so a
   * long list never hides what is already chosen below the fold. This decides
   * the order INSIDE each of those two groups. With `pinSelected` off there is
   * only one group, and this decides the order of the list as a whole.
   *
   * - `"none"` (default) keeps the order the schema declares inside each group.
   * - `"label"` sorts alphabetically inside each group.
   * - `"snapshot"` keeps declaration order AND freezes the partition as it was
   *   when the menu opened. It is about the partition only, so on a field
   *   without `pinSelected` it is the same thing as `"none"`.
   *
   * The default is deliberately not alphabetical. Option order is usually
   * semantic - a status list reads To do, In progress, In review, Done and a
   * priority list reads Low through Critical - and sorting either scrambles the
   * one thing that made it scannable. Reach for `"label"` on a list whose order
   * carries no meaning and whose length makes it hard to find a name: a country
   * list, a tag cloud, a directory.
   *
   * Locale aware (`localeCompare`) rather than a raw code point sort, so
   * "Ålesund" files next to "Alesund" rather than after "Zurich".
   *
   * Under `pinSelected`, `"none"` and `"label"` both re-pin LIVE: tick a row
   * and it joins the pinned group immediately, because "your picks, then the
   * rest" is a claim about the current selection rather than about the moment
   * the menu opened. The price is that rows below the one just ticked shift
   * down by one, so a pointer that has not moved is now over a different row.
   * `"snapshot"` buys that back for a list where a steady pointer target
   * matters more than a truthful order, and gives up nothing else: the check
   * marks are live either way.
   */
  sortSelected?: "none" | "label" | "snapshot"
  /**
   * This field's own validity check, run after the built-in ones pass.
   *
   * Return a MESSAGE to mark the value cell invalid, or `null` / `undefined` /
   * `false` when the value is fine. A string rather than a schema object is
   * what keeps the primitive library-agnostic: zod, yup, valibot and a
   * hand-rolled `if` all reduce to the same one-liner, and nothing in here ever
   * sees a schema.
   *
   *   validate: ({ value }) =>
   *     schema.safeParse(value).error?.issues[0]?.message ?? null
   *
   * ORDER MATTERS. The primitive's own checks run first and this only runs when
   * they pass, so a validator never has to re-answer "is there a value at all"
   * and two messages can never stack on one cell. It is not called for an
   * operator that takes no value, nor for a rule whose field the schema no
   * longer has.
   *
   * WHEN IT IS SHOWN is a separate question from whether it fails: a message is
   * drawn once the user has committed a value to that rule, never on a row they
   * have not touched, and re-picking the attribute resets it.
   */
  validate?: (context: FilterValidateContext<V, O>) => string | null | undefined | false
  /**
   * Reaches the value editor's PANEL, which is where its width and the option
   * list's height cap both live.
   *
   * The built-in menus default to a narrow panel, so this is the prop that
   * widens one holding long labels (`className: "w-72"`). It is merged last
   * through tailwind-merge, so a `w-*` here beats the default rather than
   * losing to it on source order, and anything that is not a conflict (a
   * border, a shadow) simply adds.
   *
   * HEIGHT IS A VARIABLE, NOT A UTILITY. A `max-h-*` written here bounds the
   * PANEL and does nothing to the list inside it, which owns its own
   * `max-height`. The channel is the custom property the panel publishes -
   * write `--cascader-max-height: 28rem` as an arbitrary property and it
   * inherits down to the element that actually scrolls. The cap is the SMALLER
   * of that and the space the popup has, so a value taller than the viewport
   * leaves it is not the binding term.
   */
  className?: string

  /**
   * The column this field maps to when the storage name differs from the UI
   * path. Carried through untouched; the primitive never reads it.
   */
  column?: string
  /** Arbitrary payload, carried through every render callback. */
  data?: unknown
}

/* -------------------------------------------------------------------------- */
/*                                   Editors                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where an editor is being rendered.
 *
 * The SAME editor component renders in both, which is the whole point. In the
 * old primitive the create-mode picker (`FilterSubmenuContent`) and the
 * amend-mode picker (`SelectOptionsPopover`) were two ~300 line implementations
 * of one control, and they had already drifted apart: different keyboard
 * handlers, different `maxSelections` behaviour, different focus handling.
 *
 * An editor may branch on this to adjust its chrome (a create-mode editor sits
 * in the wizard panel and gets a Back affordance from the host; an amend-mode
 * editor sits in a popover anchored to the chip and gets Apply and Discard),
 * but the control itself is shared.
 */
export type FilterEditorHost = "create" | "amend"

/** The async/searchable option service the primitive hands to every editor. */
export interface FilterOptionsState<O = unknown> {
  items: FilterOption<O>[]
  loading: boolean
  error: boolean
  hasMore: boolean
  /** Current search text. Debounced before it reaches `loadOptions`. */
  query: string
  setQuery: (query: string) => void
  loadMore: () => void
  retry: () => void
  /** Resolves a stored value to its option, from cache when possible. */
  resolve: (value: string) => FilterOption<O> | undefined
}

/** Second argument to an editor's `commit`. */
export interface FilterCommitOptions {
  /** Dismiss the host after writing. Defaults to true. */
  close?: boolean
}

export interface FilterEditorProps<V = unknown, O = unknown> {
  field: FilterField<V, O>
  operator: FilterOperator
  /**
   * The DRAFT value, not the committed one.
   *
   * An editor never writes into the query. It edits a draft the host holds and
   * the host commits, which is what keeps a text filter from dispatching once
   * per keystroke through a fully controlled parent.
   */
  value: V | undefined
  onValueChange: (value: V | undefined) => void
  host: FilterEditorHost
  /**
   * Spread onto whichever element should take focus when the editor opens.
   * Carries the ref and `autoFocus` the host needs, so an editor never reaches
   * for `setTimeout` to focus itself the way the old primitive did.
   *
   * The ref is a CALLBACK ref typed at `HTMLElement`, which is the one ref
   * shape assignable to every element's own ref prop: a callback's parameter is
   * contravariant, so `{...autoFocusProps}` lands on an `<input>`, a slider or
   * a button without a cast. The earlier `React.Ref<never>` forced an
   * `as object` at every spread site, the built-in editors included.
   */
  autoFocusProps: {
    ref: React.RefCallback<HTMLElement>
    autoFocus: boolean
  }
  /**
   * Accept the draft. Advances the wizard, or closes the popover.
   *
   * `{ close: false }` writes the value through without dismissing, which is
   * what makes a multi-select's several picks ONE gesture: every toggle is a
   * real commit the chip redraws from, and the list the user is working in
   * stays where it was. Additive, so an editor that commits once and is done
   * keeps calling `commit(value)` and needs to know nothing about it.
   */
  commit: (value?: V, options?: FilterCommitOptions) => void
  /** Discard the draft and close. */
  cancel: () => void
  /** Step back. Only meaningful when `host === "create"`. */
  back: () => void
  options: FilterOptionsState<O>
  labels: FilterLabels
}

export type FilterEditor<V = unknown, O = unknown> = React.ComponentType<
  FilterEditorProps<V, O>
>

/**
 * An editor with its generics erased, for storage in the registry.
 *
 * `unknown` rather than `never`: props are contravariant, so a registry of
 * `FilterEditor<never, never>` accepts nothing at all, while a generic editor
 * written `<V, O>(props: FilterEditorProps<V, O>)` instantiates cleanly at
 * `unknown` with no cast. The single widening cast then happens once, where the
 * editor is rendered.
 *
 * It lives here rather than beside the built-in editors so the context can name
 * it without importing the composition tier, which would drag Base UI and the
 * shadcn parts into files that must stay pure.
 */
export type AnyFilterEditor = React.ComponentType<
  FilterEditorProps<unknown, unknown>
>

export type FilterEditorRegistry = Record<string, AnyFilterEditor>

/**
 * A registered editor's name, or a component.
 *
 * The third arm is what lets a CONCRETE editor sit on an unknown-typed field
 * without a cast: `FilterField[]` erases `V` to `unknown`, and props are
 * contravariant, so `FilterEditor<DateValue>` is not assignable to
 * `FilterEditor<unknown>` and every shipped example needed `as never` to say
 * something perfectly type-safe. `FilterEditor<any, any>` accepts any editor
 * whose props ARE `FilterEditorProps` while still rejecting components of some
 * other shape; the single widening happens once, inside `resolveFilterEditor`.
 */
export type FilterEditorRef<V = unknown, O = unknown> =
  | string
  | FilterEditor<V, O>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FilterEditor<any, any>

/**
 * Context handed to a custom advanced-builder empty state.
 *
 * Carries what a replacement would otherwise have to reach back into the
 * primitive for. `labels` follows the same rule as every other render context
 * here: a callback never has to call `useFilterActions` to read copy it is
 * about to draw.
 *
 * `addFilter` and `addGroup` are the SAME actions the footer's two buttons
 * call, focus handoff included, so an empty state that offers its own call to
 * action puts the user in exactly the place the footer would have. That is the
 * whole reason they are here rather than left to `actions.addRule`: the handoff
 * (open the attribute picker on the row just created) is the interesting half
 * and it is not reconstructible from outside.
 */
export interface FilterEmptyStateContext {
  labels: FilterLabels
  /** The bar is locked. A custom state should not offer an action here. */
  readOnly: boolean
  /** Which box the builder is in, for a state that wants to be denser inline. */
  mode: "popover" | "inline"
  /** Appends a condition and opens its attribute picker. */
  addFilter: () => void
  /** Appends an empty group. */
  addGroup: () => void
}

/** Context handed to `renderValue` and to the default value display. */
export interface FilterValueDisplayContext<V = unknown, O = unknown> {
  value: V | undefined
  /**
   * `value` normalised to an array, the same way `FilterCondition.values` is.
   *
   * A display callback nearly always wants to count or join, and re-deriving
   * "is this one value or several" at every call site is exactly the kind of
   * per-consumer drift this rewrite removes.
   */
  values: unknown[]
  field: FilterField<V, O>
  operator: FilterOperator
  /** Options already resolved for `value`, when the field is option-backed. */
  options: FilterOption<O>[]
  labels: FilterLabels
}

/* -------------------------------------------------------------------------- */
/*                                   Index                                    */
/* -------------------------------------------------------------------------- */

/**
 * Normalized view of the field schema, built once per schema SIGNATURE.
 *
 * Signature rather than identity on purpose. Every one of the 26 block call
 * sites and every example declares its fields as an inline array literal, so a
 * memo keyed on `fields` identity never once hit in the old primitive: it
 * re-flattened the whole schema on every parent render, and the value-to-label
 * cache keyed on the field object never hit either, so async chips lost their
 * labels and re-resolved. See `buildFilterIndex`.
 */
export interface FilterIndex<V = unknown, O = unknown> {
  /** Every field by its joined path, `"name.first"`. */
  byPath: Map<string, FilterField<V, O>>
  /** Child fields by parent path. Root fields are keyed by `FILTER_ROOT_KEY`. */
  childrenOf: Map<string, FilterField<V, O>[]>
  /** Parent path by path. Empty string for a root field. */
  parentOf: Map<string, string>
  /**
   * Every field in stable, depth-first order. Read by `searchFilterDeep` (a
   * helper for consumer-built pickers; the shipped picker delegates deep search
   * to the cascader) and by the advanced builder's first-pickable-field seed.
   */
  all: { field: FilterField<V, O>; path: string[] }[]
  /** Top level fields, in input order. */
  roots: FilterField<V, O>[]
  /**
   * Content hash of the schema. Two structurally equal schemas share one, which
   * is what lets a rebuild return the PREVIOUS index object.
   */
  signature: string
}

/* -------------------------------------------------------------------------- */
/*                                    Draft                                   */
/* -------------------------------------------------------------------------- */

/** Which panel the builder is showing. */
export type FilterDraftStep = "field" | "operator" | "value"

/**
 * The in-flight filter being created or amended.
 *
 * `cascaderPath` is kept SEPARATE from `path` on purpose. `path` is what the
 * user chose; `cascaderPath` is where they were browsing when they chose it.
 * Pressing Back from the operator step has to return to the level the user came
 * from, and deriving that from `path` is a guess that breaks the moment a deep
 * search jumps across the tree. Retaining it is the only rigorous answer.
 */
export interface FilterDraft<V = unknown> {
  step: FilterDraftStep
  /**
   * `"ready"` means the draft is complete and the host should write it into the
   * query and close.
   *
   * It exists so that "an `arity: none` operator skips the value step" is a fact
   * the pure reducer decides and a table test can assert, rather than a branch
   * buried in a click handler. Without it the host would have to re-derive arity
   * at the call site, which is where the old primitive kept that kind of logic
   * and why it drifted between its two copies.
   */
  status: "editing" | "ready"
  /** Set when amending an existing rule, null when creating a new one. */
  ruleId: string | null
  /** The chosen field path. Empty until the field step commits. */
  path: string[]
  /** Where the cascader is browsing. Not necessarily the parent of `path`. */
  cascaderPath: string[]
  operator: string | null
  value: V | undefined
  /** Search text for the current step's panel. */
  query: string
}

/* -------------------------------------------------------------------------- */
/*                                   Labels                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every user facing string, so the primitive ships no hardcoded copy.
 *
 * The old primitive's i18n object had roughly twenty keys of which half were
 * never read: `min`, `max`, `to`, `true`, `false`, `percent`,
 * `defaultCurrency`, `typeAndPressEnter` and others each appeared exactly
 * twice, in the interface and in the default, with zero read sites. They were
 * fossils of a richer design that was never built. Every key below is read by
 * the shipped chrome, with one named exception: `stepAnnouncement` exists for
 * a consumer-composed create wizard (the shipped flow commits on field
 * selection and announces counts instead), and it is documented as exactly
 * that rather than passed off as chrome copy.
 */
export interface FilterLabels {
  /** The Add filter trigger on the chip row. */
  addFilter: string
  /**
   * Title of the advanced builder, and the accessible name of both its trigger
   * and its panel.
   */
  advancedFilter: string
  /** The line above the builder's rows, "In this view, show records". */
  showRecords: string
  /**
   * The advanced builder's own empty state, shown when the query has no
   * conditions at all.
   *
   * Two keys rather than one because they say different things and only one of
   * them is always true. The TITLE states the fact - there is nothing here -
   * and is shown to everyone. The HINT tells you what to do about it, so it is
   * withheld from a read-only bar, where the two buttons it points at are
   * disabled and the sentence would be an instruction nobody can follow.
   */
  builderEmpty: string
  builderEmptyHint: string
  /** Appends a condition to the root group, from the builder's footer. */
  addCondition: string
  /** Appends an empty nested group to the root group. */
  addConditionGroup: string
  /**
   * Accessible name of a group footer's own add button.
   *
   * Distinct from `addCondition`, which appends to the ROOT. This one is the
   * only way to put a condition inside a nested group without dragging, so it
   * is what keeps groups usable from the keyboard.
   *
   * It is also the LONG form of a short visible label, which is the way round
   * WCAG's Label in Name asks for: the button shows `addCondition` and is
   * named this, so the name contains the label.
   */
  addToGroup: string
  /** Removes a whole group, from that group's own menu. */
  removeGroup: string
  /** Nests one existing condition in a new group. From a row's menu. */
  wrapInGroup: string
  /**
   * Dissolves a group into its parent, keeping its conditions. The group
   * header's own button, and the inverse of `wrapInGroup`.
   */
  ungroup: string
  /**
   * Moves an existing condition to the root group. From a row's menu, which is
   * the keyboard path to the cross-group move a pointer performs by dragging.
   */
  moveToTopLevel: string
  /**
   * Moves an existing condition into an existing group. Groups have no names
   * of their own, so they are numbered in document order, one-based.
   */
  moveToGroup: (position: number) => string
  /** Accessible name of a row's or a group's drag handle. */
  reorder: string
  /**
   * Description on the drag handle, teaching the Alt+Arrow keyboard model.
   * Without it the handle is a button whose activation does nothing and whose
   * keyboard exists only for those who already know it.
   */
  reorderHint: string
  /** A group header, when its combinator is `and`. */
  groupAll: string
  /** A group header, when its combinator is `or`. */
  groupAny: string
  /** Shown inside a group holding nothing yet. */
  groupPlaceholder: string
  /**
   * Accessible name of one builder row. Receives the condition and its depth.
   *
   * The depth is in the name because indentation is the ONLY thing that says a
   * row is inside a group, and indentation is invisible to a screen reader.
   */
  rowLabel: (condition: string, depth: number) => string
  /** Accessible name of a group. Receives its header sentence and its depth. */
  groupLabel: (description: string, depth: number) => string
  /** Announced when a group is added or removed. */
  groupAnnouncement: (added: boolean) => string
  /**
   * Announced after a condition or a group is reordered. One-based position.
   *
   * Reordering is the only edit with nothing else to speak for it: the query
   * keeps its shape and its count, focus stays on the handle that moved, and
   * the row's own name says what it filters rather than where it sits. Without
   * this, Alt+Arrow moves a row in silence. The total is in the message because
   * "moved to position 3" cannot tell a user whether they have reached the end.
   */
  reorderAnnouncement: (
    label: string,
    position: number,
    total: number
  ) => string
  /**
   * Announced when a move changed the node's PARENT rather than its order.
   *
   * A separate sentence because the two outcomes were indistinguishable and one
   * of them is a structural change: dragging a top-level row into a group said
   * "Status moved to position 3 of 3", which is byte for byte what a plain
   * reorder inside that group says. Nothing told the user the condition was now
   * nested, or what it was nested in - and the whole point of the destination
   * chrome the drag layer paints is to answer exactly that.
   *
   * `destination` is the group's own headline, the same sentence its accessible
   * name uses, or the bar's label when the node has landed at the top level.
   */
  moveAnnouncement: (
    label: string,
    destination: string,
    position: number,
    total: number
  ) => string
  /** Empties the whole query, from the advanced builder's footer. */
  clearAll: string
  /**
   * Accessible name of a nested group's own menu.
   *
   * A SECOND name beside `chipMenu`, which names a menu acting on ONE rule,
   * because a group is neither one rule nor the whole query: its menu acts on
   * that group and the subtree under it. Two kebabs in one row answering to
   * one name are two buttons a screen reader cannot tell apart.
   *
   * THREE KEYS WENT when the builder's header strip did, and they went rather
   * than being left standing: `queryMenu` named that strip's kebab, and
   * `matchAll` and `matchAny` were the two rows inside it. The strip carried a
   * count the rows already show and a menu whose every action has another
   * route - the root combinator is the second row's own and/or toggle, and
   * Clear all is a footer button - so nothing reads them any more. A key no
   * chrome reads is a key a translator fills in for nothing, which is the
   * lesson the paragraph above this interface already records.
   */
  groupMenu: string
  /** Placeholder for the field step's search input. */
  searchFields: string
  /** Placeholder for the operator step's search input. */
  searchOperators: string
  /** Placeholder for an option editor's search input. */
  searchOptions: string
  back: string
  clear: string
  apply: string
  discard: string
  empty: string
  loading: string
  loadingMore: string
  loadMore: string
  error: string
  retry: string
  /** Leading word before the first chip, where a combinator would otherwise go. */
  where: string
  and: string
  or: string
  /** Accessible name of the combinator toggle between two chips. */
  combinator: string
  /**
   * The same toggle in the BUILDER, where the word is on screen beside it.
   *
   * Receives the word it currently shows. The builder's combinator column is a
   * fixed track, so a locale whose word does not fit truncates - measured, the
   * English "and" wants 58.72px of a 64px track and a longer translation will
   * not - and a name of "Change combinator" alone leaves a pointer user with
   * "a..." and no way to find out which of the two it says.
   */
  combinatorLabel: (word: string) => string
  duplicate: string
  negate: string
  /**
   * The chip kebab's optional route into the advanced builder.
   *
   * Drawn only when the root was given `onConvertToAdvanced` AND the bar is
   * still `variant="basic"`, so a translator filling this in is filling in a
   * row that a consumer has to opt into rather than one that always shows.
   */
  convertToAdvanced: string
  remove: string
  /**
   * Accessible name of a chip's menu button. Receives the field's label.
   *
   * The advanced builder's row menu reads the same key rather than declaring
   * its own: it opens the same three actions on the same rule, so two strings
   * would be two ways to say one thing and one more pair to keep in step.
   */
  chipMenu: (fieldLabel: string) => string
  /** Accessible name of the chip row. */
  filtersLabel: string
  /** Accessible name of a chip. Receives the rendered condition. */
  filterLabel: (condition: string) => string
  /**
   * How the bar says it is READ ONLY rather than off.
   *
   * Prose rather than an ARIA state, and that is forced: `aria-readonly` is not
   * an allowed attribute on `role="toolbar"`, `role="group"` or `role="button"`,
   * which between them is every element this primitive would put it on. The chip
   * row carries this string as the toolbar's `aria-description`; the advanced
   * builder draws it as a visible line, because every control in that panel is
   * dimmed and something has to say why.
   */
  readOnly: string
  /**
   * Separator between ancestors in a nested field path, "Name > First".
   *
   * TEXT only. On screen the separator is a chevron icon, which is decoration
   * and carries no name; this string is what `formatFilterPath` joins for the
   * chip's accessible name, its `title`, and the advanced builder's truncated
   * attribute cell. Overriding it retargets the spoken form, not the glyph.
   */
  pathSeparator: string
  /** Placeholder in a chip's value segment when no value is set yet. */
  valuePlaceholder: string
  /**
   * The empty word for an OPTION-backed value, where "enter text..." is a lie:
   * a select is picked from, not typed into.
   *
   * Separate from `FilterField.placeholder`, which on an option field is the
   * SEARCH box's prompt ("Search countries...") and reads as nonsense standing
   * in for a value.
   */
  selectPlaceholder: string
  /**
   * Spoken in place of the value in a chip's accessible NAME when the value is
   * still empty. The visible segment shows the editor's placeholder, but
   * "Description contains enter text..." is not a name; "Description contains
   * no value" is.
   */
  noValue: string
  /** Shown in the operator segment before a condition has been chosen. */
  selectCondition: string
  /**
   * Appended to the accessible name of a chip that still has no condition.
   *
   * The dashed outline says the same thing to everyone who can see it, and a
   * rule with no operator filters nothing, so a screen reader has to be told
   * the chip is unfinished rather than left to infer it from "Select
   * condition".
   */
  incomplete: string
  /** Appended to a branch row's accessible name in the field picker. */
  branchAffordance: string
  /**
   * Appended to the accessible name of an exclusive option row.
   *
   * `FilterOption.exclusive` argues that the rule drawn above such a row is not
   * decoration, because a list that wipes a selection has to look unlike one
   * that does not. A rule is also a PIXEL: without this a screen reader hears
   * "Unassigned, not selected, 4 of 4" and nothing at all about the four picks
   * the press is about to destroy, which is the same surprise the rule exists
   * to prevent, delivered to the users least able to recover from it.
   *
   * Spoken BEFORE the press, deliberately. `exclusiveAnnouncement` is the
   * receipt; this is the warning, and only one of the two can be acted on.
   */
  exclusiveHint: string
  /**
   * Announced after an exclusive pick clears the other picks, or an ordinary
   * pick clears the exclusive one.
   *
   * The clearing changes nothing the user is on. The row keeps its name, the
   * search box keeps its text, focus never moved, and the check marks that
   * vanished are on rows nobody is reading - so without this a destructive
   * change to several other rows happens in complete silence. The bar's
   * `role="status"` region is the one surface that can say it did.
   */
  exclusiveAnnouncement: (label: string, cleared: number) => string
  /** Trailing count on a branch row. */
  itemCount: (count: number) => string
  /** Names the field picker's root level and its panel. */
  fieldsLabel: string
  /** Live-region text after a query narrows an option list or the picker. */
  resultsAnnouncement: (count: number) => string
  /** Accessible name of an option menu's footer (Load more, Retry). */
  actionsLabel: string
  /**
   * Announced when the panel moves to a new step. For a CONSUMER-composed
   * create wizard: the shipped flow commits on field selection and announces
   * counts instead, so this is headless surface rather than chrome copy.
   */
  stepAnnouncement: (step: FilterDraftStep, label: string) => string
  /** Announced after a filter is added or removed. */
  countAnnouncement: (count: number) => string
  /** Rendered by the default value display for a multi-value rule. */
  valueCount: (count: number) => string
  /**
   * Spells the list out behind the count above.
   *
   * `valueCount` is a SUMMARY, and a summary is the one thing in the bar whose
   * meaning cannot be recovered from it: "3 selected" names none of the three.
   * On screen a segment has room for a count and nothing else, so the summary
   * stays, and this is where the three go - the value control's `title`, and
   * its accessible name while the bar refuses to open the editor that would
   * otherwise have shown them.
   *
   * Takes the summary as well as the list, so the composed string still CONTAINS
   * the visible text ("2 selected: Active, Archived"). A name that dropped it
   * would be a name that disagrees with the label under the pointer.
   */
  valueDetail: (summary: string, values: string[]) => string
  /** Rendered by the default value display for a range. */
  valueRange: (from: string, to: string) => string
  /** Accessible name of the range editor's lower bound. */
  rangeFrom: (fieldLabel: string) => string
  /** Accessible name of the range editor's upper bound. */
  rangeTo: (fieldLabel: string) => string
  /** The word drawn between the range editor's two inputs. */
  rangeSeparator: string
  /** Rendered for a `negated` rule, wrapping the operator label. */
  negated: (operatorLabel: string) => string
  /**
   * The six validation sentences, one per `FilterIssueReason` plus the panel's
   * summary.
   *
   * Each is used three times over for one issue - as the offending cell's
   * `title`, as its `aria-description`, and behind the panel's summary - so they
   * are written as guidance ("Choose a condition") rather than as a diagnosis
   * ("Operator missing"): the person reading them is being told what to do next,
   * not what the data model thinks.
   */
  issueOperator: string
  issueValue: string
  issueRange: string
  issueRangeOrder: string
  issueEmptyGroup: string
  /**
   * The panel-level roll-up, and the accessible name of the button that jumps
   * to the first offending cell. Receives the number of issues.
   */
  issueSummary: (count: number) => string
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

/**
 * Why one node cannot be run as written.
 *
 * Five reasons, and each one is a way the builder can hold a condition that
 * SILENTLY does the wrong thing rather than an error a compiler would catch.
 * `collectFilterIssues` in `filters-query` is what produces them, and it carries
 * the full reasoning for each.
 */
export type FilterIssueReason =
  | "missing-operator"
  | "missing-value"
  | "incomplete-range"
  | "reversed-range"
  | "empty-group"
  /**
   * A field's own `validate` said no.
   *
   * The one reason whose sentence does NOT come from `FilterLabels`: the
   * message is whatever the consumer's validator returned, carried on the issue
   * itself. That keeps `filterIssueLabel`'s "one lookup per reason" shape
   * intact for the five the primitive owns, while letting a product say
   * something specific about its own data.
   */
  | "custom"

export interface FilterIssue {
  /** The rule or group the issue belongs to. */
  nodeId: string
  /**
   * WHICH control to mark, so the chrome never has to re-derive it.
   *
   * A reason and a cell are not the same question: `missing-value` and
   * `incomplete-range` are two reasons that both land on the value cell, and
   * `empty-group` lands on no cell at all - `"group"` is the group's own card,
   * whose headline is what the panel's summary moves focus to.
   */
  column: "operator" | "value" | "group"
  reason: FilterIssueReason
  /**
   * The sentence to show, when the issue carries its own.
   *
   * Set only for `reason: "custom"`. Everything else looks its wording up in
   * `FilterLabels`, so a translated build says the right thing without the
   * primitive ever holding a string.
   */
  message?: string
}

/**
 * What a field's own `validate` is handed.
 *
 * Mirrors `FilterValueDisplayContext` on purpose - same normalisation, same
 * `labels`, same "pre-derive what every caller would otherwise re-derive"
 * rule - because a validator and a display callback are asking about the same
 * value and should not need two mental models.
 *
 * SYNCHRONOUS, and deliberately. Issues are collected in a pure pass inside a
 * memo, so a promise here would need a whole second machinery (pending states,
 * races between keystrokes, a stale-result guard) for a check that is nearly
 * always a regex or a comparison. Validation that has to hit a server belongs
 * in the consumer's own submit path, where it can show a real pending state.
 */
export interface FilterValidateContext<V = unknown, O = unknown> {
  value: V | undefined
  /** `value` normalised to an array, exactly as the display context does it. */
  values: unknown[]
  field: FilterField<V, O>
  operator: FilterOperator
  /** How many values this operator takes, already resolved. */
  arity: FilterOperatorArity
  /** The whole rule, for a check that needs `negated` or the path. */
  rule: FilterRule<V>
  labels: FilterLabels
}