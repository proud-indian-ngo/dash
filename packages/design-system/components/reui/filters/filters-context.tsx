// @ts-nocheck
"use client"

import * as React from "react"
import type {
  FilterCombinator,
  FilterEditorRegistry,
  FilterDraft,
  FilterDraftStep,
  FilterEditor,
  FilterField,
  FilterIndex,
  FilterLabels,
  FilterOperator,
  FilterOption,
  FilterQuery,
  FilterRule,
  FilterEmptyStateContext,
  FilterValueDisplayContext,
  FilterValueType,
} from "@pi-dash/design-system/components/reui/filters/filters-types"
import type { FilterDraftAction } from "@pi-dash/design-system/components/reui/filters/filters-draft"
import type { FilterPathCollapse } from "@pi-dash/design-system/components/reui/filters/filters-lib"

/**
 * Filters publishes its internals through FOUR channels, for the same reason
 * the cascader does: they change at wildly different rates, and a chip must not
 * re-render at the rate of the fastest one.
 *
 * | Channel | Republishes when | Consumed by |
 * | :-- | :-- | :-- |
 * | actions | the schema signature, labels or a config prop changes | every part, chips included |
 * | state | every query edit and every draft keystroke | the bar, the builder panel |
 * | render | the `renderValue` / `renderChip` identities change | chips |
 * | focus | every arrow key across the chip row | the focused chip and its neighbour |
 *
 * The old primitive had one context carrying `variant`, `size`, `radius`, the
 * i18n object and three flags, and then passed everything else down as props
 * from a single 526 line component that re-rendered on every keystroke. Every
 * chip's inline closures were rebuilt each time, so `React.memo` would have
 * bought nothing even if it had been applied.
 */

/* -------------------------------------------------------------------------- */
/*                                   Actions                                  */
/* -------------------------------------------------------------------------- */

/**
 * Stable for the life of the component, bar a config change.
 *
 * Every mutator below reads a latest-props ref written in an effect, exactly as
 * `cascader.tsx` does, rather than closing over the state it needs, so nothing
 * here is rebuilt by a keystroke or a query change and a memoized chip never
 * re-renders because a handler was recreated. It republishes only when the
 * schema or a config prop genuinely changes - which includes the two lock flags
 * below, and has to: a refusal that lives only in the ref is a refusal that
 * arrives one commit late. The two resolvers are the other deliberate
 * exception: they are read DURING render, so they memoize on the values they
 * read.
 *
 * Every mutator is also the MUTATION BOUNDARY. `disabled` and `readOnly` are
 * enforced here, not at the call sites that draw the buttons, so a keyboard
 * route, a consumer-composed chrome or a call site added next month is refused
 * by construction rather than by remembering. See `isFilterLocked`.
 */
export interface FilterActionsContextValue<V = unknown, O = unknown> {
  /** Normalized schema. Also on the state context, from the same memo. */
  index: FilterIndex<V, O>
  labels: FilterLabels
  operatorCatalog: Record<FilterValueType, FilterOperator[]>
  editors: FilterEditorRegistry
  size: "sm" | "default"
  /**
   * The bar is off: nothing is operable and the controls leave the tab order.
   */
  disabled: boolean
  /**
   * The query can be read and navigated but not changed.
   *
   * Every mutator below returns without writing while this is set, and so does
   * every mutator while `disabled` is set - see `isFilterLocked`. The flag is
   * published here rather than only consumed inside the chrome because a
   * consumer-composed chip or panel needs the same answer to draw itself with.
   */
  readOnly: boolean

  /**
   * Which chrome is drawing, published so a MENU can ask.
   *
   * The chip kebab's "Convert to advanced filter" row is the only reader, and
   * it needs the answer at render time: an already-advanced bar must not offer
   * to become advanced, and the chip that draws the row has no other route to
   * the root's `variant`.
   */
  variant: "basic" | "advanced"

