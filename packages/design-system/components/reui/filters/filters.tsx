// @ts-nocheck
"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import {
  FilterActionsContext,
  FilterFocusContext,
  FilterRenderContext,
  FilterStateContext,
  createFilterFocusStore,
  createFilterRowStateStore,
  FilterRowStateProvider,
  createFilterResolutionStore,
  filterControlSizes,
  filterReadOnlyProps,
  isFilterLocked,
  useFilterActions,
  useFilterFocusStore,
  useFilterState,
  type FilterActionsContextValue,
} from "@pi-dash/design-system/components/reui/filters/filters-context"
import { FilterChip } from "@pi-dash/design-system/components/reui/filters/filters-chip"
import { FiltersAdvanced } from "@pi-dash/design-system/components/reui/filters/filters-advanced"
import { FiltersBuilder } from "@pi-dash/design-system/components/reui/filters/filters-builder"
import {
  filterDraftReducer,
  isFilterDraftCommittable,
  type FilterDraftAction,
} from "@pi-dash/design-system/components/reui/filters/filters-draft"
import {
  DEFAULT_FILTER_EDITORS,
  resolveFilterEditor,
  type FilterEditorRegistry,
} from "@pi-dash/design-system/components/reui/filters/filters-editors"
import { resolveFilterLabels } from "@pi-dash/design-system/components/reui/filters/filters-i18n"
import {
  buildFilterIndex,
  computeFilterSchemaSignature,
  createFilterIdFactory,
  findFilterSchemaIssues,
  formatFilterPath,
  getFilterField,
  warnFilterOnce,
  type FilterPathCollapse,
} from "@pi-dash/design-system/components/reui/filters/filters-lib"
import {
  createFilterOperators,
  DEFAULT_FILTER_OPERATORS,
  DEFAULT_FILTER_OPERATOR_LABELS,
  getFilterOperator,
  negateFilterOperator,
  operatorTakesValue,
  resolveFilterOperators,
  type FilterOperatorLabels,
} from "@pi-dash/design-system/components/reui/filters/filters-operators"
import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
  clearFilterQuery,
  countFilterRules,
  copyFilterNodeTo,
  duplicateFilterNode,
  findFilterNode,
  findFilterRule,
  flattenFilterRules,
  insertFilterNode,
  isFilterRule,
  moveFilterNode,
  moveFilterNodeTo,
  removeFilterNode,
  setFilterCombinator,
  toggleFilterCombinator,
  unwrapFilterGroup,
  updateFilterRule,
  wrapFilterNodeInGroup,
} from "@pi-dash/design-system/components/reui/filters/filters-query"
import type {
  FilterChangeDetails,
  FilterCombinator,
  FilterDraft,
  FilterDraftStep,
  FilterEditor,
  FilterField,
  FilterLabels,
  FilterQuery,
  FilterRule,
  FilterEmptyStateContext,
  FilterValueDisplayContext,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"

/* -------------------------------------------------------------------------- */
/*                                  Variants                                  */
/* -------------------------------------------------------------------------- */

const filtersBarVariants = cva("flex flex-wrap items-center", {
  variants: {
    // TWO RUNGS, and no `lg`, because this ladder holds exactly the rungs
    // `FILTER_CONTROL_SIZES` holds. It is fed the RESOLVED rung rather than the
    // raw prop (see the call sites), which is what keeps the two in step: a
    // `"lg"` from a JavaScript caller used to space the bar at 10px around
    // controls that had already fallen back to the default height, and deleting
    // the rung on its own would have left that bar with no gap at all, since a
    // cva default only applies to a value nobody passed.
    size: {
      sm: "gap-1.5",
      default: "gap-2",
    },
  },
  defaultVariants: { size: "default" },
})

/* -------------------------------------------------------------------------- */
/*                                 Controllable                               */
/* -------------------------------------------------------------------------- */

function useControllableQuery<V, O>(
  controlled: FilterQuery<V> | undefined,
  uncontrolledDefault: FilterQuery<V> | undefined,
  onChange:
    | ((query: FilterQuery<V>, details: FilterChangeDetails<V, O>) => void)
    | undefined
) {
  const isControlled = controlled !== undefined
  const [internal, setInternal] = React.useState<FilterQuery<V>>(
    () => uncontrolledDefault ?? createFilterQuery<V>()
  )

  const query = isControlled ? controlled : internal
  const queryRef = React.useRef(query)
  React.useEffect(() => {
    queryRef.current = query
  })

  const setQuery = React.useCallback(
    (next: FilterQuery<V>, details: FilterChangeDetails<V, O>) => {
      if (next === queryRef.current) return
      queryRef.current = next
      if (!isControlled) setInternal(next)
      onChange?.(next, details)
    },
    [isControlled, onChange]
  )

  return { query, queryRef, setQuery }
}

/* -------------------------------------------------------------------------- */
/*                                    Root                                    */
/* -------------------------------------------------------------------------- */

export interface FiltersProps<V = unknown, O = unknown> {
  /** The field schema. Nested via each field's own `fields`. */
  fields: FilterField<V, O>[]

  query?: FilterQuery<V>
  defaultQuery?: FilterQuery<V>
  onQueryChange?: (
    query: FilterQuery<V>,
    details: FilterChangeDetails<V, O>
  ) => void

  labels?: Partial<FilterLabels>
  /** Operator wording, overridden independently of the chrome copy. */
  operatorLabels?: FilterOperatorLabels
  /** Extra or replacement value editors, resolved by a field's `editor` name. */
  editors?: FilterEditorRegistry

  /**
   * Which chrome draws the query.
   *
   * `"basic"` is the chip row: a FLAT list of pills joined by an implicit AND,
   * edited in place, which is what a toolbar over a table wants. It draws no
   * combinator at all, because a chrome that can only express one group has
   * nothing honest to say about a tree.
   *
   * `"advanced"` is the condition builder: the same query as nested groups of
   * combinator, attribute, condition and value cells, which is what a saved
   * view or a report needs, where the whole condition set has to be legible and
   * editable at once, and where `a AND (b OR c)` has to be expressible.
   *
   * ONE query model underneath, read and written by the same actions. They are
   * two renderings of one thing, not two features, which is why switching is a
   * prop rather than a different component with its own state. The one thing
   * that does not survive the switch is legibility: a nested query shown in
   * basic mode draws every rule it holds, at any depth, as a flat row of chips,
   * because a chip row has nowhere to put a parenthesis. Showing a condition it
   * cannot fully describe is still better than hiding one that is filtering.
   */
  variant?: "basic" | "advanced"
  /**
   * Where the advanced builder lives. Ignored in basic mode.
   *
   * `"popover"` hangs it off a trigger; `"inline"` renders the panel in place,
   * for a filter sidebar or a settings page where the builder IS the page.
   */
  advancedMode?: "popover" | "inline"
  /**
   * Where the advanced panel sits against its trigger. Advanced popover only.
   *
   * Defaults to "start", which is right for a trigger on the left of a bar. A
   * trigger near the RIGHT edge wants "end", and the two twins do not agree
   * about that on their own: Base UI flips the alignment when the panel will
   * not fit, so it lands on the trigger's right edge, while Radix only shifts
   * along the axis and comes to rest against the viewport instead. Stating the
   * alignment removes the guess and makes both twins draw the same panel.
   */
  advancedAlign?: "start" | "center" | "end"
  /**
   * Whether the advanced builder's rows can be REORDERED.
   *
   * Off by default. Reordering is the one capability in the builder that
   * changes nothing about what a query MEANS: a group is a set joined by one
   * operator, so moving a condition inside its group returns the same rows in
   * the same order. What it costs is a control on every row and a gesture that
   * can be started by accident on a touch screen, which is a bad trade for the
   * many builders whose rows are read rather than arranged.
   *
   * Turn it on where the ORDER is part of how people read the query - a long
   * nested tree somebody is shaping, a saved view that gets rearranged - and
   * the grip appears, drag lands, and Alt with Arrow Up or Arrow Down moves the
   * focused row without a pointer.
   *
   * Even on, a grip is drawn only where a move could actually change the tree:
   * the sole row at the root has nowhere to go, so it gets none.
   */
  reorderable?: boolean

  /**
   * The density of the whole bar: the chips, the triggers, Clear, and every
   * advanced-builder cell.
   *
   * TWO RUNGS. They resolve to the shadcn button's own `sm` and `default`
   * through `filterControlSizes`, so each one is whatever the ACTIVE STYLE says
   * that rung is (nova 7/8, sera 9/10, mira 6/7, maia and luma 8/9, lyra and
   * rhea 7/8, vega 8/9). Nothing here is a pixel.
   *
   * THE CHIPS USED TO BE EXEMPT and are not any more. The argument for
   * exempting them was that `ButtonGroup` has no size variant, so there was
   * nothing to thread; the flaw in it is that a chip is the largest thing in
   * the bar, so a `size` that moved everything except the chips looked like a
   * `size` that did nothing at all - which is exactly how it was reported. The
   * thread turned out not to need a `ButtonGroup` variant: the group is
   * `items-stretch` and no style gives its text segments a height, so the pill
   * takes the height of its one definite-height child, the kebab. Sizing the
   * kebab off the same ladder sizes the chip, and the segments stay ONE element
   * each, which is what the fusion selectors require.
   *
   * `lg` is gone. See `FILTER_CONTROL_SIZES` for why a bar has no rung above
   * its style's own default control height.
   */
  size?: "sm" | "default"
  disabled?: boolean
  readOnly?: boolean

  /**
   * ONE VETO POINT for every change to the query.
   *
   * Return `false` to refuse the change; return anything else (including
   * nothing) and it commits. `details.reason` says which action asked, so
   * per-action logic is a `switch` in one place rather than a prop per action.
   *
   * ONE HOOK AND NOT FOURTEEN, and the reason is the same one that put the
   * lock at the action boundary instead of on the buttons. Every write in this
   * component goes through `emit`, so a hook there covers the chip row's
   * Delete key, the builder's Alt+Arrow, a drag, a consumer-composed chrome
   * mounted through `children`, and whatever the next revision adds - for free.
   * A set of per-action props covers exactly the actions someone enumerated,
   * and the fifteenth route is a hole nobody notices until it ships.
   *
   * IT CANNOT WRITE, only refuse, and that is deliberate rather than an
   * omission. A hook that returned a REPLACEMENT tree would be handing the
   * primitive a query it never built - one that can name a field the schema
   * does not have, or hold a rule id the focus store is pointing at - and the
   * announcement for the action has already been computed from the tree that
   * was proposed, so the bar would say one thing and commit another. A consumer
   * who wants to write a different tree already has the controlled `query`
   * prop, which is where an arbitrary tree belongs.
   *
   * IT IS BEHIND THE LOCK, not beside it. `emit` asks `locked()` first, so a
   * disabled or read-only bar never calls this at all: there is no argument a
   * consumer's hook can make that gets a locked bar to move, because it is
   * never asked the question. Approving is not a power it has - only refusing
   * is - so the two compose in the only direction that is safe.
   *
   * Fires only for changes this bar makes. A consumer writing the controlled
   * `query` prop directly is not a change the bar made and is not routed here.
   */
  onBeforeQueryChange?: (
    query: FilterQuery<V>,
    details: FilterChangeDetails<V, O>
  ) => boolean | void

  /**
   * Offers "Convert to advanced filter" in every chip's kebab menu.
   *
   * The prop IS the switch: present means the row is drawn, absent means it is
   * not. There is no boolean beside it because `variant` belongs to the
   * consumer - this component cannot switch its own chrome - so a flag without
   * a handler would draw a row that does nothing at all.
   *
   * The row is suppressed while `variant` is already `"advanced"`, so the
   * no-op case cannot be reached even by a consumer who passes the handler
   * unconditionally.
   */
  onConvertToAdvanced?: () => void

  /**
   * Classes for the dropdown MENUS and for the field PICKER panel.
   *
   * One prop each rather than one per mount point, because the same menu is
   * drawn by four components and the same picker by two. Both are merged after
   * the primitive's default, so a `w-*` here wins through tailwind-merge; see
   * `FILTER_MENU_CLASS` and `FILTER_FIELD_PICKER_CLASS` for the defaults and
   * why they are what they are.
   */
  menuClassName?: string
  fieldPickerClassName?: string

  /**
   * How a NESTED attribute path is shortened when it is too deep to read.
   *
   * `"none"`, the default, draws every ancestor, which is what every consumer
   * gets today and what an upgrade must not change under them. `"middle"` keeps
   * the root and the tail and elides the run between them; `"start"` keeps the
   * tail alone. The words and their meanings are the cascader's - this is the
   * same collapser, so the two primitives cannot disagree about how a deep path
   * reads.
   *
   * It applies to BOTH chromes, the chip's path and the builder's attribute
   * cell, for the same reason the cascader shares one collapser between its
   * trigger and its breadcrumb: two renderings of one path that shorten it
   * differently are two things the user has to learn instead of one.
   *
   * The full path is never lost with it. It stays the accessible NAME of the
   * control (the chip group's, the builder cell's), so the collapse is a visual
   * abbreviation and not a removal - a breadcrumb only a mouse user can expand
   * would be a regression for everybody else.
   */
  pathCollapse?: FilterPathCollapse
  /**
   * How many names survive the collapse, the elided run not counted.
   *
   * Inert while `pathCollapse` is `"none"`. Three is the cascader's own default
   * and holds "Company > ... > Domains" together, which is the shape that has to
   * stay legible.
   */
  maxPathSegments?: number

  /** Replaces the default Add filter button. */
  trigger?: React.ReactNode
  /** Renders a Clear button once the query holds anything. */
  showClear?: boolean

  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode
  /**
   * Replaces the advanced builder's empty state, drawn when the query holds no
   * conditions at all.
   *
   * The DEFAULT is the point of this prop existing rather than the panel simply
   * rendering nothing: a builder with no rows is a footer floating in blank
   * space, which reads as broken rather than as cleared. So the primitive ships
   * a glyph and two lines, and this replaces them when a product has something
   * better to say - a saved-view picker, a set of starter filters, an
   * illustration.
   *
   * Return `null` to draw nothing at all and get the old blank panel back.
   * Ignored in basic mode, which has no builder.
   */
  renderEmpty?: (context: FilterEmptyStateContext) => React.ReactNode

  className?: string
  children?: React.ReactNode
}

export function Filters<V = unknown, O = unknown>({
  fields,
  query: controlledQuery,
  defaultQuery,
  onQueryChange,
  labels: labelsProp,
  operatorLabels: operatorLabelsProp,
  editors: editorsProp,
  variant = "basic",
  advancedMode = "popover",
  advancedAlign = "start",
  reorderable = false,
  size = "default",
  disabled = false,
  readOnly = false,
  onBeforeQueryChange,
  onConvertToAdvanced,
  menuClassName,
  fieldPickerClassName,
  pathCollapse = "none",
  maxPathSegments = 3,
  trigger,
  showClear = false,
  renderValue,
  renderChip,
  renderEmpty,
  className,
  children,
}: FiltersProps<V, O>) {
  const { query, queryRef, setQuery } = useControllableQuery<V, O>(
    controlledQuery,
    defaultQuery,
    onQueryChange
  )

  const [draft, dispatchDraftRaw] = React.useReducer(
    filterDraftReducer<V>,
    null as FilterDraft<V> | null
  )
  /**
   * The live region's text AND a counter, in one state, deliberately.
   *
   * The counter is what makes a repeated sentence audible. `aria-live` fires on
   * a DOM mutation, and React writes nothing when the string it is asked to
   * render is already in the node, so "Group added" said three times
   * was announced once - measured with a MutationObserver, three presses and
   * one mutation. Every constant-string announcement below has that shape, and
   * so does a reorder that lands twice in the same slot.
   *
   * Bumped on every call rather than only on a repeat: a conditional bump is a
   * second rule to keep in step with the first, and the chrome only ever
   * compares this for identity.
   */
  const [announced, setAnnounced] = React.useState({ seq: 0, text: "" })
  const announcement = announced.text
  const setAnnouncement = React.useCallback((text: string) => {
    setAnnounced((prev) => ({ seq: prev.seq + 1, text }))
  }, [])

  // Seeded from useId, so the server and the client agree. The old createFilter
  // built ids from Date.now() plus Math.random(), which broke hydration on any
  // page that shipped default filters.
  const idSeed = React.useId()
  const nextId = React.useMemo(
    () => createFilterIdFactory(`${idSeed}f`),
    [idSeed]
  )

  const focusStore = React.useMemo(() => createFilterFocusStore(), [])
  const rowStateStore = React.useMemo(() => createFilterRowStateStore(), [])
  // One per root, for the life of the root: the value-to-label store every
  // `useFilterOptions` instance under this tree reads through and writes to.
  const resolutionStore = React.useMemo(
    () => createFilterResolutionStore(),
    []
  )

  /* -------------------------------- derived ------------------------------- */

  // The signature fallback lives here: `fields` is an inline array literal at
  // effectively every call site, so keying on identity would rebuild on every
  // render and take the whole downstream memo chain with it.
  //
  // Two steps rather than a ref written during render. Caching the previous
  // index in a ref would work, but writing a ref while rendering is the exact
  // impurity this rewrite removes from the old primitive, and it misbehaves
  // under StrictMode's double render. Instead the CHEAP walk (the signature)
  // runs every render and the EXPENSIVE one (the maps) memoizes on its result,
  // so a structurally unchanged schema returns the identical index object.
  const signature = computeFilterSchemaSignature(fields)
  const index = React.useMemo(
    () => buildFilterIndex<V, O>(fields, null, signature),
    // `fields` is deliberately not a dependency: its identity changes on every
    // render at every real call site, which is the whole problem being solved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature]
  )

  const labels = React.useMemo(
    () => resolveFilterLabels(labelsProp),
    [labelsProp]
  )

  const operatorCatalog = React.useMemo(() => {
    if (!operatorLabelsProp) return DEFAULT_FILTER_OPERATORS
    return createFilterOperators({
      ...DEFAULT_FILTER_OPERATOR_LABELS,
      ...operatorLabelsProp,
    })
  }, [operatorLabelsProp])

  const editors = React.useMemo(
    () => ({ ...DEFAULT_FILTER_EDITORS, ...editorsProp }),
    [editorsProp]
  )

  const resolveOperators = React.useCallback(
    (field: FilterField<V, O>) => resolveFilterOperators(field, operatorCatalog),
    [operatorCatalog]
  )

  const ruleCount = React.useMemo(() => countFilterRules(query), [query])

  /* --------------------------- latest-props ref --------------------------- */

  const latest = React.useRef({
    index,
    labels,
    operatorCatalog,
    resolveOperators,
    draft,
    nextId,
    setQuery,
    queryRef,
    disabled,
    readOnly,
    onBeforeQueryChange,
  })
  React.useEffect(() => {
    latest.current = {
      index,
      labels,
      operatorCatalog,
      resolveOperators,
      draft,
      nextId,
      setQuery,
      queryRef,
      disabled,
      readOnly,
      onBeforeQueryChange,
    }
  })

  /* -------------------------------- actions ------------------------------- */

  // Every mutator below reads its state through `latest` rather than closing
  // over it, so none of them is rebuilt by a keystroke, a query change or a
  // re-render, and a memoized chip never re-renders because a handler was
  // recreated. The two lock flags are the ONE exception, for the reason on
  // `locked` itself, and they are flags a consumer flips about as often as it
  // changes the schema.

  /**
   * THE MUTATION BOUNDARY. Read `isFilterLocked` for what the two flags mean.
   *
   * Every write asks this first, and it is asked HERE rather than at the nine
   * places that draw a button, because the routes into a query are not only
   * buttons: the chip row's Delete key, the builder's Alt+Arrow, a drag, a
   * consumer's own chrome mounted through `children`, and whatever the next
   * revision adds. Each of those was its own hole before this line existed, and
   * a hole per route is what a call-site guard buys you.
   *
   * It asks BOTH the render it was built in and the ref, and needs both.
   *
   * The ref is what a stale handler reads: an event fires long after the commit
   * that flipped the flag, and `latest` is by then the current answer whichever
   * revision of the callback the DOM happens to be holding.
   *
   * The closure is what closes the window the ref leaves open. `latest` is
   * written in a passive effect, and effects run child-first, so every consumer
   * effect in the commit that turns `readOnly` on runs BEFORE the ref learns
   * about it - a consumer that removes a rule from an effect was still writing
   * one frame after it asked the bar to stop. Closing over the props makes the
   * refusal true from the render itself, and it costs one rebuild of the
   * actions object per flip, which is a thing that already happens: `disabled`
   * and `readOnly` are dependencies of the memo that publishes them.
   *
   * Neither half is dropped for the other: the closure is right for the commit
   * and the ref is right for everything after it, and `||` between two
   * fail-closed answers cannot be talked into failing open.
   */
  const locked = React.useCallback(
    () => disabled || readOnly || isFilterLocked(latest.current),
    [disabled, readOnly]
  )

  /**
   * Reports whether the write LANDED, and every caller that does anything
   * afterwards has to ask.
   *
   * It returned nothing while a refusal could only come from `locked()`, and
   * that was sound: every mutator asks the lock itself before it starts, so a
   * locked bar never reached the announcement either. `onBeforeQueryChange` is
   * a refusal that can only be discovered HERE, in the middle of a mutator that
   * has already decided what it is going to say, so a boolean is the only way
   * the announcement and the committed tree can stay in agreement. A vetoed
   * remove that still announced "2 filters applied" is a live region lying to
   * the one user who cannot see that nothing moved.
   */
  const emit = React.useCallback(
    (
      next: FilterQuery<V>,
      reason: FilterChangeDetails<V, O>["reason"],
      rule: FilterRule<V> | null
    ): boolean => {
      // The backstop, and deliberately redundant with the early return every
      // mutator below already carries: those exist so a refused action also
      // mints no id, announces nothing and moves no focus, while this one is
      // what makes a mutator someone adds later safe before they have thought
      // about it. All fourteen query writes come through here.
      //
      // FIRST, and before the consumer hook. The order is the whole safety
      // argument for that hook: a locked bar returns here, so a consumer's
      // interceptor is never called on one and has no opportunity to approve
      // what the lock refused.
      if (locked()) return false
      const field = rule
        ? (getFilterField(latest.current.index, rule.path) ?? null)
        : null
      const details: FilterChangeDetails<V, O> = { reason, rule, field }
      // Strictly `false`, so a consumer who forgets to return - the shape of
      // every side-effect-only handler - is not read as a veto.
      if (latest.current.onBeforeQueryChange?.(next, details) === false) {
        return false
      }
      latest.current.setQuery(next, details)
      return true
    },
    [locked]
  )

  /**
   * Drops the roving tab stop when the node holding it no longer exists.
   *
   * The focus store keeps a raw id and nothing ever repaired it, so destroying
   * the focused node took the WHOLE builder out of the tab order: a chip or a
   * row claims the tab stop when the store names it, and the fallback -
   * "nobody is focused, so row one takes it" - only fires when the store is
   * empty. An id pointing at a node that has been deleted is neither, so every
   * cell in the panel stayed at `tabindex="-1"` with focus on the BODY.
   * Measured on a five-row builder: remove the focused row from its own kebab
   * and twenty cells remain, none of them tabbable, in both twins.
   *
   * ONE EFFECT ON THE COMMITTED QUERY, and that is the whole point of it being
   * here rather than at the call sites that destroy a node. Three mutators used
   * to call a repair helper, which covered exactly the three routes somebody had
   * thought of. It did not cover the route every consumer ships: a "Reset", a
   * "Load saved view" or an undo button that hands back a whole different tree
   * through `setQuery`. Measured on the shipped example's own Reset button -
   * add a condition, press Reset, and 25 cells remain with `tabindex="-1"` on
   * every one of them and focus on the BODY, in both twins. The store pointed at
   * an id the new tree never had, which is neither "focused" nor "empty", so the
   * fallback that re-pins row one never fired.
   *
   * Keyed on `query`, so it asks the only question that matters - is the focused
   * node still in the tree that is on screen - once per committed tree, whoever
   * committed it. That covers the three mutators, the consumer's own writes, and
   * whatever route the next revision adds, without any of them knowing about it.
   *
   * Resetting to nothing is the whole repair. The fallback then re-pins row one,
   * which is where a keyboard user re-enters.
   */
  React.useEffect(() => {
    const { id } = focusStore.getSnapshot()
    if (!id || findFilterNode(query, id)) return
    focusStore.set({ id: null, segment: null, autoOpen: false })
  }, [query, focusStore])

  const addRule = React.useCallback(
    (rule: FilterRule<V>, parentId?: string) => {
      if (locked()) return
      const next = insertFilterNode(
        latest.current.queryRef.current,
        rule,
        parentId
      )
      if (!emit(next, "add", rule)) return
      setAnnouncement(latest.current.labels.countAnnouncement(countFilterRules(next)))
    },
    [emit, locked, setAnnouncement]
  )

  const addGroup = React.useCallback(
    (parentId?: string, combinator: FilterCombinator = "or") => {
      // Before `nextId`, not after it: a refused add that still burned an id
      // would drift the SSR-seeded sequence away from the server's.
      if (locked()) return ""
      const id = latest.current.nextId()
      // `or` by default, because a group whose combinator matched its parent's
      // would be structurally pointless: `a AND (b AND c)` is `a AND b AND c`.
      // The one reason to nest is to say something the parent cannot.
      const next = insertFilterNode(
        latest.current.queryRef.current,
        createFilterGroup<V>({ id, combinator }),
        parentId
      )
      // `""` on a veto for the same reason a locked bar returns it: every
      // caller moves focus onto the id it gets back, and focusing a group that
      // was never created strands the tab stop. The id itself is already
      // burnt, and deliberately so - it is minted before the write to keep the
      // SSR-seeded sequence deterministic, and a veto is a client-time decision
      // that the server never took part in.
      if (!emit(next, "add", null)) return ""
      setAnnouncement(latest.current.labels.groupAnnouncement(true))
      return id
    },
    [emit, locked, setAnnouncement]
  )

  const updateRule = React.useCallback(
    (id: string, updates: Partial<Omit<FilterRule<V>, "id" | "type">>) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = updateFilterRule(current, id, updates)
      if (next === current) return
      // THE VALUE, and not the field or the operator. "Show me the error once I
      // have had a go at the value" is the contract, so picking an attribute -
      // which is the first thing every new row asks for, and which leaves the
      // value empty by construction - must not arm it. Otherwise the flow the
      // primitive itself walks a user through ends in a red row every time.
      //
      // `path` is what tells the two apart, and it has to: a field re-pick
      // sends `value: undefined` in the SAME patch, because changing the
      // attribute invalidates whatever was there. So the presence of `value`
      // alone would arm on exactly the gesture this is written to stay quiet
      // for. Clearing a value the user typed still arms it - that patch carries
      // no `path`.
      if ("path" in updates) rowStateStore.unmark(id)
      else if ("value" in updates) rowStateStore.mark(id)
      emit(next, "update", findFilterRule(next, id))
    },
    [emit, locked, rowStateStore]
  )

  const removeNode = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const removed = findFilterRule(current, id)
      const next = removeFilterNode(current, id)
      if (next === current) return
      if (!emit(next, "remove", removed)) return
      // A group has no rule to report, and its removal takes an unknown number
      // of conditions with it, so the count is the honest thing to announce for
      // both. The group wording is announced on top of it.
      setAnnouncement(
        removed
          ? latest.current.labels.countAnnouncement(countFilterRules(next))
          : latest.current.labels.groupAnnouncement(false)
      )
    },
    [emit, locked, setAnnouncement]
  )

  const duplicateNode = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = duplicateFilterNode(current, id, latest.current.nextId)
      if (next === current) return
      if (!emit(next, "duplicate", findFilterRule(current, id))) return
      // Same announcement as the Alt-drag copy, for the same reason: this is
      // the menu's route to the identical edit, and a duplicate that was silent
      // while a copy spoke made the live region depend on which affordance the
      // user reached for. The count rather than "duplicated", because
      // duplicating a GROUP adds an unknown number of conditions.
      setAnnouncement(
        latest.current.labels.countAnnouncement(countFilterRules(next))
      )
    },
    [emit, locked, setAnnouncement]
  )

  const negateRule = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const rule = findFilterRule(current, id)
      if (!rule) return
      const field = getFilterField(latest.current.index, rule.path)
      if (!field) return
      const operators = latest.current.resolveOperators(field)
      const flipped = negateFilterOperator(
        getFilterOperator(operators, rule.operator),
        operators,
        rule.negated
      )
      const next = updateFilterRule(current, id, {
        operator: flipped.operator ?? rule.operator,
        negated: flipped.negated || undefined,
      })
      emit(next, "negate", findFilterRule(next, id))
    },
    [emit, locked]
  )

  /**
   * Says where a node LANDED.
   *
   * Every other mutator changes something a screen reader can hear some other
   * way: an add or a remove changes the count, a group changes the structure,
   * an edit moves focus into the thing that changed. A reorder changes none of
   * them. Focus stays on the same handle, the node keeps its name, and the name
   * says what the condition filters rather than where it sits, so Alt+Arrow was
   * silent even though the query had changed.
   *
   * Reads the tree AFTER the move, because the position and the sibling count
   * being announced are the ones the user has just arrived at. A group is named
   * by its own combinator headline, the same sentence the builder gives it, so
   * dragging a group announces the thing the user was holding.
   */
  const announceReorder = React.useCallback(
    (next: FilterQuery<V>, id: string, fromParentId: string | null) => {
      const found = findFilterNode(next, id)
      // No parent means the root, which cannot move. Nothing to say.
      if (!found || !found.parent) return
      const label = isFilterRule(found.node)
        ? formatFilterPath(
            latest.current.index,
            found.node.path,
            latest.current.labels.pathSeparator
          )
        : found.node.combinator === "and"
          ? latest.current.labels.groupAll
          : latest.current.labels.groupAny
      const position = found.index + 1
      const total = found.parent.rules.length

      // A move that changed the node's CONTAINER is a different event, and it
      // used to be announced in the identical sentence. Measured: dragging a
      // top-level row into a group said "Repository > Stars moved to position 3
      // of 3", and a plain reorder inside that group said "Estimate moved to
      // position 3 of 3" - same shape, same numbers, one of them a change of
      // depth. The destination chrome the drag layer paints exists to say
      // exactly the thing this sentence was leaving out.
      //
      // The group's own headline as the destination, so a screen reader hears
      // the same words the group's accessible name uses; the bar's own label
      // when the row has landed at the top level, which is the one destination
      // that has no headline.
      if (fromParentId && fromParentId !== found.parent.id) {
        const destination =
          found.parent.id === next.id
            ? latest.current.labels.filtersLabel
            : found.parent.combinator === "and"
              ? latest.current.labels.groupAll
              : latest.current.labels.groupAny
        setAnnouncement(
          latest.current.labels.moveAnnouncement(
            label,
            destination,
            position,
            total
          )
        )
        return
      }

      setAnnouncement(
        latest.current.labels.reorderAnnouncement(label, position, total)
      )
    },
    [setAnnouncement]
  )

  const moveNode = React.useCallback(
    (id: string, delta: number) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = moveFilterNode(current, id, delta)
      if (next === current) return
      if (!emit(next, "reorder", findFilterRule(next, id))) return
      // Within the owning group by construction, so there is no destination to
      // name and the plain reorder sentence is the honest one.
      announceReorder(next, id, null)
    },
    [emit, announceReorder, locked]
  )

  // Also the drag layer's drop commit: `filters-advanced` routes a non-copy drop
  // straight here, so a pointer drag and Alt+Arrow announce the same sentence
  // rather than each growing its own.
  const moveNodeTo = React.useCallback(
    (id: string, parentId: string, index: number) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      // BEFORE the move, because it is the only place the old parent still
      // exists, and it is what tells a drop into a group apart from a reorder
      // inside one.
      const fromParentId = findFilterNode(current, id)?.parent?.id ?? null
      const next = moveFilterNodeTo(current, id, parentId, index)
      if (next === current) return
      if (!emit(next, "reorder", findFilterRule(next, id))) return
      announceReorder(next, id, fromParentId)
    },
    [emit, announceReorder, locked]
  )

  const copyNodeTo = React.useCallback(
    (id: string, parentId: string, index: number) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = copyFilterNodeTo(
        current,
        id,
        parentId,
        index,
        latest.current.nextId
      )
      if (next === current) return
      if (!emit(next, "duplicate", findFilterRule(current, id))) return
      // The count, not the duplicate wording: an Alt-drag of a GROUP adds an
      // unknown number of conditions, and "duplicated" would understate it.
      setAnnouncement(
        latest.current.labels.countAnnouncement(countFilterRules(next))
      )
    },
    [emit, locked, setAnnouncement]
  )

  const wrapNodeInGroup = React.useCallback(
    (id: string, combinator: FilterCombinator = "or") => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = wrapFilterNodeInGroup(
        current,
        id,
        latest.current.nextId(),
        combinator
      )
      if (next === current) return
      if (!emit(next, "add", findFilterRule(next, id))) return
      setAnnouncement(latest.current.labels.groupAnnouncement(true))
    },
    [emit, locked, setAnnouncement]
  )

  const unwrapGroup = React.useCallback(
    (groupId: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = unwrapFilterGroup(current, groupId)
      if (next === current) return
      // The group is gone and its conditions survive in place, so the honest
      // announcement is the group removal, exactly as `removeNode` says for a
      // group; the count has not changed, so the count sentence would be
      // silence dressed as news.
      if (!emit(next, "remove", null)) return
      setAnnouncement(latest.current.labels.groupAnnouncement(false))
    },
    [emit, locked, setAnnouncement]
  )

  /**
   * What a combinator change SOUNDS like.
   *
   * These two were the only mutators of the fourteen that emitted without
   * saying anything, and they are not a small edit: flipping a group's
   * combinator rewrites the boolean logic of every condition in it. The pill's
   * accessible name changes with it - "and, change combinator" becomes "or,
   * change combinator" - but the pill is the element that already has focus
   * when it changes, and a name change on a focused element is not reliably
   * re-announced by NVDA or JAWS. So the press that rewrites the group was the
   * one thing in the panel a screen reader user got no confirmation of.
   *
   * The group's own headline, not the bare word: "All of the following are
   * true..." says what the query now MEANS, which is the thing that changed,
   * and it is the same sentence the group's accessible name and the reorder
   * announcement already use for the same group.
   */
  const announceCombinator = React.useCallback(
    (combinator: FilterCombinator) => {
      setAnnouncement(
        combinator === "and"
          ? latest.current.labels.groupAll
          : latest.current.labels.groupAny
      )
    },
    [setAnnouncement]
  )

  const setCombinatorAction = React.useCallback(
    (groupId: string, combinator: FilterCombinator) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = setFilterCombinator(current, groupId, combinator)
      if (next === current) return
      if (!emit(next, "combinator", null)) return
      announceCombinator(combinator)
    },
    [emit, locked, announceCombinator]
  )

  const toggleCombinatorAction = React.useCallback(
    (groupId: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = toggleFilterCombinator(current, groupId)
      if (next === current) return
      if (!emit(next, "combinator", null)) return
      // Read back off the COMMITTED tree rather than inverted here, so the
      // sentence cannot disagree with what the toggle actually wrote.
      const group = findFilterNode(next, groupId)?.node
      if (group && !isFilterRule(group)) announceCombinator(group.combinator)
    },
    [emit, locked, announceCombinator]
  )

  const clearQueryAction = React.useCallback(() => {
    if (locked()) return
    const current = latest.current.queryRef.current
    const next = clearFilterQuery(current)
    if (next === current) return
    if (!emit(next, "clear", null)) return
    setAnnouncement(latest.current.labels.countAnnouncement(0))
  }, [emit, locked, setAnnouncement])

  /**
   * The live region, opened to the chrome inside the bar. See `announce` on the
   * actions context for why an editor needs it and why it is not locked.
   *
   * `setAnnouncement` itself is deliberately not published: a setter is a
   * channel anything could write anything to, while this is one function with
   * one documented job, and it keeps every write to the region in this file.
   */
  const announce = React.useCallback((message: string) => {
    if (!message) return
    setAnnouncement(message)
  }, [setAnnouncement])

  /**
   * The draft is a MUTATION in progress, so it is locked with the rest.
   *
   * `close` is the exception, and it has to be: a panel that was open when the
   * bar became read only still has to be dismissible, and the commit effect
   * below closes through the raw dispatch for the same reason.
   */
  const dispatchDraft = React.useCallback(
    (action: FilterDraftAction<V>) => {
      if (action.type !== "close" && locked()) return
      dispatchDraftRaw(action)
    },
    [locked]
  )

  const openCreate = React.useCallback(() => {
    if (locked()) return
    dispatchDraftRaw({ type: "openCreate" })
  }, [locked])

  const openAmend = React.useCallback(
    (id: string, step: FilterDraftStep) => {
      if (locked()) return
      const rule = findFilterRule(latest.current.queryRef.current, id)
      if (!rule) return
      dispatchDraftRaw({
        type: "openAmend",
        ruleId: id,
        step,
        path: rule.path,
        operator: rule.operator,
        value: rule.value,
      })
    },
    [locked]
  )

  const closeDraft = React.useCallback(
    () => dispatchDraftRaw({ type: "close" }),
    []
  )

  const getQuery = React.useCallback(() => latest.current.queryRef.current, [])
  const getDraft = React.useCallback(() => latest.current.draft, [])

  /* ------------------------- draft -> query commit ------------------------ */

  // The draft becomes a rule exactly once, when the reducer says it is ready.
  // Keeping that here rather than in each click handler is what lets the
  // "arity none skips the value step" branch live in the pure reducer.
  React.useEffect(() => {
    if (!draft || draft.status !== "ready") return
    if (!isFilterDraftCommittable(draft)) return

    if (draft.ruleId) {
      updateRule(draft.ruleId, {
        path: draft.path,
        operator: draft.operator ?? "",
        value: draft.value,
      })
    } else if (!locked()) {
      // Asked HERE as well as inside `addRule`, because this branch does two
      // things the boundary cannot undo for it: it burns an id, and it points
      // the focus store at that id. A store pointing at a chip that was never
      // created takes the row's single tab stop with it - no chip owns the
      // focused id, and the "nothing focused" fallback that would have made the
      // first chip the tab stop sees an id and stands down - so a refused add
      // would have cost a read-only row its keyboard entirely.
      const id = nextId()
      addRule(
        createFilterRule<V>({
          id,
          path: draft.path,
          // Deliberately empty: the chip renders "Select condition" and opens
          // its own operator menu.
          operator: "",
          value: undefined,
        })
      )
      focusStore.set({ id, segment: "operator", autoOpen: true })
    }
    dispatchDraftRaw({ type: "close" })
  }, [draft, addRule, updateRule, nextId, focusStore, locked])

  /* ---------------------------- dev diagnostics --------------------------- */

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const issues = findFilterSchemaIssues(fields, (field) =>
      resolveFilterOperators(field, operatorCatalog)
    )
    if (issues.duplicatePaths.length) {
      warnFilterOnce(
        `dup:${issues.duplicatePaths.join(",")}`,
        `duplicate sibling field ids are ignored after the first: ${issues.duplicatePaths.join(", ")}`
      )
    }
    if (issues.emptyIds.length) {
      warnFilterOnce("empty-id", "every field needs a non-empty id")
    }
    if (issues.unknownDefaultOperators.length) {
      warnFilterOnce(
        `op:${issues.unknownDefaultOperators.join(",")}`,
        `defaultOperator names an operator the field does not offer: ${issues.unknownDefaultOperators.join(", ")}`
      )
    }
  }, [fields, operatorCatalog])

  /* ------------------------------- contexts ------------------------------- */

  const actions = React.useMemo<FilterActionsContextValue<V, O>>(
    () => ({
      index,
      labels,
      operatorCatalog,
      editors,
      size,
      disabled,
      readOnly,
      variant,
      menuClassName,
      fieldPickerClassName,
      convertToAdvanced: onConvertToAdvanced,
      pathCollapse,
      maxPathSegments,
      resolveOperators,
      // The same lookup the chrome uses, closed over the merged registry, so
      // a headless consumer asks the context the question the chip answers.
      resolveEditor: (field, operator) =>
        resolveFilterEditor(field, operator, editors) as
          | FilterEditor<V, O>
          | undefined,
      resolution: resolutionStore,
      addRule,
      addGroup,
      updateRule,
      removeNode,
      duplicateNode,
      negateRule,
      moveNode,
      moveNodeTo,
      copyNodeTo,
      wrapNodeInGroup,
      unwrapGroup,
      setCombinator: setCombinatorAction,
      toggleCombinator: toggleCombinatorAction,
      clearQuery: clearQueryAction,
      openCreate,
      openAmend,
      closeDraft,
      dispatchDraft,
      announce,
      getQuery,
      getDraft,
      nextId,
    }),
    // `index`, `labels`, `operatorCatalog` and `editors` are all memoized on
    // their own content, and every action is `[]`-stable, so this republishes
    // only when the schema or a config prop genuinely changes - never on a
    // keystroke.
    [
      index,
      labels,
      operatorCatalog,
      editors,
      size,
      disabled,
      readOnly,
      variant,
      menuClassName,
      fieldPickerClassName,
      onConvertToAdvanced,
      pathCollapse,
      maxPathSegments,
      resolveOperators,
      resolutionStore,
      addRule,
      addGroup,
      updateRule,
      removeNode,
      duplicateNode,
      negateRule,
      moveNode,
      moveNodeTo,
      copyNodeTo,
      wrapNodeInGroup,
      unwrapGroup,
      setCombinatorAction,
      toggleCombinatorAction,
      clearQueryAction,
      openCreate,
      openAmend,
      closeDraft,
      dispatchDraft,
      announce,
      getQuery,
      getDraft,
      nextId,
    ]
  )

  const state = React.useMemo(
    () => ({ query, draft, ruleCount, announcement, announcementSeq: announced.seq }),
    [query, draft, ruleCount, announcement, announced.seq]
  )

  const renderContext = React.useMemo(
    () => ({ renderValue, renderChip, renderEmpty }),
    [renderValue, renderChip, renderEmpty]
  )

  return (
    <FilterActionsContext.Provider
      value={actions as unknown as FilterActionsContextValue}
    >
      <FilterStateContext.Provider value={state as never}>
        <FilterRenderContext.Provider value={renderContext as never}>
          <FilterRowStateProvider value={rowStateStore}>
          <FilterFocusContext.Provider value={focusStore}>
            {children ??
              (variant === "advanced" ? (
                <FiltersAdvanced<V, O>
                  mode={advancedMode}
                  align={advancedAlign}
                  trigger={trigger}
                  reorderable={reorderable}
                  className={className}
                />
              ) : (
                <FiltersRow
                  trigger={trigger}
                  showClear={showClear}
                  className={className}
                />
              ))}
          </FilterFocusContext.Provider>
          </FilterRowStateProvider>
        </FilterRenderContext.Provider>
      </FilterStateContext.Provider>
    </FilterActionsContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Row                                     */
/* -------------------------------------------------------------------------- */

export interface FiltersRowProps {
  trigger?: React.ReactNode
  showClear?: boolean
  className?: string
}

/**
 * The chip row.
 *
 * A toolbar with a roving tabindex, which the old primitive had no equivalent
 * of at all: its chips were a plain flex-wrap div where every segment of every
 * chip was its own tab stop, so tabbing through ten filters took forty presses
 * and there was no way to remove one from the keyboard.
 *
 * There is NO combinator here, and that is the design rather than an omission.
 * A chip row can draw one word between two pills; it cannot draw a parenthesis.
 * A joiner that flipped the root between AND and OR therefore offered the user
 * exactly one of the two structures they might want and silently misdescribed
 * every other, so the flat row commits to the honest one: an implicit AND. The
 * advanced builder is where a combinator has somewhere to live.
 */
export function FiltersRow({ trigger, showClear, className }: FiltersRowProps) {
  const actions = useFilterActions()
  const sizes = filterControlSizes(actions)
  const { query, ruleCount, announcement, announcementSeq } = useFilterState()
  const focusStore = useFilterFocusStore()
  const rootRef = React.useRef<HTMLDivElement>(null)
  /**
   * The keys below consult this even though the actions already refuse.
   *
   * Not belt and braces: an ungated Delete would still `preventDefault` a key
   * the bar is not going to act on, and an ungated Enter would ARM the focus
   * store's `autoOpen` handoff for a popover that now refuses to open, leaving
   * the flag standing until some other chip spent it. Navigation is untouched -
   * the arrows, Home and End are how a read-only bar is read.
   */
  const locked = isFilterLocked(actions)

  // Flattened, not `query.rules.filter(isFilterRule)`. A query built in the
  // advanced builder and then shown here would otherwise hide every nested
  // condition while it went on filtering, which is the one failure mode worse
  // than drawing a group as a flat run of chips.
  const rules = React.useMemo(() => flattenFilterRules(query), [query])

  const chips = () =>
    Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-slot="filter-chip"]') ??
        []
    )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-slot="filter-chip"]'
    )
    if (!target) return
    // Only the chip itself takes these keys. A key pressed inside an open
    // popover belongs to that popover.
    if (event.target !== target) return

    const all = chips()
    const current = all.indexOf(target)
    if (current === -1) return

    const rtl = getComputedStyle(target).direction === "rtl"
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const backward = rtl ? "ArrowRight" : "ArrowLeft"

    const focusAt = (index: number) => {
      const next = all[Math.max(0, Math.min(index, all.length - 1))]
      if (!next) return
      event.preventDefault()
      next.focus()
    }

    const ruleId = target.dataset.ruleId
    if (!ruleId) return

    if (event.altKey && (event.key === forward || event.key === backward)) {
      if (locked) return
      event.preventDefault()
      actions.moveNode(ruleId, event.key === forward ? 1 : -1)
      return
    }
    if (event.key === forward) return focusAt(current + 1)
    if (event.key === backward) return focusAt(current - 1)
    if (event.key === "Home") return focusAt(0)
    if (event.key === "End") return focusAt(all.length - 1)

    if (event.key === "Backspace" || event.key === "Delete") {
      if (locked) return
      event.preventDefault()
      actions.removeNode(ruleId)
      // Focus the neighbour that takes this chip's place, or the one before it
      // when the row ends here, so removing several in a row does not throw
      // focus back to the document.
      requestAnimationFrame(() => {
        const remaining = chips()
        remaining[Math.min(current, remaining.length - 1)]?.focus()
      })
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      if (locked) return
      event.preventDefault()
      // Enter RESUMES the chip, it does not restart it. The attribute segment
      // is display only (a chip's field is fixed), so the only two things Enter
      // could open are the condition and the value, and the right one is
      // whichever the flow has not got to: the condition while there is none,
      // the value once there is one and the operator takes one, and the
      // condition again for an operator that takes none, so the key always
      // opens something rather than doing nothing on "is empty".
      const rule = findFilterRule(actions.getQuery(), ruleId)
      if (!rule) return
      const field = getFilterField(actions.index, rule.path)
      // An unknown-field chip has no popover for the handoff to open, so a
      // consumed-by-nobody autoOpen flag would sit armed until some other chip
      // spent it. The chip stays reachable, and Delete still removes it.
      if (!field) return
      const operator = getFilterOperator(
        actions.resolveOperators(field),
        rule.operator
      )
      const segment =
        rule.operator && operatorTakesValue(operator) ? "value" : "operator"
      focusStore.set({ id: ruleId, segment, autoOpen: true })
    }
  }

  return (
    <div
      ref={rootRef}
      data-slot="filters"
      data-empty={rules.length === 0 || undefined}
      // A presence hook for the whole bar, so a consumer can tint a read-only
      // toolbar without asking every chip. The controls carry their own; this
      // one is the container's.
      data-readonly={actions.readOnly || undefined}
      className={cn(
        // `sizes.button` and not `actions.size`: the gap ladder and the control
        // ladder have to answer for the same rung, and `filterControlSizes` is
        // the one place a size TypeScript would have rejected is normalized.
        filtersBarVariants({ size: sizes.button }),
        // A cleared row starts flush at the left edge.
        //
        // The toolbar below is an element even with nothing in it, and an empty
        // flex child is still a flex child: it takes no width but it does take
        // a gap, so "Add filter" sat one gap in from the edge with no chip in
        // front of it to explain the indent.
        //
        // The gap goes rather than the toolbar. Unmounting it would take the
        // roving-tabindex container and the row's accessible name with it, so
        // the row would stop being a toolbar at all for the exact stretch a
        // screen reader user is most likely to be looking for one. Nothing
        // shifts when the first chip arrives that would not have shifted
        // anyway: the gap comes back with the chip that earns it.
        rules.length === 0 && "gap-0",
        className
      )}
    >
      <div
        role="toolbar"
        aria-label={actions.labels.filtersLabel}
        aria-orientation="horizontal"
        // How a READ-ONLY bar says so. Not `aria-readonly`, which `role=toolbar`
        // does not allow, and not `aria-disabled`, which would say the row
        // cannot be operated when arrowing across it is exactly what it is for.
        // A description is the one slot that is both legal here and spoken on
        // entry, and it is the slot the drag handle already uses for its own
        // keyboard hint.
        {...(actions.readOnly
          ? { "aria-description": actions.labels.readOnly }
          : null)}
        className={cn(filtersBarVariants({ size: sizes.button }))}
        onKeyDown={onKeyDown}
      >
        {rules.map((rule, index) => (
          <FilterChip key={rule.id} rule={rule} index={index} />
        ))}
      </div>

      <FiltersBuilder trigger={trigger} />

      {showClear && ruleCount > 0 ? (
        // Pushed to the trailing edge, so Clear reads as the toolbar's one
        // destructive action rather than as another chip in the row. `ms-auto`
        // rather than `ml-auto` keeps it on the correct edge under RTL, where
        // the whole bar mirrors.
        <Button
          variant="outline"
          // The same rung as the Add filter trigger beside it. It carried no
          // size at all, so a bar at `size="sm"` drew a `sm` trigger and a
          // `default` Clear next to it.
          size={sizes.button}
          className="ms-auto"
          // It had no gate at all, so a disabled bar could still be emptied
          // with one click. `disabled` for the hard flag, `aria-disabled` for
          // the soft one, so the button keeps its tab stop while read only and
          // a keyboard user can still find out that clearing exists.
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={() => actions.clearQuery()}
        >
          {actions.labels.clear}
        </Button>
      ) : null}

      {/*
        Keyed on the sequence, so the SAME sentence twice is still two
        announcements. See `announcementSeq` for the measurement; the span is
        inside the region rather than being it, because replacing a live element
        is how a region stops being watched.
      */}
      <div aria-live="polite" role="status" className="sr-only">
        <span key={announcementSeq}>{announcement}</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Exports                                  */
/* -------------------------------------------------------------------------- */

// The full pure READ surface, so a consumer who installs the package reaches
// everything a predicate, a saved view or a backend query needs from ONE
// import. The deep imports remain valid; this is the convenience convention,
// not a replacement for it.
//
// It stops at the query TREE and deliberately compiles nothing. There is no SQL
// emitter here any more, and the reason is the one that applies to every target
// equally: a filter bar runs in a browser, so anything it emits can only reach
// a database through a server that has to re-validate it before running it, and
// a server holding the JSON tree should compile from the tree rather than parse
// a string a client handed it. `flattenFilterConditions` is that hand-off, and
// SQL is one target of it beside Prisma, Drizzle, a REST query string and
// Elasticsearch - none of which this primitive is better placed to write than
// the code that owns the schema.
export {
  // The whole issue list, and it is here because the panel no longer DRAWS the
  // built-in reasons: calling this yourself is the only way to surface
  // "missing value", "empty group" and the rest, so the one function the
  // validation change newly requires cannot be the one the barrel forgets.
  collectFilterIssues,
  copyFilterNodeTo,
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
  countFilterRules,
  flattenFilterConditions,
  flattenFilterRules,
  isFilterQueryEmpty,
  isFilterRuleComplete,
  moveFilterNodeTo,
  pruneFilterQuery,
  unwrapFilterGroup,
  wrapFilterNodeInGroup,
} from "@pi-dash/design-system/components/reui/filters/filters-query"

// The two resolver signatures `collectFilterIssues` takes, so a consumer
// writing their own can name the parameter types from the same import.
export type {
  FilterArityResolver,
  FilterValidateResolver,
} from "@pi-dash/design-system/components/reui/filters/filters-query"

export {
  // The two halves of the read-only contract, for a consumer-composed chrome:
  // the predicate every mutator is gated on, and the props a mutating control
  // wears while the bar refuses to be changed.
  filterReadOnlyProps,
  isFilterLocked,
  useFilterActions,
  useFilterState,
  useFilterFocus,
  // The focus-store selectors a custom chip needs to rebuild the roving
  // scheme `renderChip` replaces: which chip owns the tab stop, which segment
  // should open itself, and the store to write back into.
  useFilterChipAutoOpen,
  useFilterChipFocused,
  useFilterFocusEmpty,
  useFilterFocusStore,
  useFilterRender,
  useFilterSegmentFocus,
} from "@pi-dash/design-system/components/reui/filters/filters-context"

export {
  FilterChip,
  FilterOperatorPopover,
  FilterRuleMenuItems,
  FilterValuePopover,
  useFilterRuleDisplay,
} from "@pi-dash/design-system/components/reui/filters/filters-chip"
export {
  FiltersAdvanced,
  FiltersAdvancedPanel,
  FilterAdvancedRow,
} from "@pi-dash/design-system/components/reui/filters/filters-advanced"
export {
  FiltersBuilder,
  FilterFieldPicker,
} from "@pi-dash/design-system/components/reui/filters/filters-builder"
export { DEFAULT_FILTER_LABELS } from "@pi-dash/design-system/components/reui/filters/filters-i18n"
export {
  DEFAULT_FILTER_OPERATORS,
  DEFAULT_FILTER_OPERATOR_LABELS,
} from "@pi-dash/design-system/components/reui/filters/filters-operators"
export {
  DEFAULT_FILTER_EDITORS,
  useFilterOptions,
  useFilterValueResolution,
} from "@pi-dash/design-system/components/reui/filters/filters-editors"

export type * from "@pi-dash/design-system/components/reui/filters/filters-types"