  /**
   * Consumer classes for the menus and for the field picker.
   *
   * Both are `undefined` unless the root was given them, and both are merged
   * AFTER the primitive's own default, so a `w-*` from a consumer beats the
   * default through tailwind-merge rather than losing to it on source order.
   *
   * Published on the context rather than taken as a prop by each chrome for the
   * reason `pathCollapse` is: the same menu is mounted by four different
   * components and the same picker by two, and a per-chrome prop means a
   * consumer sets the width in four places and misses the fifth. See
   * `FILTER_MENU_CLASS` and `FILTER_FIELD_PICKER_CLASS` for what is being
   * overridden.
   */
  menuClassName: string | undefined
  fieldPickerClassName: string | undefined

  /**
   * Turns on the chip kebab's "Convert to advanced filter" row.
   *
   * A CALLBACK is the whole prop, with no boolean beside it, because `variant`
   * belongs to the consumer: this primitive cannot switch chromes on its own,
   * so a flag without a handler would draw a row that does nothing, and a
   * handler without a flag would be a second thing to keep in step with the
   * first. Present means offered; absent means the row is not drawn.
   *
   * It changes no query, so it does NOT pass through the mutation boundary -
   * the same reasoning `announce` carries. What it cannot do is more useful
   * than what it can: it is handed no setter, so a consumer's handler has no
   * route to the query at all.
   */
  convertToAdvanced: (() => void) | undefined

  /**
   * How a nested attribute path is shortened, and to how many names.
   *
   * Published here rather than read by each chrome from its own prop, because
   * BOTH chromes draw the same path and the whole point of the setting is that
   * they agree: the chip's path and the builder's attribute cell resolve it
   * through one shared display hook, exactly as the cascader shares one
   * collapser between its trigger and its breadcrumb.
   */
  pathCollapse: FilterPathCollapse
  maxPathSegments: number

  /** Operators for a field, memoized on the catalog and the schema. */
  resolveOperators: (field: FilterField<V, O>) => FilterOperator[]
  /** The editor a (field, operator) pair should use. */
  resolveEditor: (
    field: FilterField<V, O>,
    operator: FilterOperator | undefined
  ) => FilterEditor<V, O> | undefined
  /**
   * The instance-wide value-to-label store. One per `Filters` root, shared by
   * every `useFilterOptions` instance, so a label the editor's instance fetched
   * is readable by the chip's display instance, and `resolveValues` results
   * land somewhere every host can see.
   */
  resolution: FilterResolutionStore

  /**
   * Appends a rule. Defaults to the ROOT group.
   *
   * The parent is a parameter rather than always the root because a nested
   * group's own add button is the keyboard path into that group, and routing it
   * through the root and a move afterwards would be two edits and two
   * announcements for one action.
   */
  addRule: (rule: FilterRule<V>, parentId?: string) => void
  /**
   * Appends an empty group and returns its id, so the caller can focus it.
   *
   * The id comes back rather than being passed in because the caller almost
   * always wants to move focus onto what it just created, and asking every call
   * site to mint an id first is how two of them end up minting it differently.
   *
   * Returns an EMPTY STRING when the bar is disabled or read only, which is the
   * one mutator that has to report its refusal: every caller moves focus onto
   * the id it gets back, and focusing a group that was never created strands the
   * tab stop. `""` rather than `string | null` keeps the callers that already
   * test the id honest without widening a published signature.
   */
  addGroup: (parentId?: string, combinator?: FilterCombinator) => string
  updateRule: (
    id: string,
    updates: Partial<Omit<FilterRule<V>, "id" | "type">>
  ) => void
  /**
   * Removes a rule OR a group, and prunes the groups that empties.
   *
   * Node-level rather than rule-level because the two chromes need different
   * things from one operation: a chip only ever removes a rule, while a builder
   * row's trash and a group header's trash are the same button on two kinds of
   * node.
   */
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  negateRule: (id: string) => void
  /** Reorders within the node's own parent. Out of range moves are no-ops. */
  moveNode: (id: string, delta: number) => void
  /** Moves a node into another group, at an index. The drag-and-drop half. */
  moveNodeTo: (id: string, parentId: string, index: number) => void
  /**
   * Copies a node into another group, at an index. The Alt-drag half.
   *
   * Separate from `duplicateNode`, which copies a node BESIDE itself and takes
   * no destination. Composing the two would emit two queries for one gesture,
   * and a controlled consumer would see, persist and possibly re-render an
   * intermediate tree that the user never asked for.
   */
  copyNodeTo: (id: string, parentId: string, index: number) => void
  /** Nests one node in a new group. The keyboard half of the same idea. */
  wrapNodeInGroup: (id: string, combinator?: FilterCombinator) => void
  /**
   * Dissolves a group into its parent, keeping its conditions in place. The
   * inverse of `wrapNodeInGroup`, so a wrap can be undone in one gesture
   * rather than by dragging each rule out and deleting the shell by hand.
   */
  unwrapGroup: (groupId: string) => void
  setCombinator: (groupId: string, combinator: FilterCombinator) => void
  toggleCombinator: (groupId: string) => void
  clearQuery: () => void

  openCreate: () => void
  openAmend: (id: string, step: FilterDraftStep) => void
  closeDraft: () => void
  dispatchDraft: (action: FilterDraftAction<V>) => void

  /**
   * Writes the bar's live region, for a change no visible surface reports.
   *
   * The bar owns ONE `role="status"` region and every mutator above already
   * writes it, so this is the same channel opened to the chrome INSIDE the bar:
   * an editor's popover is the one place where something destructive can happen
   * to rows the user is not on, with focus, name and text all unchanged
   * afterwards. The option editor's None rule is the first caller.
   *
   * Not a query write, so it does not pass through `emit` and asks the lock
   * nothing: announcing is what a refusal would have to do too, and a read-only
   * bar never opens an editor to announce from in the first place.
   *
   * Announcing the same sentence twice in a row says it once, because React
   * bails out on an unchanged state. That is the correct behaviour for a status
   * region and it costs nothing here: every message names the option that was
   * picked, and picking the same option twice is the toggle-off case, which
   * clears nothing and announces nothing.
   */
  announce: (message: string) => void

  /** Getters for event handlers, so a handler never closes over stale state. */
  getQuery: () => FilterQuery<V>
  getDraft: () => FilterDraft<V> | null
  /** Fresh id from the SSR-safe factory. */
  nextId: () => string
}

/* -------------------------------------------------------------------------- */
/*                             The mutation lock                              */
/* -------------------------------------------------------------------------- */

/**
 * `disabled` and `readOnly` are NOT two words for one state.
 *
 * A DISABLED control is not operable and leaves the tab order. That is what the
 * native attribute does and what `disabled` means here: the bar is off.
 *
 * A READ-ONLY control stays focusable and readable and refuses only to CHANGE
 * anything. That distinction is the whole reason the flag exists: a read-only
 * filter bar is there so a keyboard or screen reader user can walk the chips
 * and find out what the view is filtered by. Collapsing it into `disabled`
 * deletes exactly the audience it was added for, and it had - measured on the
 * advanced builder, where all thirteen cell controls carried the native
 * attribute while the roving tab stop (`tabindex="0"`) sat on a disabled
 * element, so not one row could be reached from the keyboard at all.
 *
 * So the two flags land in two different places:
 *
 * - `readOnly` blocks MUTATION and preserves NAVIGATION. Every mutating control
 *   keeps its tab stop and wears `aria-disabled` plus `data-readonly`
 *   (`filterReadOnlyProps` below). That is this repo's own convention for
 *   "present, focusable, not operable" - `CascaderAction` had to stop using the
 *   native attribute for the same reason, and the gantt's zoom buttons do the
 *   same - and it is what the ARIA authoring practices ask of a toolbar, whose
 *   unavailable controls stay focusable so they can be discovered.
 * - `disabled` blocks both, through the native attribute, unchanged.
 *
 * `aria-readonly` is deliberately NOT used anywhere. It is not an allowed
 * attribute on `role="button"`, `role="group"` or `role="toolbar"`, which
 * between them is every element this primitive would put it on. Saying it on a
 * CONTROL therefore has to be `aria-disabled`; saying it on the BAR has to be
 * prose, which is `labels.readOnly`.
 *
 * The refusal itself is enforced at NEITHER of those places. It is enforced
 * once, at the action boundary in `filters.tsx`, where all fourteen query
 * writes pass through one `emit`. What is here is the part a user has to be
 * able to see and hear; a guard on nine call sites is a guard the tenth call
 * site does not have.
 */
export function isFilterLocked(state: {
  disabled: boolean
  readOnly: boolean
}): boolean {
  return state.disabled || state.readOnly
}

/**
 * What a MUTATING control wears while the bar is read only.
 *
 * `null` when the bar is disabled, because the native attribute already says
 * everything this would say, and would say it twice as dim: `disabled` wins
 * wherever the two flags meet.
 *
 * A conditional spread rather than explicit `undefined`s, the shape the
 * cascader's commands already use: `aria-disabled="false"` on every enabled
 * control is noise in the accessibility tree, and `data-readonly` is a presence
 * hook.
 */
export function filterReadOnlyProps(state: {
  disabled: boolean
  readOnly: boolean
}) {
  if (state.disabled || !state.readOnly) return null
  return { "aria-disabled": true, "data-readonly": "" } as const
}

/* -------------------------------------------------------------------------- */
/*                               The size ladder                              */
/* -------------------------------------------------------------------------- */

/**
 * The two shadcn button sizes one filters size resolves to.
 *
 * Two rungs and not one, because every control the chrome draws is either a
 * labelled button or an icon-only square, and shadcn ships a separate ladder
 * for each (`sm` / `default` against `icon-sm` / `icon`). Pairing them here is
 * the whole point: the rungs line up per style, so a row's kebab is exactly as
 * tall as the cell beside it at every size.
 */
export interface FilterControlSizes {
  /** Labelled buttons: the row cells, both triggers, the panel footer. */
  button: "sm" | "default"
  /**
   * Icon-only buttons: the kebabs, the trash, the grip, a group's add.
   *
   * Also the CHIP's height, which is not obvious and is the reason the chips
   * used to ignore `size` entirely. A chip is a `ButtonGroup`, which is
   * `items-stretch`, and no style gives `cn-button-group-text` a height - so
   * the three text segments stretch to whatever the ONE child with a definite
   * height is, and that child is the kebab. Sizing the kebab sizes the pill.
   */
  icon: "icon-sm" | "icon"
}

/**
 * ONE ladder, keyed off `size`, for every control the chrome renders.
 *
 * It exists because the alternative had already happened. The advanced builder
 * threaded `actions.size` into five cells and then hardcoded `size="icon-sm"`
 * at seven sites and `size="sm"` at three, so a row's cells and the icon
 * buttons beside them resolved to different rungs and the footer to a third.
 * One row, three heights, none of them agreeing.
 *
 * Two rules follow from this being the only ladder:
 *
 *  - NOTHING here is a pixel. Each value is a shadcn size NAME, resolved per
 *    style by the `cn-button-size-*` classes, because the control-height ladder
 *    is per style (nova 7/8, sera 9/10, mira 6/7, and so on). A hardcoded `h-8`
 *    in this primitive would be the one control in the app that ignores the
 *    style the user picked.
 *  - The GLYPH size rides the same class. `cn-button-size-sm` carries its own
 *    `[&_svg]:size-*` in the styles that want one, so pinning an icon size in
 *    here would fight the style rather than match it.
 *
 * TWO RUNGS, `sm` and `default`. `lg` is gone and `xs` was never here.
 *
 * `lg` went because it had nothing left to be: the bar is a toolbar over a
 * table, so its ceiling is the style's own default control height, and a rung
 * above that made the bar taller than every other control on the page it sits
 * with. A consumer who wants a taller bar picks a taller STYLE, which is the
 * per-style ladder doing its job.
 *
 * `xs` stays out for the reason that used to keep the chips unsized: the chip's
 * height comes from the kebab, and `icon-xs` is a 20-24px square in most styles
 * - smaller than the text beside it needs - so an `xs` bar would be a row of
 * pills whose segments no longer clear their own labels.
 */
const FILTER_CONTROL_SIZES: Record<"sm" | "default", FilterControlSizes> = {
  sm: { button: "sm", icon: "icon-sm" },
  default: { button: "default", icon: "icon" },
}

/**
 * The pair for a bar's size. Takes the actions context, or anything with a
 * `size`, so a consumer-composed chrome sizes its own controls off the same
 * ladder the shipped one uses.
 *
 * The fallback is for JavaScript callers only: a bar handed a size TypeScript
 * would have rejected - `"lg"` from a codebase that has not upgraded is the
 * live case - must still draw buttons rather than throw on `.button`.
 */
export function filterControlSizes(state: {
  size: "sm" | "default"
}): FilterControlSizes {
  return FILTER_CONTROL_SIZES[state.size] ?? FILTER_CONTROL_SIZES.default
}

const FilterActionsContext =
  React.createContext<FilterActionsContextValue | null>(null)

export function useFilterActions<
  V = unknown,
  O = unknown,
>(): FilterActionsContextValue<V, O> {
  const context = React.useContext(FilterActionsContext)
  if (!context) {
    throw new Error("useFilterActions must be used inside <Filters>")
  }
  return context as unknown as FilterActionsContextValue<V, O>
}

/* -------------------------------------------------------------------------- */
/*                                    State                                   */
/* -------------------------------------------------------------------------- */

/**
 * Volatile by construction: typing one character into a value editor
 * republishes it. Subscribe from the bar and the panel, never from a chip that
 * only needs its own rule.
 */
export interface FilterStateContextValue<V = unknown> {
  query: FilterQuery<V>
  draft: FilterDraft<V> | null
  ruleCount: number
  /** Live region text. Empty except immediately after an announced change. */
  announcement: string
  /**
   * How many announcements have been made, so a REPEATED one is still heard.
   *
   * `aria-live` reports a DOM mutation, and React writes nothing when the
   * string it renders equals the one already in the node - so three identical
   * announcements in a row were one mutation and one announcement. The chrome
   * keys the live region's contents on this, which turns "the same sentence
   * again" into a real change without touching the region element itself.
   *
   * A counter rather than a timestamp: it is compared for identity, never read
   * as a value, and a counter is stable across a rerender that a clock is not.
   */
  announcementSeq: number
}

const FilterStateContext = React.createContext<FilterStateContextValue | null>(
  null
)

export function useFilterState<V = unknown>(): FilterStateContextValue<V> {
  const context = React.useContext(FilterStateContext)
  if (!context) {
    throw new Error("useFilterState must be used inside <Filters>")
  }
  return context as unknown as FilterStateContextValue<V>
}

/* -------------------------------------------------------------------------- */
/*                                   Render                                   */
/* -------------------------------------------------------------------------- */

/**
 * Consumer render overrides, on their own channel.
 *
 * They must be always-current closures (a `renderValue` that captured last
 * render's props would draw stale text), yet they change identity on every
 * parent render when written inline. Isolating them means that churn re-renders
 * only what actually calls them.
 */
export interface FilterRenderContextValue<V = unknown, O = unknown> {
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode
  renderEmpty?: (context: FilterEmptyStateContext) => React.ReactNode
}

const FilterRenderContext = React.createContext<FilterRenderContextValue>({})

export function useFilterRender<
  V = unknown,
  O = unknown,
>(): FilterRenderContextValue<V, O> {
  return React.useContext(FilterRenderContext) as FilterRenderContextValue<V, O>
}

/* -------------------------------------------------------------------------- */
/*                                 Focus store                                */
/* -------------------------------------------------------------------------- */

/** Which chip currently owns the row's single tab stop. */
export interface FilterFocus {
  /** Rule id of the focused chip, or null when the row is not focused. */
  id: string | null
  /**
   * Which cell inside that row, for restoring focus after an edit.
   *
   * A chip draws only `field`, `operator`, `value` and `menu`. The rest exist
   * only in the advanced builder, where a row is a set of cells rather than one
   * tab stop, and a GROUP header is a row too: its `field` cell is the
   * combinator sentence and it has an `add` cell the rule rows do not.
   *
   * One union rather than two because the chromes share the store: whichever is
   * mounted, focus after an edit has to come back where it left.
   */
  segment:
    | "combinator"
    | "field"
    | "operator"
    | "value"
    | "add"
    | "menu"
    | "ungroup"
    | "remove"
    | "drag"
    | null
  /**
   * Open that segment's popover, not merely focus it.
   *
   * Picking a field commits the rule straight away and the chip appears with no
   * condition yet, so the operator menu has to open ON THE CHIP without a
   * second click. This is the signal that carries that intent from the root to
   * the chip that was just created.
   */
  autoOpen: boolean
}

/**
 * An external store, deliberately NOT React state.
 *
 * A roving tabindex re-publishes on every arrow key. Through `setState` that
 * re-renders the whole bar, and with it every chip, to move one outline. A
 * store lets the two chips that actually change subscribe, so arrowing across
 * forty chips re-renders two components rather than forty-one.
 */
export interface FilterFocusStore {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => FilterFocus
  /** No-ops when nothing changed. */
  set: (next: FilterFocus) => void
}

const NO_FOCUS: FilterFocus = { id: null, segment: null, autoOpen: false }

export function createFilterFocusStore(): FilterFocusStore {
  let snapshot: FilterFocus = NO_FOCUS
  const listeners = new Set<() => void>()

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    // The SAME object until something actually changes, which is what
    // `useSyncExternalStore` requires to avoid an infinite render loop.
    getSnapshot() {
      return snapshot
    },
    set(next) {
      if (
        next.id === snapshot.id &&
        next.segment === snapshot.segment &&
        next.autoOpen === snapshot.autoOpen
      ) {
        return
      }
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * A shared, permanently empty store, so the hook degrades to "nothing focused"
 * outside a `Filters` rather than throwing. Nothing ever writes to it: each
 * root creates and writes its own.
 */
const FALLBACK_FOCUS_STORE = createFilterFocusStore()

const FilterFocusContext =
  React.createContext<FilterFocusStore>(FALLBACK_FOCUS_STORE)

/* -------------------------------------------------------------------------- */
/*                                 Reordering                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether rows may be reordered at all, published once for the subtree.
 *
 * It lives HERE rather than in `filters-advanced` because two files have to
 * agree about it. The builder gates the grip and Alt+Arrow on it; the row and
 * group menus carry Move to top level and Move to group N, which commit the
 * same mutator by a third route. Gating only the first two left the capability
 * off for a pointer and quietly on from a menu - which is exactly the hole the
 * gate was written to close.
 */
const FilterReorderContext = React.createContext(false)

export const FilterReorderProvider = FilterReorderContext.Provider

export function useFilterReorderable(): boolean {
  return React.useContext(FilterReorderContext)
}

/* -------------------------------------------------------------------------- */
/*                                   Touched                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which rules the user has actually edited the VALUE of.
 *
 * The whole point is WHEN an error is allowed to appear. A builder that flags
 * every row the moment it exists is a builder that is red before the user has
 * done anything wrong: pressing "Add filter" mints a row with no value, which
 * is invalid by construction, and a saved view loaded with one unfinished
 * condition opened shouting. Both are the primitive telling somebody off for a
 * state it created itself.
 *
 * So an issue is COLLECTED for every rule, always - the footer count, the
 * consumer's own `onQueryChange` and the validity of the tree do not change -
 * and it is only DRAWN once the user has committed a value to that rule. Fix
 * the value and the mark clears; leave the row alone and it never appears.
 *
 * An external store rather than state, for the same reason the focus store is
 * one: a mark is written from an event handler deep in a cell and read by one
 * row, and routing it through the root's state would re-render the whole panel
 * on every keystroke that commits.
 *
 * Keyed by rule id and never pruned. A stale id costs one Set entry, and the
 * alternative - reconciling against the query on every commit - is work on the
 * hot path to save bytes nobody is counting.
 */
export interface FilterRowStateStore {
  subscribe: (listener: () => void) => () => void
  /** Bumped on every write. What a memo depends on, since the Sets are mutable. */
  version: () => number
  /** Whether this rule has had a value committed to it by the user. */
  has: (id: string) => boolean
  mark: (id: string) => void
  /**
   * Starts this rule over.
   *
   * Changing a rule's ATTRIBUTE resets its operator and its value, so it has to
   * reset this too. Otherwise a row the user had already been warned about
   * stays warned about a value that no longer exists, and the message is about
   * a field they just navigated away from.
   */
  unmark: (id: string) => void
  /**
   * Whether this rule is still being CREATED: minted by Add filter and not yet
   * given an attribute by the user.
   *
   * A row is inserted into the query with a guessed field so the tree stays
   * valid, but a guess is not an answer. While the row is pending the builder
   * draws its attribute cell and nothing else, exactly as the chip flow asks
   * one thing at a time - an operator and a value for a field nobody chose are
   * two controls answering a question that has not been put yet.
   */
  isPending: (id: string) => boolean
  markPending: (id: string) => void
  /** The attribute was chosen. The rest of the row appears. */
  resolvePending: (id: string) => void
  /** Forgets everything. The bar's own Clear all, and a whole-tree replace. */
  reset: () => void
}

export function createFilterRowStateStore(): FilterRowStateStore {
  const touched = new Set<string>()
  const pending = new Set<string>()
  const listeners = new Set<() => void>()
  let version = 0
  const notify = () => {
    version += 1
    for (const listener of listeners) listener()
  }
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    has: (id) => touched.has(id),
    mark: (id) => {
      if (touched.has(id)) return
      touched.add(id)
      notify()
    },
    unmark: (id) => {
      if (!touched.delete(id)) return
      notify()
    },
    isPending: (id) => pending.has(id),
    markPending: (id) => {
      if (pending.has(id)) return
      pending.add(id)
      notify()
    },
    resolvePending: (id) => {
      if (!pending.delete(id)) return
      notify()
    },
    reset: () => {
      if (touched.size === 0 && pending.size === 0) return
      touched.clear()
      pending.clear()
      notify()
    },
  }
}

const FALLBACK_ROW_STATE_STORE = createFilterRowStateStore()

const FilterRowStateContext =
  React.createContext<FilterRowStateStore>(FALLBACK_ROW_STATE_STORE)

export const FilterRowStateProvider = FilterRowStateContext.Provider

/** The store itself, for handlers that write without subscribing. */
export function useFilterRowStateStore(): FilterRowStateStore {
  return React.useContext(FilterRowStateContext)
}

/** Whether THIS rule is still waiting for its attribute. */
export function useFilterRowPending(id: string): boolean {
  const store = React.useContext(FilterRowStateContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.isPending(id),
    () => false
  )
}

/**
 * Whether THIS rule may show an error yet.
 *
 * Selected down to one boolean so a row re-renders when its own answer changes
 * and not when any other row is touched.
 */
export function useFilterTouched(id: string): boolean {
  const store = React.useContext(FilterRowStateContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.has(id),
    () => false
  )
}

/** Subscribes to the focus. Re-renders ONLY the calling component. */
export function useFilterFocus(): FilterFocus {
  const store = React.useContext(FilterFocusContext)
  return React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  )
}

/** The store itself, for event handlers that write without subscribing. */
export function useFilterFocusStore(): FilterFocusStore {
  return React.useContext(FilterFocusContext)
}

/**
 * The segment of THIS chip that should open itself, or null.
 *
 * Selected down to a single value so a chip re-renders only when its own answer
 * changes, not on every focus move in the row.
 */
export function useFilterChipAutoOpen(
  id: string
): FilterFocus["segment"] | null {
  const store = React.useContext(FilterFocusContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => {
      const snapshot = store.getSnapshot()
      return snapshot.autoOpen && snapshot.id === id ? snapshot.segment : null
    },
    () => null
  )
}

/**
 * Whether the row holds no focus at all.
 *
 * A roving tabindex needs a fallback tab stop before anything has been focused,
 * and the natural one is the first chip. Selecting down to this boolean means
 * the answer changes only when focus ENTERS or LEAVES the row, not on every
 * move within it, so it costs one re-render per entry rather than one per key.
 */
export function useFilterFocusEmpty(): boolean {
  const store = React.useContext(FilterFocusContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === null,
    () => true
  )
}

/**
 * Whether THIS chip owns the row's tab stop.
 *
 * A chip calling `useFilterFocus()` would re-render on every move anywhere in
 * the row. Selecting down to a boolean means it re-renders only when its own
 * answer flips, which is the two chips involved in a move and no others.
 */
export function useFilterChipFocused(id: string): boolean {
  const store = React.useContext(FilterFocusContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === id,
    () => false
  )
}

/**
 * Which segment of THIS rule owns the tab stop, or null when another one does.
 *
 * The chip needs only a boolean, because a chip is one tab stop. An advanced
 * row is a grid ROW, so its tab stop is a (row, column) pair and the column has
 * to come out of the same store, or the row and the chip would disagree about
 * where focus is after an edit.
 *
 * Selected down to one string for the usual reason: a row re-renders when its
 * own answer changes, not on every move elsewhere in the grid.
 */
export function useFilterSegmentFocus(id: string): FilterFocus["segment"] {
  const store = React.useContext(FilterFocusContext)
  return React.useSyncExternalStore(
    store.subscribe,
    () => {
      const snapshot = store.getSnapshot()
      return snapshot.id === id ? snapshot.segment : null
    },
    () => null
  )
}

/* -------------------------------------------------------------------------- */
/*                              Resolution store                              */
/* -------------------------------------------------------------------------- */

/**
 * The instance-wide value-to-label store.
 *
 * `useFilterOptions` keeps a cache per HOOK INSTANCE, and a chip's display
 * instance and its editor's instance are two instances: a label the editor
 * fetched was invisible to the chip, so a `loadOptions`-only field rendered its
 * raw id the moment the menu closed. This store is the shared half. Every
 * instance under one `Filters` root writes what it learns here and reads
 * through it, and `resolveValues` results land here too, so whichever host
 * asked, every host can answer.
 *
 * An external store rather than React state for the focus store's reason:
 * labels arrive from effects and from promise resolutions, at their own pace,
 * and only the components whose values just resolved should pay for the news.
 * The version is monotonic and bumps only when a NEW label lands, so a
 * subscriber re-renders once per page of results, not once per write.
 */
export interface FilterResolutionStore {
  subscribe: (onStoreChange: () => void) => () => void
  /** Monotonic. Bumps only when a value that had no label gains one. */
  getVersion: () => number
  /** The option behind a stored value, or undefined while unresolved. */
  get: (fieldKey: string, value: string) => FilterOption | undefined
  /** Records options under a field key. New values bump the version. */
  set: (fieldKey: string, options: readonly FilterOption[]) => void
  /**
   * Marks values as being resolved and returns the subset nobody has claimed
   * or resolved yet, so two chips holding the same id issue ONE request.
   * Claims are permanent for values a fulfilled resolve did not return, which
   * is what stops an id the server does not know from being re-asked forever.
   */
  claim: (fieldKey: string, values: readonly string[]) => string[]
  /** Releases claims after a FAILED resolve, so a later mount may retry. */
  release: (fieldKey: string, values: readonly string[]) => void
}

export function createFilterResolutionStore(): FilterResolutionStore {
  const resolved = new Map<string, Map<string, FilterOption>>()
  const claimed = new Map<string, Set<string>>()
  const listeners = new Set<() => void>()
  let version = 0

  const bucket = (fieldKey: string) => {
    let map = resolved.get(fieldKey)
    if (!map) {
      map = new Map()
      resolved.set(fieldKey, map)
    }
    return map
  }

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    getVersion() {
      return version
    },
    get(fieldKey, value) {
      return resolved.get(fieldKey)?.get(value)
    },
    set(fieldKey, options) {
      const map = bucket(fieldKey)
      let landed = false
      for (const option of options) {
        if (!map.has(option.value)) landed = true
        map.set(option.value, option)
      }
      if (!landed) return
      version += 1
      for (const listener of listeners) listener()
    },
    claim(fieldKey, values) {
      let set = claimed.get(fieldKey)
      if (!set) {
        set = new Set()
        claimed.set(fieldKey, set)
      }
      const map = resolved.get(fieldKey)
      const fresh: string[] = []
      for (const value of values) {
        if (set.has(value) || map?.has(value)) continue
        set.add(value)
        fresh.push(value)
      }
      return fresh
    },
    release(fieldKey, values) {
      const set = claimed.get(fieldKey)
      if (!set) return
      for (const value of values) set.delete(value)
    },
  }
}

export {
  FilterActionsContext,
  FilterFocusContext,
  FilterRenderContext,
  FilterStateContext,
}
