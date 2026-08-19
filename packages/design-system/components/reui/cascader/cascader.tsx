// @ts-nocheck
"use client"

import * as React from "react"
import {
  useCascaderLoader,
  useCascaderLoadState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-async"
import type {
  CascaderGetChildren,
  CascaderOnSearch,
  CascaderResolveValue,
} from "@pi-dash/design-system/components/reui/cascader/cascader-async"
import {
  CascaderActionsContext,
  CascaderHighlightContext,
  CascaderRenderContext,
  CascaderStateContext,
  createCascaderHighlightStore,
  useCascaderActions,
  useCascaderHighlight,
  useCascaderRender,
  useCascaderState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import type {
  CascaderActionsContextValue,
  CascaderColumn,
  CascaderHighlight,
  CascaderHighlightStore,
  CascaderItemState,
  CascaderRenderContextValue,
  CascaderStateContextValue,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import { resolveCascaderLabels } from "@pi-dash/design-system/components/reui/cascader/cascader-i18n"
import {
  applyCascadeSelection,
  buildCascaderIndex,
  CASCADER_LIST_HEIGHT_CLASS,
  CASCADER_LIST_PAD_CLASS,
  CASCADER_ROOT_KEY,
  CASCADER_ROWS_CLASS,
  CASCADER_SCROLL_CLASS,
  collapseCascaderPath,
  createCascaderMoreNode,
  filterCascaderLevel,
  findAmbiguousCascaderLabels,
  findCascaderDataIssues,
  flattenCascaderTree,
  getCascaderCheckedValues,
  getCascaderChildren,
  getCascaderCount,
  getCascaderIndeterminateFrom,
  getCascaderPath,
  getCascaderSelectedDescendants,
  getCascaderTabTarget,
  isCascaderBranch,
  isCascaderMoreNode,
  isCascaderSelectable,
  matchesCascaderQuery,
  mergeCascaderIndex,
  normalizeCascaderQuery,
  searchCascaderDeep,
  warnCascaderOnce,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type { CascaderCheckedStrategy } from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type {
  CascaderActionItem,
  CascaderChangeDetails,
  CascaderChangeReason,
  CascaderFlatNode,
  CascaderIndex,
  CascaderLabels,
  CascaderLoadState,
  CascaderMode,
  CascaderNode,
  CascaderSearchScope,
  CascaderSelectable,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@pi-dash/design-system/lib/utils"
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

/**
 * Stable empty array. Used as the intermediate `filteredItems` value during a
 * level swap, so the identity never changes and the swap cannot loop.
 */
const EMPTY: CascaderNode<never>[] = []

/** Stable empty array for the `actions` prop, for the same reason. */
const EMPTY_ACTIONS: CascaderActionItem[] = []

/**
 * Word joiner: invisible, zero width, and not spoken.
 *
 * A polite live region only announces a TEXT MUTATION, so navigating from one
 * level to another that happens to describe itself identically stays silent.
 * Appending this on alternate navigations makes every one of them a mutation
 * without changing a single spoken word or shifting layout.
 */
const ANNOUNCE_MARKER = "\u2060"

/**
 * How long a query result-count announcement waits before it is committed to
 * the live region.
 *
 * A screen reader queues polite announcements, so a count re-announced on
 * every keystroke floods the queue and the user hears a backlog of stale
 * numbers long after they stopped typing. Only the result-count path defers;
 * everything event-shaped - a level change, a load settling, a refusal - still
 * announces immediately, because those describe one action rather than a
 * stream of them.
 */
const ANNOUNCE_DEBOUNCE = 150

/* -------------------------------------------------------------------------- */
/*                                   State                                    */
/* -------------------------------------------------------------------------- */

/**
 * Minimal controlled/uncontrolled resolver. The repo has no shared
 * `useControllableState`, and the root needs the same shape five times (value,
 * path, expanded, open, inputValue), so it lives here rather than being
 * hand-rolled per prop.
 */
function useControllable<V>(
  controlled: V | undefined,
  defaultValue: V,
  onChange?: (value: V) => void,
  /** Prop name, used only by the development-time switching warning. */
  devName?: string
): [V, (next: V | ((prev: V) => V)) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const isControlled = controlled !== undefined
  const value = isControlled ? controlled : uncontrolled

  /**
   * Switching a prop between controlled and uncontrolled mid-life silently
   * strands the other half of the state: the first update after the switch
   * reads from whichever source is no longer authoritative. React warns about
   * this for its own inputs and nothing warns about it here.
   *
   * Written from an EFFECT, never during render, for the same reason every
   * other ref in this file is.
   */
  const wasControlled = React.useRef(isControlled)
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (wasControlled.current === isControlled || !devName) return
    const from = wasControlled.current ? "controlled" : "uncontrolled"
    const to = isControlled ? "controlled" : "uncontrolled"
    wasControlled.current = isControlled
    warnCascaderOnce(
      `controlled-switch:${devName}`,
      `\`${devName}\` switched from ${from} to ${to}. Decide once: pass \`${devName}\` for the whole life of the component, or pass only the default and let the cascader own it.`
    )
  }, [isControlled, devName])

  // Latest committed props/state, written in an EFFECT rather than during
  // render. Writing refs during render is unsafe under concurrent rendering:
  // a render that React throws away would still have mutated them.
  const latest = React.useRef({ value, isControlled, onChange })
  React.useEffect(() => {
    latest.current = { value, isControlled, onChange }
  })

  // The last PROP value the sync effect saw - what the parent actually
  // COMMITTED, as opposed to the optimistic advance below, which records what
  // it was merely told. The two disagree exactly when a controlled parent
  // declines a change and re-renders nothing.
  const lastProp = React.useRef(controlled)
  React.useEffect(() => {
    lastProp.current = controlled
  })

  const set = React.useCallback((next: V | ((prev: V) => V)) => {
    const current = latest.current.value
    const resolved =
      typeof next === "function" ? (next as (prev: V) => V)(current) : next
    if (Object.is(resolved, current)) {
      // Controlled props dedup against the last PROP the sync effect saw, not
      // against the optimistic advance alone. A parent that declined the
      // previous change (a confirm-before-close popup ignoring the first
      // `onOpenChange(false)`) re-renders nothing, so the advance keeps saying
      // the change happened while the prop says it did not - and deduping on
      // the advance swallowed every repeat of the request, which made the
      // popup un-dismissable from the second Escape on.
      if (
        !latest.current.isControlled ||
        Object.is(resolved, lastProp.current)
      ) {
        return
      }
    }

    // Advance the ref immediately so two updates inside ONE batch compose.
    // Without this the second call reads a value that is a render behind and
    // its Object.is dedup silently drops the update. Mutating a ref from an
    // event handler is safe; mutating one during render is not.
    latest.current = { ...latest.current, value: resolved }

    if (!latest.current.isControlled) setUncontrolled(resolved)
    latest.current.onChange?.(resolved)
  }, [])

  return [value, set]
}

/* -------------------------------------------------------------------------- */
/*                              Shallow stability                             */
/* -------------------------------------------------------------------------- */

/** Same own keys, `Object.is`-equal values. */
function shallowEqualRecords(a: object, b: object): boolean {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  for (const key of keys) {
    if (!Object.is(left[key], right[key])) return false
  }
  return true
}

/** Same length, each item the same object or a shallow-equal one. */
function shallowEqualItemLists(
  a: readonly object[],
  b: readonly object[]
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i] && !shallowEqualRecords(a[i], b[i])) return false
  }
  return true
}

/**
 * Reuses the previous value while the next one is merely a fresh object saying
 * the same thing.
 *
 * `labels` and `actions` are near-universally written INLINE at the call site,
 * so their identity changes on every parent render - and both feed the actions
 * context, which every memoised row subscribes to. Without this, an inline
 * `labels={{ empty: "..." }}` republished that context and re-rendered every
 * row in the level each time the parent rendered for any reason at all.
 *
 * Implemented as the adjust-state-during-render pattern rather than a ref:
 * when the incoming value REALLY changed, `setStable` during render makes
 * React restart this component's render immediately with the new state, which
 * is the documented mechanism for state derived from props - and unlike a
 * render-phase ref write it survives the lint rule and Strict Mode's replay
 * with nothing to reason about.
 */
function useShallowStable<V>(
  value: V,
  equal: (a: V & object, b: V & object) => boolean
): V {
  const [stable, setStable] = React.useState(value)
  if (Object.is(value, stable)) return stable
  const comparable =
    typeof value === "object" &&
    value !== null &&
    typeof stable === "object" &&
    stable !== null
  if (comparable && equal(value as V & object, stable as V & object)) {
    // A fresh object saying the same thing: keep the committed identity.
    return stable
  }
  // A real change: commit it and hand the CURRENT render the new value.
  setStable(value)
  return value
}

/* -------------------------------------------------------------------------- */
/*                                  Context                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pre-split context shape: the stable half and the volatile half merged
 * back into one object.
 *
 * Kept so `useCascader()` still hands back exactly what it always did. The two
 * halves are disjoint apart from `index`, which both publish from the same
 * `useMemo` and so with the same identity.
 */
export interface CascaderContextValue<T = unknown>
  extends CascaderActionsContextValue<T>, CascaderStateContextValue<T> {}

/**
 * The cascader's internals, typed for the caller's own item payload.
 *
 * @deprecated Subscribe to the half you actually need instead:
 * `useCascaderActions()` for configuration and callbacks, `useCascaderState()`
 * for the query, the path, the selection and the derived rows. This hook reads
 * BOTH, so anything calling it re-renders on every keystroke - which is exactly
 * what the split exists to avoid. It stays for backwards compatibility and is
 * not going away.
 */
export function useCascader<T = unknown>(): CascaderContextValue<T> {
  const actions = useCascaderActions<T>()
  const state = useCascaderState<T>()

  return React.useMemo(() => ({ ...actions, ...state }), [actions, state])
}

/* -------------------------------------------------------------------------- */
/*                              Headless selection                            */
/* -------------------------------------------------------------------------- */

/** Everything a custom trigger needs, with no opinion about how it looks. */
export interface CascaderSelection<T = unknown> {
  /** The selected nodes, resolved. Empty when nothing is selected. */
  selected: CascaderNode<T>[]
  /** Ancestor chain per selected node, root first, node last. */
  paths: CascaderNode<T>[][]
  /** The single selection, or the first one in `multiple` mode. */
  first: CascaderNode<T> | null
  /** Ancestor chain of `first`. */
  firstPath: CascaderNode<T>[]
  count: number
  isEmpty: boolean
  multiple: boolean
  /** Deselects one node. */
  remove: (value: string) => void
  /** Deselects everything. */
  clear: () => void
}

/**
 * Headless access to the current selection.
 *
 * `CascaderValue` is a convenience built on this. Reach for the hook when the
 * trigger needs to be something else entirely - chips with remove buttons, a
 * table cell, an avatar stack - so you never have to fight a render prop to get
 * at the resolved nodes and their paths.
 *
 * Pass the item payload explicitly - `useCascaderSelection<Member>()` - to get
 * `node.data` typed. A hook that takes no arguments has nothing to infer from.
 */
export function useCascaderSelection<T = unknown>(): CascaderSelection<T> {
  const { multiple, setSelection } = useCascaderActions<T>()
  const { index, selectedValues } = useCascaderState<T>()

  return React.useMemo(() => {
    const selected = selectedValues
      .map((value) => index.byValue.get(value))
      .filter(Boolean) as CascaderNode<T>[]
    const paths = selectedValues.map((value) => getCascaderPath(index, value))

    return {
      selected,
      paths,
      first: selected[0] ?? null,
      firstPath: paths[0] ?? [],
      count: selectedValues.length,
      isEmpty: selectedValues.length === 0,
      multiple,
      remove: (value: string) =>
        setSelection(selectedValues.filter((entry) => entry !== value)),
      // Explicit reason: emptying the selection on purpose is not the same
      // event as deselecting whatever happened to be the last node left.
      clear: () => setSelection([], "clear"),
    }
  }, [index, selectedValues, multiple, setSelection])
}

/* -------------------------------------------------------------------------- */
/*                                    Root                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why the navigation path changed.
 *
 * - `"drill"`: a branch was entered - a row press, the level arrow key, or a
 *   deep-search hit rebuilding the trail.
 * - `"back"`: one level up - the back control, or Backspace on an empty query.
 * - `"breadcrumb"`: a jump to an exact depth in the trail.
 * - `"reveal"`: the reopen navigated to the level holding the selection.
 * - `"external"`: `setPath` was called from outside the primitive's own flows.
 */
export type CascaderPathChangeReason =
  | "drill"
  | "back"
  | "breadcrumb"
  | "reveal"
  | "external"

/**
 * Everything that does not depend on the selection mode.
 *
 * The mode-dependent half - `value`, `defaultValue`, `onValueChange`, `max` -
 * lives on the two arms below, so a single-select cascader hands back a
 * `string` and a multi-select one a `string[]`, with no union for the consumer
 * to narrow at every call site.
 */
export interface CascaderBaseProps<T = unknown> {
  /** Nested tree, or a flat list when `getParent` is supplied. */
  items: CascaderNode<T>[]
  /** Opt in to flat adjacency input by returning each node's parent value. */
  getParent?: (node: CascaderNode<T>) => string | null | undefined

  /**
   * Fetches one level on demand. `node` is `null` for the root level.
   *
   * Return an array, or a `CascaderLoadResult` when the level pages. Loaded
   * pages are cached separately from `items` and merged on top of it, so a new
   * `items` array never discards them. Mark unfetched branches with
   * `hasChildren`, or they render as selectable leaves.
   */
  getChildren?: CascaderGetChildren<T>
  /**
   * Server-side search. Replaces the local index scan while the query is set,
   * and is debounced by `searchDebounce`.
   *
   * Results are resolvable by value but belong to no level, so they never
   * appear in a level list and never show up twice in a deep search.
   *
   * Ignored in `mode="tree"`, where a query filters the loaded tree in place
   * and a server hit belongs to no visible branch - the request would fire on
   * every keystroke and its results would never render.
   */
  onSearch?: CascaderOnSearch<T>
  /** Milliseconds of quiet before `onSearch` fires. */
  searchDebounce?: number
  /**
   * Resolves a selected value the loader has never seen into its ancestor
   * chain, root first and the node itself last, so the trigger can render the
   * full path for a selection that arrived from a server rather than from a
   * drill-in.
   *
   * The chain is placed WITHOUT marking those levels as loaded, so opening one
   * still fetches it for real.
   */
  resolveValue?: CascaderResolveValue<T>
  /**
   * Cache key for everything loaded. Changing it drops every cached page, load
   * state and resolved node, and aborts anything in flight. Change it when the
   * data source itself changes - a different tenant, a different filter.
   */
  loadKey?: unknown
  /**
   * Speculatively fetch a branch's children while it is merely highlighted,
   * after a short pause. Off by default: it trades requests for latency.
   */
  prefetch?: boolean
  /**
   * Called when a load fails, alongside the error state the panel already
   * shows - for logging, toasts, retry telemetry. `context.parent` is the
   * level that failed (`null` for the root), and `context.reason` is what
   * asked for it: `"level"`, `"more"`, `"retry"`, `"prefetch"`, `"search"` or
   * `"resolve"`. Never called for a request that was aborted or superseded -
   * those are not failures, they are navigation.
   */
  onLoadError?: (
    error: unknown,
    context: { parent: string | null; reason: string }
  ) => void

  /** Which nodes may be committed. Defaults to leaves only. */
  selectable?: CascaderSelectable<T>

  /**
   * Whether the built-in SINGLE-SELECT check is drawn. Defaults to true.
   *
   * `indicator={false}` removes the check element AND gives back the inline-end
   * gutter every style reserves for it, so a row's trailing content - a count,
   * a chevron, a badge - ends exactly where the label starts on the other edge
   * instead of stopping one gutter short of it. Reach for it when the picker
   * marks selection some other way: a tinted row, a filled leading tile, a
   * bolder label. `data-selected` stays on the row in every mode, which is what
   * those treatments are painted from.
   *
   * DELIBERATELY scoped to the single-select check. In `multiple` mode the
   * checkbox is the selection CONTROL rather than a decoration - it is what
   * shows and toggles state - so this prop is a no-op there and the box and its
   * gutter both stay. A multi-select tree is unaffected for the separate reason
   * that its box already leads the row and reserves no gutter at all.
   *
   * Accessibility is untouched either way: `aria-selected` is Base UI's and
   * stays on every row. Only the visual mark goes away.
   */
  indicator?: boolean

  /**
   * Footer ACTIONS: commands pinned below the list, never rows in it.
   *
   * The quick path for `CascaderFooter`. Render `<CascaderFooter />` with no
   * children and it draws these; give it children and it draws those instead,
   * so a consumer can compose `CascaderAction` and `CascaderSubmenu` by hand
   * without giving up the footer's layout.
   *
   * An action with `items` opens a side-anchored flyout rather than firing.
   * None of this touches the data tree: drill, columns and tree stay the only
   * ways to move through it.
   */
  actions?: CascaderActionItem[]

  /**
   * Parent/child cascading. Multi-select only, and off by default so nothing
   * changes for an existing consumer.
   *
   * Committing a node also selects (or deselects) every SELECTABLE node in its
   * LOADED subtree, and then reconciles its ancestors: a branch's value is in
   * the selection exactly when every selectable loaded child of it is, and a
   * branch with some but not all of its subtree selected renders indeterminate.
   *
   * The loaded qualifier is not a hedge, it is the semantic. A subtree that has
   * not been fetched cannot be selected without fetching it, and a commit must
   * not fan out into a request per level. Children that arrive AFTER a branch
   * was selected are therefore not selected: the branch stays checked and the
   * new rows arrive unchecked, which is visible rather than silent. The next
   * toggle anywhere in that subtree reconciles over the larger loaded set and
   * the branch corrects itself.
   *
   * Requires branches to be committable - pair it with `selectable="any"` or a
   * predicate. With the default `selectable="leaf"` a branch can never be
   * pressed, so nothing would ever cascade.
   */
  cascade?: boolean

  mode?: CascaderMode

  /**
   * How a branch row in columns mode's ACTIVE column opens from the pointer:
   * `"click"` (the default) on a press only, `"hover"` after the pointer has
   * rested on the row for a beat. Drill and tree ignore it, and it never
   * commits a selection.
   */
  expandTrigger?: "click" | "hover"

  path?: string[]
  defaultPath?: string[]
  /**
   * The second argument says WHY the path moved. Optional at the consumer -
   * an existing `(path) => void` keeps compiling and keeps working.
   */
  onPathChange?: (
    path: string[],
    details: { reason: CascaderPathChangeReason }
  ) => void

  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (expanded: string[]) => void

  open?: boolean
  defaultOpen?: boolean
  /**
   * `details.reason` forwards Base UI's own reason string (`"escape-key"`,
   * `"outside-press"`, ...); the close a leaf commit performs reports
   * `"item-press"`. Optional at the consumer, so `(open) => void` still works.
   */
  onOpenChange?: (open: boolean, details: { reason: string }) => void

  /**
   * Whether a SINGLE-SELECT leaf commit closes the popup. Defaults to true.
   *
   * `false` keeps the panel open after a pick, for a compare-and-repick flow
   * where the popup is the workspace. Escape, outside presses and the trigger
   * still close it exactly as before. `multiple` mode ignores this prop
   * entirely: a multi-select already stays open on every commit, because
   * closing after the first pick would make a second one impossible.
   */
  closeOnSelect?: boolean

  inputValue?: string
  defaultInputValue?: string
  onInputValueChange?: (value: string) => void

  searchScope?: CascaderSearchScope
  /** Custom matcher, replacing label + keywords substring matching. */
  filter?: (node: CascaderNode<T>, normalizedQuery: string) => boolean

  /**
   * On open, navigate to the level holding the current selection. Defaults to
   * true. Turn it off to always reopen at the root.
   */
  revealSelected?: boolean

  maxHeight?: number | string

  /**
   * Window the rendered rows.
   *
   * `undefined` (the default) decides per level from `virtualizeThreshold`,
   * `true` always windows and `false` never does. Windowing itself is opt-in at
   * the markup level: it only happens where a `CascaderVirtualItems` or
   * `CascaderVirtualColumn` is mounted, so the base install never pulls in a
   * virtualization library.
   */
  virtualize?: boolean
  /** Row count at which windowing turns itself on. */
  virtualizeThreshold?: number
  /** Row height handed to the virtualizer before a row has been measured. */
  estimateRowSize?: number
  /** Rows rendered beyond each edge of the viewport. */
  overscan?: number

  labels?: Partial<CascaderLabels>
  /**
   * Replaces the entire row, affordances included. Use when the row is nothing
   * like the default.
   */
  renderItem?: (
    node: CascaderNode<T>,
    state: CascaderItemState<T>
  ) => React.ReactNode
  /**
   * Replaces only the label block, keeping the icon, count, chevron and check.
   * This is the one to reach for most of the time.
   */
  renderLabel?: (
    node: CascaderNode<T>,
    state: CascaderItemState<T>
  ) => React.ReactNode

  disabled?: boolean
  /** Native form field name. Submits the selected value(s). */
  name?: string
  /**
   * Id of the form that owns the hidden input. For a cascader rendered outside
   * the `<form>` it submits to.
   */
  form?: string
  /** Id of the control. Pairs the field with a `<label htmlFor>`. */
  id?: string
  /** Marks the field required for native form validation. */
  required?: boolean
  /** The value can be read and submitted, but not changed. */
  readOnly?: boolean
  /**
   * Marks the field invalid. Sets `aria-invalid` and `data-invalid` on the
   * trigger, the chips container and the search input, which is what every
   * style's error treatment is keyed on.
   *
   * A boolean rather than a message: the message belongs next to the field, in
   * whatever `Field`/`FormMessage` the form library already renders.
   */
  invalid?: boolean
  /**
   * Ref to the hidden input Base UI submits with. This is the element a form
   * library focuses when it reports an error on this field.
   */
  inputRef?: React.Ref<HTMLInputElement>
  /**
   * Renders without a floating popup, for an embedded `CascaderPanel` in a
   * sidebar, a dialog body or a page.
   */
  inline?: boolean

  children?: React.ReactNode
}

/** Single-select props. One value in, one value out. */
export interface CascaderSingleProps<T = unknown> extends CascaderBaseProps<T> {
  multiple?: false
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: CascaderChangeDetails<T>) => void
  /**
   * Not available in single-select mode - there is nothing to cap. Typed as
   * `never` so passing it is a compile error rather than a silent no-op.
   */
  max?: never
}

/** Multi-select props. Enables checkbox rows and chip display. */
export interface CascaderMultipleProps<
  T = unknown,
> extends CascaderBaseProps<T> {
  multiple: true
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[], details: CascaderChangeDetails<T>) => void
  /** Cap on selections. Further picks are refused, the existing ones survive. */
  max?: number
}

/**
 * `multiple` discriminates the two arms, so `value`, `defaultValue`,
 * `onValueChange` and `max` all narrow together off that one flag.
 */
export type CascaderProps<T = unknown> =
  | CascaderSingleProps<T>
  | CascaderMultipleProps<T>

/**
 * Normalizes the selection to an array.
 *
 * The empty string is "no selection", not a selection of one unnamed node -
 * the uncontrolled single-select default is `""`, so without this the trigger
 * would resolve a synthetic empty node and render a blank chip instead of the
 * placeholder.
 */
function toArray(value: string | string[] | undefined): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.filter((entry) => entry !== "")
  return value === "" ? [] : [value]
}

/* -------------------------------------------------------------------------- */
/*                            Development warnings                            */
/* -------------------------------------------------------------------------- */

/** Everything the dev-time scan below looks at. */
interface CascaderDevOptions<T> {
  items: CascaderNode<T>[]
  getParent?: (node: CascaderNode<T>) => string | null | undefined
  mode: CascaderMode
  multiple: boolean
  cascade: boolean
  indicator: boolean
  selectable: CascaderSelectable<T>
  searchScope: CascaderSearchScope
  max: number | undefined
  value: string | string[] | undefined
  defaultValue: string | string[] | undefined
  hasExpanded: boolean
  hasPath: boolean
  hasOnSearch: boolean
}

/**
 * The mistakes that cost an afternoon because nothing says a word about them.
 *
 * Every one of these is SILENT at runtime by design - the primitive degrades
 * rather than throwing - which is exactly why each needs a development-time
 * voice. They warn once per occurrence, never in production, and never throw:
 * a warning that takes the page down is worse than the bug it describes.
 *
 * Runs from an effect rather than during render, so a render React discards
 * cannot emit one, and so the check is off the hot path entirely.
 */
function useCascaderDevWarnings<T>(options: CascaderDevOptions<T>) {
  const {
    items,
    getParent,
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value,
    defaultValue,
    hasExpanded,
    hasPath,
    hasOnSearch,
  } = options

  // Scanning the raw input is O(n) and only ever worth paying in development,
  // so the memo is skipped outright in production rather than merely unused.
  const issues = React.useMemo(
    () =>
      process.env.NODE_ENV === "production"
        ? null
        : findCascaderDataIssues(items, getParent),
    [items, getParent]
  )

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    for (const duplicate of issues?.duplicates ?? []) {
      warnCascaderOnce(
        `duplicate-value:${duplicate}`,
        `Duplicate node value ${JSON.stringify(duplicate)}. \`value\` is the selection key, so only the first occurrence is indexed and the rest never render.`
      )
    }

    for (const cycle of issues?.cycles ?? []) {
      warnCascaderOnce(
        `cycle:${cycle}`,
        `\`getParent\` puts ${JSON.stringify(cycle)} on a cycle. The depth walk is cycle-guarded so nothing hangs, but every depth on that chain is clamped rather than derived.`
      )
    }
  }, [issues])

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    // The selection shape and the mode flag disagreeing is the single most
    // common way to end up with a trigger that renders nothing at all.
    for (const [prop, current] of [
      ["value", value],
      ["defaultValue", defaultValue],
    ] as const) {
      if (current == null) continue
      if (multiple && !Array.isArray(current)) {
        warnCascaderOnce(
          `value-shape:multiple:${prop}`,
          `\`multiple\` is set but \`${prop}\` is a string. Multi-select reads and writes a \`string[]\`; a string is treated as no selection at all.`
        )
      } else if (!multiple && Array.isArray(current)) {
        warnCascaderOnce(
          `value-shape:single:${prop}`,
          `\`${prop}\` is an array but \`multiple\` is not set. Single-select reads and writes a \`string\`; only the first entry would survive a commit.`
        )
      }
    }

    if (cascade && !multiple) {
      warnCascaderOnce(
        "cascade-without-multiple",
        "`cascade` does nothing without `multiple`: a single selection has no subtree to propagate over."
      )
    }

    if (cascade && selectable === "leaf") {
      warnCascaderOnce(
        "cascade-with-leaf-selectable",
        '`cascade` does nothing while `selectable="leaf"`: no branch can be committed, so no commit ever has a subtree under it. Pass `selectable="any"` or a predicate that accepts branches.'
      )
    }

    if (!indicator && multiple) {
      warnCascaderOnce(
        "indicator-false-with-multiple",
        "`indicator={false}` does nothing with `multiple`: the checkbox is the selection control rather than a decoration, so it and its gutter stay. Mark selection your own way from `data-selected` on the row, and drop the prop."
      )
    }

    if (max != null && !multiple) {
      warnCascaderOnce(
        "max-without-multiple",
        "`max` does nothing without `multiple`: there is only ever one selection to cap."
      )
    }

    if (hasExpanded && mode !== "tree") {
      warnCascaderOnce(
        `expanded-outside-tree:${mode}`,
        `\`expanded\` only does something in \`mode="tree"\`, and this cascader is in \`mode="${mode}"\`. Drill and columns navigate with \`path\`.`
      )
    }

    if (hasPath && mode === "tree") {
      warnCascaderOnce(
        "path-in-tree",
        '`path` does nothing in `mode="tree"`: branches expand in place rather than replacing the level. Use `expanded`.'
      )
    }

    if (searchScope === "deep" && mode === "tree") {
      warnCascaderOnce(
        "deep-search-in-tree",
        '`searchScope="deep"` does nothing in `mode="tree"`: a tree query already matches at any depth and auto-expands the ancestors of every hit.'
      )
    }

    if (hasOnSearch && mode === "tree") {
      warnCascaderOnce(
        "onsearch-in-tree",
        '`onSearch` does nothing in `mode="tree"`: a tree query filters the loaded tree in place, and a server hit belongs to no visible branch, so its results would never render. The request is not fired. Filter the tree locally, or use drill or columns for server search.'
      )
    }
  }, [
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value,
    defaultValue,
    hasExpanded,
    hasPath,
    hasOnSearch,
  ])
}

/**
 * Everything the `[]`-dep callbacks would otherwise have had to close over.
 *
 * Kept in one ref written by a single effect rather than one ref per value, so
 * there is exactly one place where "the last committed render" is defined.
 */
interface CascaderLatest<T> {
  index: CascaderIndex<T>
  state: CascaderStateContextValue<T>
  mode: CascaderMode
  multiple: boolean
  cascade: boolean
  max: number | undefined
  labels: CascaderLabels
  closeOnSelect: boolean
  selectedValues: string[]
  deepResults: CascaderNode<T>[] | null
  onValueChange:
    | ((value: string | string[], details: CascaderChangeDetails<T>) => void)
    | undefined
  resolveNode: (value: string) => CascaderNode<T>
  isSelectable: (node: CascaderNode<T>) => boolean
  /** See `needsChildren`. Read only from event handlers, like everything here. */
  needsChildren: (node: CascaderNode<T>) => boolean
  expanded: ReadonlySet<string>
}

/**
 * A navigation that is waiting on a fetch.
 *
 * `kind` is what the load resolves INTO, and the three forms are not
 * interchangeable: a drill appends, a columns press replaces the trail from
 * `depth`, and a tree press expands in place without touching `path` at all.
 */
interface CascaderPendingNavigation {
  value: string
  kind: "push" | "at" | "expand"
  /** `kind: "at"` only. The depth the pressed row belongs to. */
  depth: number
}

/**
 * No default on `T`: it is inferred from `items`, so `node.data` arrives typed
 * in `renderLabel`, `renderItem` and `onValueChange` without a type argument.
 */
function Cascader<T>({
  items,
  getParent,
  getChildren,
  onSearch,
  searchDebounce,
  resolveValue,
  loadKey,
  prefetch,
  onLoadError,
  value: valueProp,
  defaultValue,
  onValueChange: onValueChangeProp,
  multiple = false,
  selectable = "leaf",
  indicator = true,
  actions,
  cascade = false,
  max,
  mode = "drill",
  expandTrigger,
  path: pathProp,
  defaultPath,
  onPathChange,
  expanded: expandedProp,
  defaultExpanded,
  onExpandedChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  closeOnSelect = true,
  inputValue: inputValueProp,
  defaultInputValue = "",
  onInputValueChange,
  searchScope = "level",
  filter,
  revealSelected = true,
  maxHeight,
  virtualize,
  virtualizeThreshold = 100,
  estimateRowSize = 32,
  overscan = 8,
  labels: labelsProp,
  renderItem,
  renderLabel,
  disabled,
  name,
  form,
  id,
  required,
  readOnly,
  invalid,
  inputRef,
  inline,
  children,
}: CascaderProps<T>) {
  const baseIndex = React.useMemo(
    () => buildCascaderIndex(items, getParent),
    // `getParent` is treated as stable by design: rebuilding a 50k-node index
    // because a parent accessor was declared inline would defeat the purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  )

  const baseId = React.useId()

  // Shallow-stabilized before the memo: `labels` is near-universally an inline
  // object, and its raw identity would republish the actions context - and
  // with it every memoised row - on every parent render.
  const stableLabelsProp = useShallowStable(labelsProp, shallowEqualRecords)

  const labels = React.useMemo(
    () => resolveCascaderLabels(stableLabelsProp),
    [stableLabelsProp]
  )

  useCascaderDevWarnings({
    items,
    getParent,
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value: valueProp,
    defaultValue,
    hasExpanded:
      expandedProp !== undefined ||
      defaultExpanded !== undefined ||
      onExpandedChange !== undefined,
    hasPath:
      pathProp !== undefined ||
      defaultPath !== undefined ||
      onPathChange !== undefined,
    hasOnSearch: onSearch !== undefined,
  })

  /**
   * The public props are discriminated; the internals are not. One assertion
   * collapses the two callback arms into the single shape every emit below
   * uses, and `multiple` is what guarantees which one the consumer actually
   * declared. Doing it here keeps it to one place instead of one per call site.
   */
  const onValueChange = onValueChangeProp as
    | ((value: string | string[], details: CascaderChangeDetails<T>) => void)
    | undefined

  // Deliberately WITHOUT an `onChange`: `onValueChange` now takes a second
  // argument, so it is invoked by `emitSelection` rather than by the state
  // hook, which only knows how to pass a value.
  const [value, setValue] = useControllable<string | string[]>(
    valueProp,
    defaultValue ?? (multiple ? [] : ""),
    undefined,
    "value"
  )
  /**
   * Why the CURRENT path (or open) change is happening, read by the wrapped
   * callbacks below at the moment `useControllable` invokes them - which is
   * synchronous inside the setter, so a ref set just before the call is exact.
   *
   * Refs rather than arguments because `useControllable`'s onChange only knows
   * how to pass a value, and threading a second parameter through it would
   * complicate every prop for the two that need one. The path ref RESETS to
   * `"external"` after each internal navigation, so the raw `setPath` on the
   * actions context - the consumer-facing entry point - reports exactly that.
   */
  const pathReasonRef = React.useRef<CascaderPathChangeReason>("external")
  const openReasonRef = React.useRef<string>("none")

  const [path, setPath] = useControllable<string[]>(
    pathProp,
    defaultPath ?? [],
    (next) => onPathChange?.(next, { reason: pathReasonRef.current }),
    "path"
  )
  const [expandedList, setExpandedList] = useControllable<string[]>(
    expandedProp,
    defaultExpanded ?? [],
    onExpandedChange,
    "expanded"
  )
  const [open, setOpen] = useControllable<boolean>(
    openProp,
    defaultOpen,
    (next) => onOpenChange?.(next, { reason: openReasonRef.current }),
    "open"
  )

  /** The internal `setPath`: names its reason, then hands back to "external". */
  const setPathWithReason = React.useCallback(
    (
      next: string[] | ((prev: string[]) => string[]),
      reason: CascaderPathChangeReason
    ) => {
      pathReasonRef.current = reason
      try {
        setPath(next)
      } finally {
        pathReasonRef.current = "external"
      }
    },
    [setPath]
  )
  const [query, setQuery] = useControllable<string>(
    inputValueProp,
    defaultInputValue,
    onInputValueChange,
    "inputValue"
  )

  const expanded = React.useMemo(() => new Set(expandedList), [expandedList])
  const selectedValues = React.useMemo(() => toArray(value), [value])

  /* --------------------------------- async -------------------------------- */

  /**
   * The levels that are on screen, and therefore the ones worth fetching.
   *
   * Drill shows exactly one. Columns shows the whole open trail at once, which
   * is why the loader is per-level rather than one global "loading" flag. Tree
   * shows the root plus every expanded branch.
   */
  const levels = React.useMemo(() => {
    if (mode === "tree") return [CASCADER_ROOT_KEY, ...expandedList]
    if (mode === "columns") return [CASCADER_ROOT_KEY, ...path]
    return [path.length ? path[path.length - 1] : CASCADER_ROOT_KEY]
  }, [mode, path, expandedList])

  /**
   * A SIBLING of the index build, never a step inside it.
   *
   * The build stays a pure function of `items`; the loader owns the pages; the
   * merge below is a pure function of the two. That is what makes loaded data
   * survive an `items` change: the build re-runs, and then re-merges the SAME
   * maps rather than starting from nothing.
   */
  const loader = useCascaderLoader<T>({
    base: baseIndex,
    getChildren,
    // Gated, not merely unrendered: a tree query filters the loaded tree in
    // place and a server hit belongs to no visible branch, so firing the
    // request per keystroke would spend the server on results nothing shows.
    onSearch: mode === "tree" ? undefined : onSearch,
    resolveValue,
    searchDebounce,
    loadKey,
    prefetch,
    onLoadError,
    // An inline cascader is never "open", but its panel is live.
    enabled: open || !!inline,
    query,
    levels,
    path,
    values: selectedValues,
  })

  const loadStates = loader.states

  // Destructured here rather than at the actions memo because `navigate` needs
  // them, and it is defined well above it. All three are `[]`-dep callbacks
  // inside the loader, so this costs nothing in identity churn.
  const { ensureLevel, retryLevel: retryLoaderLevel, invalidateLevel } = loader

  /**
   * Whether pressing this branch has to FETCH before it can go anywhere.
   *
   * The three answers it distinguishes:
   *
   * - **In flight** (`loading`) - wait. Covers the `prefetch` case, where the
   *   request the highlight started is already running by the time the press
   *   lands.
   * - **Failed** (`error`) - wait, and retry rather than opening an empty
   *   level. The row keeps the retry affordance until it succeeds.
   * - **Never asked** - no state entry AND no children from `items`. Note
   *   `baseIndex`, not the merged `index`: `resolveValue` writes an ancestor
   *   chain into `pages` without touching `states`, so the merged index can
   *   show children for a level the server has never actually been asked for.
   *   That is deliberate, and this has to agree with `ensureLevel`'s own guards
   *   or a press would set a pending navigation nothing will ever settle.
   *
   * Everything else - loaded, loaded and empty, loaded with more pages - is
   * ready, and navigation happens on the same tick as the press.
   */
  const needsChildren = React.useCallback(
    (node: CascaderNode<T>) => {
      if (!loader.active) return false
      const state = loadStates.get(node.value)
      if (state) return state.loading || state.error
      return !baseIndex.childrenOf.has(node.value)
    },
    [loader.active, loadStates, baseIndex]
  )

  // Keyed on the two maps the merge actually reads, NOT on the store object:
  // `withLoadState` returns a fresh store carrying the SAME `pages` and
  // `detached`, so keying on the store identity rebuilt the whole merged index
  // - and re-rendered every memoised row through the actions context - on
  // every loading flip that changed no data at all.
  const index = React.useMemo(
    () =>
      mergeCascaderIndex(baseIndex, loader.store.pages, loader.store.detached),
    [baseIndex, loader.store.pages, loader.store.detached]
  )

  /**
   * Whether a level needs the paging pseudo-row.
   *
   * A level that has never been fetched has no entry at all and gets nothing:
   * its skeleton belongs to the empty state, not to a row in a list that has no
   * rows. Tree mode is the exception - it has no per-level empty state, because
   * every branch expands into the same list - so there the row doubles as the
   * branch's own loading and error surface.
   */
  const needsMoreRow = React.useCallback(
    (key: string, childCount: number) => {
      const state = loadStates.get(key)
      if (!state) return false
      if (childCount > 0) return state.hasMore || state.loading || state.error
      return mode === "tree" && (state.loading || state.error)
    },
    [loadStates, mode]
  )

  /**
   * Remembers every node that has been selected, so the trigger can still
   * render a label after the node scrolls out of the loaded set (or was never
   * loaded at all, with async data).
   */
  const labelCacheRef = React.useRef(new Map<string, CascaderNode<T>>())

  // Populated during render, not in an effect. The trigger reads this cache
  // while rendering, so filling it afterwards means the first paint after a
  // selection leaves has nothing to show. Writing a cache entry is idempotent
  // and derived purely from props, so it is safe to do here - unlike the
  // controlled-state refs above, a discarded render cannot corrupt it.
  for (const selected of selectedValues) {
    const node = index.byValue.get(selected)
    if (node) labelCacheRef.current.set(selected, node)
  }

  const resolveNode = React.useCallback(
    (nodeValue: string): CascaderNode<T> =>
      index.byValue.get(nodeValue) ??
      labelCacheRef.current.get(nodeValue) ?? {
        value: nodeValue,
        label: nodeValue,
      },
    [index]
  )

  /* ------------------------------ derived view ----------------------------- */

  const currentParentValue = path.length ? path[path.length - 1] : null
  const currentParent = currentParentValue
    ? (index.byValue.get(currentParentValue) ?? null)
    : null

  const currentLevelKey = currentParentValue ?? CASCADER_ROOT_KEY

  const isDeepSearching =
    searchScope === "deep" && query.trim().length > 0 && mode !== "tree"

  const localDeepResults = React.useMemo(() => {
    if (!isDeepSearching) return null
    return searchCascaderDeep(index, query, {
      within: currentParentValue,
      matches: filter,
    })
  }, [isDeepSearching, index, query, currentParentValue, filter])

  /**
   * Server search WINS over the local scan whenever `onSearch` is configured
   * and the query is non-empty. Running both would show each hit twice: the
   * server's copy is a detached node, and the local one is the same node found
   * again in `index.all`.
   */
  const deepResults = loader.searchResults ?? localDeepResults

  const levelItems = React.useMemo(() => {
    const level = getCascaderChildren(index, currentParentValue)
    return filterCascaderLevel(level, query, filter)
  }, [index, currentParentValue, query, filter])

  /**
   * The active level's rows, with the paging pseudo-row appended.
   *
   * Appended HERE rather than in the markup, because every index Base UI hands
   * out is an index into this array. A row that exists in the DOM but not here
   * shifts the highlight, `aria-activedescendant` and every virtualized row
   * index by one.
   */
  const levelRendered = React.useMemo(() => {
    if (deepResults) return deepResults
    if (!needsMoreRow(currentLevelKey, levelItems.length)) return levelItems
    return [
      ...levelItems,
      createCascaderMoreNode<T>(currentLevelKey, levelItems.length),
    ]
  }, [deepResults, levelItems, currentLevelKey, needsMoreRow])

  /**
   * Columns mode renders the whole open trail side by side. Only the deepest
   * column is interactive through Base UI, so `renderedItems` stays exactly
   * what it is in drill mode and the state machine does not fork: keyboard
   * focus lives in one column at a time, which is how Miller columns behave.
   */
  const columns = React.useMemo<CascaderColumn<T>[]>(() => {
    if (mode !== "columns") return []
    const trail: CascaderColumn<T>[] = []
    for (let depth = 0; depth <= path.length; depth += 1) {
      const parentValue = depth === 0 ? null : path[depth - 1]
      const parent = parentValue
        ? (index.byValue.get(parentValue) ?? null)
        : null
      const isActive = depth === path.length
      let columnItems: CascaderNode<T>[]
      if (isActive) {
        columnItems = levelRendered
      } else {
        // A trail column pages on its own: the user can reach back into it and
        // ask for more without losing the columns to its right.
        const key = parentValue ?? CASCADER_ROOT_KEY
        const children = getCascaderChildren(index, parentValue)
        columnItems = needsMoreRow(key, children.length)
          ? [...children, createCascaderMoreNode<T>(key, children.length)]
          : children
      }
      trail.push({
        parent,
        depth,
        activeValue: path[depth] ?? null,
        active: isActive,
        // Only the active column is filtered: a query should narrow the column
        // you are typing into, not silently empty the trail behind it.
        items: columnItems,
      })
    }
    return trail
  }, [mode, path, index, levelRendered, needsMoreRow])

  /**
   * Level keys whose tree rows need a paging pseudo-row after their last
   * loaded child. Tree mode has no per-level empty state, so this is also where
   * an expanded-but-still-loading branch says so.
   */
  const treeSentinels = React.useMemo(() => {
    if (mode !== "tree") return undefined
    const keys = new Set<string>()
    const consider = (key: string) => {
      if (needsMoreRow(key, index.childrenOf.get(key)?.length ?? 0)) {
        keys.add(key)
      }
    }
    consider(CASCADER_ROOT_KEY)
    for (const value of expanded) consider(value)
    return keys.size ? keys : undefined
  }, [mode, index, expanded, needsMoreRow])

  const treeRows = React.useMemo<CascaderFlatNode<T>[]>(() => {
    if (mode !== "tree") return []
    const rows = flattenCascaderTree(index, expanded, treeSentinels)
    // Normalized through the same helper the level filter uses, so a tree query
    // and a level query can never disagree about what "case-insensitive" means.
    const normalized = normalizeCascaderQuery(query)
    if (!normalized) return rows
    // Filtering a tree by visible rows only would hide matches inside collapsed
    // branches, so a query matches against every node and keeps its ancestors.
    //
    // `matchesCascaderQuery`, the SAME matcher every other search path uses -
    // labels plus keywords, folded. Matching labels alone here meant a node
    // findable by keyword in drill and columns silently vanished from a tree
    // query for no reason a consumer could see.
    const keep = new Set<string>()
    for (const node of index.all) {
      if (
        !(filter
          ? filter(node, normalized)
          : matchesCascaderQuery(node, normalized))
      ) {
        continue
      }
      for (const ancestor of getCascaderPath(index, node.value)) {
        keep.add(ancestor.value)
      }
    }
    // No sentinels while filtering: a paging row inside a set of search hits
    // would offer to fetch a page the query has not been applied to.
    return flattenCascaderTree(index, new Set([...expanded, ...keep])).filter(
      (row) => keep.has(row.node.value)
    )
  }, [mode, index, expanded, treeSentinels, query, filter])

  /**
   * What `Combobox.Root` receives. Tree mode flattens its visible rows into the
   * same linear list every other mode uses, so selection, highlighting and
   * `aria-activedescendant` need no special case per mode.
   */
  const renderedItems = React.useMemo(
    () => (mode === "tree" ? treeRows.map((row) => row.node) : levelRendered),
    [mode, treeRows, levelRendered]
  )

  /* ---------------------------- level swap reset --------------------------- */

  /**
   * Base UI does not reset the highlighted index when `items` changes, and
   * `actionsRef` exposes only `unmount` - there is no imperative setter. Its
   * one automatic reset is an out-of-range clamp, so we deliberately render a
   * single empty frame to trip that clamp before showing the new level.
   *
   * `filteredItems` (not `items`) carries the empty frame so the `items`
   * identity stays stable and the selected-value machinery does not churn.
   */
  const levelKey = currentParentValue ?? ""

  // The previous key is STATE, not a ref. A ref mutated during render is not
  // idempotent: React may render, discard, and re-render the same commit, and
  // the second pass would see the ref already advanced and skip the reset.
  // Storing it alongside `swapping` makes the whole thing a pure function of
  // the render, which is the supported render-phase-update pattern.
  const [swap, setSwap] = React.useState({ key: levelKey, active: false })

  if (swap.key !== levelKey) {
    setSwap({ key: levelKey, active: true })
  }
  const swapping = swap.active && swap.key === levelKey

  React.useLayoutEffect(() => {
    if (swap.active) setSwap((prev) => ({ ...prev, active: false }))
  }, [swap.active])

  /* ----------------------------- virtualization ---------------------------- */

  /**
   * How many windowing renderers are mounted.
   *
   * A COUNT rather than a boolean, because columns mode mounts one per column
   * and because StrictMode mounts, unmounts and remounts every effect.
   */
  const [virtualRenderers, setVirtualRenderers] = React.useState(0)

  const registerVirtualRenderer = React.useCallback(() => {
    setVirtualRenderers((count) => count + 1)
    return () => setVirtualRenderers((count) => Math.max(0, count - 1))
  }, [])

  const hasVirtualRenderer = virtualRenderers > 0
  const wantsVirtual = virtualize ?? renderedItems.length >= virtualizeThreshold

  /**
   * Windowing is LATCHED per level.
   *
   * Without the latch, typing into a 5,000 row level tears the virtualizer down
   * the moment the query narrows it under the threshold and rebuilds it on the
   * next backspace - which throws away every measurement and jumps the scroll
   * position mid-keystroke. Navigating to a different level resets it, because
   * that genuinely is a different list.
   *
   * State, not a ref, for the same reason `swap` is: a ref mutated during
   * render is not idempotent under a render React discards and repeats.
   */
  const [virtualLatch, setVirtualLatch] = React.useState({
    key: levelKey,
    on: false,
  })

  const virtualized =
    hasVirtualRenderer &&
    (virtualLatch.key === levelKey
      ? virtualLatch.on || wantsVirtual
      : wantsVirtual)

  if (!hasVirtualRenderer) {
    // Nothing is windowing, so nothing may stay latched: the renderer may come
    // back for a level small enough that it should not window at all.
    if (virtualLatch.on || virtualLatch.key !== levelKey) {
      setVirtualLatch({ key: levelKey, on: false })
    }
  } else if (virtualLatch.key !== levelKey) {
    setVirtualLatch({ key: levelKey, on: virtualized })
  } else if (virtualized && !virtualLatch.on) {
    setVirtualLatch({ key: levelKey, on: true })
  }

  /**
   * One forced re-render, one commit AFTER windowing turns on.
   *
   * Base UI sizes `listRef` from `filteredItems`, in a single layout effect
   * keyed on that array's identity. But `virtualized` only reaches
   * `Combobox.List` through the store, which the root writes from ITS OWN
   * layout effect - so the `CompositeList` inside the list is torn down one
   * commit later, and its teardown REPLACES `listRef` with a fresh empty
   * array. The sizing effect has already run by then and nothing re-runs it,
   * which leaves the list as long as the WINDOW rather than as long as the
   * level: ArrowDown stops dead at the last rendered row and never reaches
   * row 5,000.
   *
   * A passive effect is late enough to be safe. The teardown commit is
   * scheduled synchronously from a layout effect, so React flushes it before
   * any passive effect runs; the re-render this schedules therefore always
   * lands after it, whichever way the two are interleaved.
   */
  const [virtualSyncs, setVirtualSyncs] = React.useState(0)

  React.useEffect(() => {
    if (!virtualized) return
    setVirtualSyncs((count) => count + 1)
  }, [virtualized])

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined
    if (virtualize !== true || hasVirtualRenderer) return undefined
    // Deferred by a tick rather than checked inline: the renderer registers
    // from a layout effect, and the passive effect of the first commit runs
    // before the re-render that registration schedules. Checking synchronously
    // would report every correctly wired cascader exactly once.
    const timeout = setTimeout(() => {
      console.error(
        "[Cascader] `virtualize` is true but no windowing renderer is mounted. " +
          "Render <CascaderVirtualItems /> inside <CascaderList>, or " +
          "<CascaderVirtualColumn /> through the <CascaderColumns> slot."
      )
    }, 0)
    return () => clearTimeout(timeout)
  }, [virtualize, hasVirtualRenderer])

  /* ------------------------------ navigation ------------------------------ */

  /**
   * One signal per navigation, feeding the live region.
   *
   * `seq` alternates the invisible marker so two navigations that describe
   * themselves identically are still two text mutations, and `toggled` records
   * which tree branch was just opened or closed - expanding a branch changes
   * nothing else the announcement could be derived from.
   *
   * Every action bumps it EXACTLY once: `navigate` and `navigateAt` delegate to
   * `pushLevel` / `toggleExpanded` on the paths that have one, and bump
   * directly only on the path that does not.
   */
  const [announceSignal, setAnnounceSignal] = React.useState<{
    seq: number
    toggled: string | null
    /**
     * A one-off message the live region carries verbatim: a `max` refusal, a
     * cascade fan-out. STATE rather than a fire-and-forget call, so an
     * unrelated render cannot clear it mid-read; navigation replaces it,
     * because every navigation goes through `bumpAnnouncement`.
     */
    notice: string | null
  }>({ seq: 0, toggled: null, notice: null })

  const bumpAnnouncement = React.useCallback((toggled: string | null) => {
    setAnnounceSignal((prev) => ({ seq: prev.seq + 1, toggled, notice: null }))
  }, [])

  /**
   * Speaks for the interactions that change nothing on screen.
   *
   * A refused pick and a cascade sweep both used to be silent: the refusal
   * because it returns before any state moves, the sweep because the pressed
   * row alone cannot say how many values followed it. The seq bump keeps the
   * marker alternation working, so two identical refusals in a row are still
   * two text mutations and both get read.
   */
  const announceNotice = React.useCallback((notice: string) => {
    setAnnounceSignal((prev) => ({ seq: prev.seq + 1, toggled: null, notice }))
  }, [])

  /**
   * The navigation a press asked for and a fetch has not answered yet.
   *
   * Load BEFORE you move, never after. The panel used to drill in immediately
   * and let the new level render its own loading surface, which meant one press
   * threw away the list the user was reading, replaced it with a spinner, and -
   * if the request failed - left them on an error screen for a level they had
   * never seen. Holding the press here keeps them on rows they can still read
   * and put the progress on the row they pressed, which is where they are
   * looking. `CascaderItem` turns that row's chevron (or its tree expander)
   * into a spinner in the same box, so nothing reflows either way.
   *
   * A ref shadows the state for exactly one reason: a second press on a row
   * that is already pending must not re-enter, and `navigate` is a `[]`-dep
   * callback that cannot read state.
   */
  const [pendingNavigation, setPendingNavigation] =
    React.useState<CascaderPendingNavigation | null>(null)

  /**
   * Asks for a branch's children and parks the navigation until they land.
   *
   * BOTH loader entry points are called, and neither needs a condition around
   * it: `retryLevel` no-ops on anything that is not in an error state, and
   * `ensureLevel` no-ops on anything that already has one. Between them they
   * cover the two reasons a press can arrive at a level that is not ready, and
   * asking this way means the decision is not duplicated outside the loader.
   * A repeat press while the request is still in flight is therefore free: it
   * re-parks the same intent and both calls decline.
   */
  const requestChildren = React.useCallback(
    (node: CascaderNode<T>, pending: CascaderPendingNavigation) => {
      setPendingNavigation(pending)
      retryLoaderLevel(node.value)
      ensureLevel(node.value, "level")
      // The live region has to say the press did something. Without it the
      // panel is silent from the press until the level swaps, which for a slow
      // server is the whole interaction.
      bumpAnnouncement(null)
    },
    [retryLoaderLevel, ensureLevel, bumpAnnouncement]
  )

  const pushLevel = React.useCallback(
    (nodeValue: string) => {
      setPathWithReason((prev) => [...prev, nodeValue], "drill")
      setQuery("")
      bumpAnnouncement(null)
    },
    [setPathWithReason, setQuery, bumpAnnouncement]
  )

  const popLevel = React.useCallback(() => {
    setPathWithReason(
      (prev) => (prev.length ? prev.slice(0, -1) : prev),
      "back"
    )
    setQuery("")
    // Going BACK abandons a held navigation. Without this, a branch whose
    // fetch is still in flight (or has failed and is waiting on a retry) would
    // drill in the moment it landed, minutes after the user moved on.
    setPendingNavigation(null)
    bumpAnnouncement(null)
  }, [setPathWithReason, setQuery, bumpAnnouncement])

  const goToDepth = React.useCallback(
    (depth: number) => {
      setPathWithReason(
        (prev) => prev.slice(0, Math.max(0, depth)),
        "breadcrumb"
      )
      setQuery("")
      setPendingNavigation(null)
      bumpAnnouncement(null)
    },
    [setPathWithReason, setQuery, bumpAnnouncement]
  )

  const toggleExpanded = React.useCallback(
    (nodeValue: string) => {
      setExpandedList((prev) =>
        prev.includes(nodeValue)
          ? prev.filter((v) => v !== nodeValue)
          : [...prev, nodeValue]
      )
      bumpAnnouncement(nodeValue)
    },
    [setExpandedList, bumpAnnouncement]
  )

  const isBranch = React.useCallback(
    (node: CascaderNode<T>) => isCascaderBranch(index, node),
    [index]
  )

  const isSelectable = React.useCallback(
    (node: CascaderNode<T>) => isCascaderSelectable(index, node, selectable),
    [index, selectable]
  )

  /**
   * Whether a branch can be committed AT ALL here - a question about the
   * cascader, not about any one node.
   *
   * `"leaf"` is the only setting that can answer no for every branch in
   * advance. `"any"` says yes to all of them, and a predicate is opaque: it may
   * accept one branch and refuse its neighbour, which is precisely the case
   * that has to reserve the check gutter uniformly rather than per row.
   */
  const branchesSelectable = selectable !== "leaf"

  /**
   * Open flyouts, by key.
   *
   * A ref-backed set rather than state: `handleOpenChange` needs the answer as
   * of the Escape keypress that is being handled, and a footer menu opening
   * must not re-render the root. Both callbacks are `[]`-dep, so they stay on
   * the stable actions context.
   */
  const openFlyoutsRef = React.useRef<Set<string>>(new Set())

  const setFlyoutOpen = React.useCallback((key: string, open: boolean) => {
    if (open) openFlyoutsRef.current.add(key)
    else openFlyoutsRef.current.delete(key)
  }, [])

  const hasOpenFlyout = React.useCallback(
    () => openFlyoutsRef.current.size > 0,
    []
  )

  // Shallow-stabilized (array items compared shallowly) for the same reason
  // `labels` is: an inline `actions={[...]}` array republished the actions
  // context on every parent render, and with it every memoised row.
  const stableActions = useShallowStable(actions, shallowEqualItemLists)

  // A stable empty array so the actions context is not republished on every
  // render of a cascader that has no footer.
  const resolvedActions = React.useMemo<CascaderActionItem[]>(
    () => stableActions ?? EMPTY_ACTIONS,
    [stableActions]
  )

  // A Set, not an array scan: `isSelected` runs once per rendered row, so an
  // `includes` here is O(rows x selections) on every render of every level.
  const selectedSet = React.useMemo(
    () => new Set(selectedValues),
    [selectedValues]
  )

  const isSelected = React.useCallback(
    (node: CascaderNode<T>) => selectedSet.has(node.value),
    [selectedSet]
  )

  /**
   * How many selected nodes each value holds below it, walked ONCE per
   * selection change.
   *
   * Derived and never stored: the flat value array stays the only source of
   * truth, so there is no second state to fall out of sync with it. The walk is
   * `selections x depth` - up from each selection, not down from each row -
   * which is what keeps both the trailing count and `isIndeterminate` an O(1)
   * lookup for a memoised, possibly windowed row. A per-row subtree walk would
   * be `rows x descendants`, paid again on every keystroke.
   */
  const selectedDescendants = React.useMemo(
    () => getCascaderSelectedDescendants(index, selectedValues),
    [index, selectedValues]
  )

  const selectedDescendantCount = React.useCallback(
    (node: CascaderNode<T>) => selectedDescendants.get(node.value) ?? 0,
    [selectedDescendants]
  )

  /**
   * The partially selected values, read off the SAME map rather than walked
   * again. That is what makes "has a dash" and "shows a number" two readings of
   * one traversal instead of two answers that can drift apart.
   */
  const indeterminateSet = React.useMemo(() => {
    if (!cascade || !multiple) return null
    return getCascaderIndeterminateFrom(selectedDescendants, selectedValues)
  }, [cascade, multiple, selectedDescendants, selectedValues])

  const isIndeterminate = React.useCallback(
    (node: CascaderNode<T>) => indeterminateSet?.has(node.value) ?? false,
    [indeterminateSet]
  )

  // Base UI owns the highlight; we only mirror it into a ref so keyboard
  // handlers can ask "what is highlighted right now?" without subscribing.
  const highlightedRef = React.useRef<CascaderNode<T> | null>(null)
  const getHighlighted = React.useCallback(() => highlightedRef.current, [])

  /**
   * The same highlight, published as an external store for the one consumer
   * that has to RE-RENDER on it rather than merely read it.
   *
   * `useState` with an initializer, not `useMemo`: React is free to drop a
   * memo, and a second store would silently orphan every subscriber.
   */
  const [highlightStore] = React.useState<CascaderHighlightStore>(
    createCascaderHighlightStore
  )

  /* ------------------------------ announcement ---------------------------- */

  /** The load state the panel is currently showing, in every mode. */
  const currentLoadState = React.useMemo<CascaderLoadState | null>(
    () => loadStates.get(currentLevelKey) ?? null,
    [loadStates, currentLevelKey]
  )
  const searchLoadState = loader.searchState

  /**
   * What the query announcement COUNTS: matches, not rows.
   *
   * The rendered list carries rows that are not results - a tree query keeps
   * every hit's ancestors as context, and a paged level appends its Load-more
   * pseudo-row - so announcing `renderedItems.length` told a tree user about
   * rows they did not ask for and every paged level about one result that is
   * a button. Server search hits are counted as-is: the server matched them,
   * and re-judging them with the local matcher would drop hits it matched on
   * data the client cannot see.
   */
  const announcedMatches = React.useMemo(() => {
    if (deepResults) return deepResults.length
    const normalized = normalizeCascaderQuery(query)
    if (!normalized) return 0
    const matches = filter ?? matchesCascaderQuery
    return renderedItems.filter(
      (node) => !isCascaderMoreNode(node) && matches(node, normalized)
    ).length
  }, [deepResults, renderedItems, query, filter])

  /**
   * The live-region text plus whether it may be DEFERRED (see fix note on
   * `ANNOUNCE_DEBOUNCE`). The committed string is state, set by the effect
   * below, so the deferral is expressible at all.
   */
  const announcementTarget = React.useMemo(() => {
    // An INLINE cascader is never "open" - there is no popup to open - so
    // gating on `open` alone silenced the embedded tree entirely.
    if (!open && !inline) return { text: "", defer: false }

    const total = renderedItems.length
    const marker = ANNOUNCE_MARKER.repeat(announceSignal.seq % 2)

    // A notice - a `max` refusal, a cascade fan-out - outranks everything
    // below. It exists precisely because nothing else on screen changed, so
    // describing the level again would say the press did nothing. It rides
    // the signal: an unrelated render leaves it in place, and the next
    // navigation replaces it.
    if (announceSignal.notice) {
      return { text: `${announceSignal.notice}${marker}`, defer: false }
    }

    // A tree toggle is the one navigation that changes neither the level nor
    // the query, so it is read from the signal rather than derived.
    const toggled =
      mode === "tree" && announceSignal.toggled
        ? (index.byValue.get(announceSignal.toggled) ?? null)
        : null

    // The async states outrank everything below, because they describe why the
    // list looks the way it does. Without them a level that is merely fetching
    // announces "0 results" and then, seconds later, contradicts itself.
    //
    // A HELD navigation outranks even those. Nothing on screen has changed yet
    // - that is the point of holding it - so describing the level the user is
    // still looking at would say the press did nothing, and describing the one
    // they pressed would say they had arrived somewhere they have not. The
    // truthful statement is that something is loading, and then either the
    // level swaps and announces itself or the fetch fails and says so.
    const pendingState = pendingNavigation
      ? (loadStates.get(pendingNavigation.value) ?? null)
      : null
    const levelState = query.trim() ? searchLoadState : currentLoadState
    let text: string
    let defer = false
    if (pendingState?.error) {
      text = labels.error
    } else if (pendingNavigation) {
      // Always the FIRST-page string, never `loadingMore`. The rows on screen
      // belong to the level being left behind, so their count says nothing
      // about the request in flight.
      text = labels.loading
    } else if (levelState?.error) {
      text = labels.error
    } else if (levelState?.loading) {
      // While the query is set the in-flight load IS the server search, not
      // the next page of a level - `levelState` reads `searchLoadState` then -
      // and announcing a search as "Loading more" misreads what the user is
      // waiting for.
      text = query.trim()
        ? labels.searchingAnnouncement
        : total > 0
          ? labels.loadingMore
          : labels.loading
    } else if (query.trim()) {
      // An empty result set is the more useful thing to say than "0 results".
      text =
        announcedMatches === 0
          ? labels.empty
          : labels.resultsAnnouncement(announcedMatches)
      // The ONE deferred branch: a keystroke rewrites this count, and only a
      // stream of keystrokes needs coalescing. Everything above and below is
      // event-shaped and stays immediate.
      defer = true
    } else if (toggled) {
      text = expanded.has(toggled.value)
        ? labels.expandedAnnouncement(
            toggled.label,
            getCascaderCount(index, toggled)
          )
        : labels.collapsedAnnouncement(toggled.label)
    } else if (currentParent) {
      // `path.length + 1`, matching tree mode's `aria-level` for the same
      // depth: the rows on screen are the CHILDREN of `currentParent`, one
      // level below it, and the two numberings used to disagree by one.
      text = labels.levelAnnouncement(
        currentParent.label,
        path.length + 1,
        total
      )
    } else {
      // Returning to the root used to announce nothing at all, which reads as
      // "the list changed and no one will tell you how".
      text = labels.rootAnnouncement(total)
    }

    return { text: `${text}${marker}`, defer }
  }, [
    open,
    inline,
    mode,
    index,
    expanded,
    announceSignal,
    query,
    labels,
    renderedItems.length,
    announcedMatches,
    currentParent,
    path.length,
    currentLoadState,
    searchLoadState,
    pendingNavigation,
    loadStates,
  ])

  /**
   * The COMMITTED announcement. Immediate texts are committed during render -
   * the same supported render-phase-update pattern `swap` uses - so an
   * announcement caused by an async settle lands in the very commit that shows
   * the rows it describes, with no effect timing in between. Only the deferred
   * query count goes through the timer below.
   */
  const [announced, setAnnounced] = React.useState(announcementTarget)

  if (!announcementTarget.defer && announced.text !== announcementTarget.text) {
    // Terminates: after the set, `announced.text` equals the target and the
    // condition is false on the immediate re-render.
    setAnnounced(announcementTarget)
  }

  React.useEffect(() => {
    if (!announcementTarget.defer) return undefined
    // Identical-text dedup happens at the consumer of `announced.text`; a
    // timer landing on the same string costs one bailed-out commit at most.
    const timer = setTimeout(
      () => setAnnounced(announcementTarget),
      ANNOUNCE_DEBOUNCE
    )
    return () => clearTimeout(timer)
  }, [announcementTarget])

  const announcement = announced.text

  /* --------------------------------- state -------------------------------- */

  /**
   * The volatile half. Most of this is rebuilt by a single keystroke, which is
   * precisely why it is published apart from the actions below.
   */
  const stateValue = React.useMemo<CascaderStateContextValue<T>>(
    () => ({
      index,
      path,
      expanded,
      query,
      currentParent,
      levelItems,
      deepResults,
      renderedItems,
      columns,
      treeRows,
      selectedValues,
      selectedDescendants,
      loadStates,
      searchState: searchLoadState,
      announcement,
    }),
    [
      index,
      path,
      expanded,
      query,
      currentParent,
      levelItems,
      deepResults,
      renderedItems,
      columns,
      treeRows,
      selectedValues,
      selectedDescendants,
      loadStates,
      searchLoadState,
      announcement,
    ]
  )

  /* ------------------------------ latest props ---------------------------- */

  /**
   * Latest committed props and derived state, WRITTEN IN AN EFFECT.
   *
   * This is what lets the callbacks below be `[]`-dep and therefore stable for
   * the life of the cascader: `navigate` used to churn on every keystroke only
   * because it read `deepResults`, and a churning `navigate` republished the
   * context to every row. Writing the ref during render instead would be
   * unsafe under concurrent rendering - a render React throws away would still
   * have mutated it.
   *
   * The flip side is that a read sees the PREVIOUS commit until the effect has
   * run, so only event handlers may read it. Anything consumed during render
   * (`isBranch`, `isSelectable`, `isSelected`, `resolveNode`) is memoised on
   * its real inputs instead, none of which are keystroke-volatile.
   */
  const latest = React.useRef<CascaderLatest<T>>({
    index,
    state: stateValue,
    mode,
    multiple,
    cascade,
    max,
    labels,
    closeOnSelect,
    selectedValues,
    deepResults,
    onValueChange,
    resolveNode,
    isSelectable,
    needsChildren,
    expanded,
  })

  React.useEffect(() => {
    latest.current = {
      index,
      state: stateValue,
      mode,
      multiple,
      cascade,
      max,
      labels,
      closeOnSelect,
      selectedValues,
      deepResults,
      onValueChange,
      resolveNode,
      isSelectable,
      needsChildren,
      expanded,
    }
  })

  const getIndex = React.useCallback(() => latest.current.index, [])
  const getState = React.useCallback(() => latest.current.state, [])

  const goToLevelAt = React.useCallback(
    (nodeValue: string, depth: number) => {
      setPathWithReason(
        (prev) => [...prev.slice(0, Math.max(0, depth)), nodeValue],
        "drill"
      )
      setQuery("")
      bumpAnnouncement(null)
    },
    [setPathWithReason, setQuery, bumpAnnouncement]
  )

  const navigateAt = React.useCallback(
    (node: CascaderNode<T>, depth: number) => {
      if (latest.current.mode === "tree") {
        toggleExpanded(node.value)
        return
      }
      if (latest.current.needsChildren(node)) {
        requestChildren(node, { value: node.value, kind: "at", depth })
        return
      }
      goToLevelAt(node.value, depth)
    },
    [toggleExpanded, goToLevelAt, requestChildren]
  )

  const navigate = React.useCallback(
    (node: CascaderNode<T>) => {
      const {
        mode: currentMode,
        deepResults: currentDeepResults,
        index: currentIndex,
        expanded: currentExpanded,
        needsChildren: pending,
      } = latest.current

      if (currentMode === "tree") {
        // Collapsing never needs data. Only the OPENING half waits, and it
        // waits without expanding: the branch stays shut with a spinner in its
        // expander rather than opening onto a level that has no rows yet.
        if (!currentExpanded.has(node.value) && pending(node)) {
          requestChildren(node, {
            value: node.value,
            kind: "expand",
            depth: 0,
          })
          return
        }
        toggleExpanded(node.value)
        return
      }

      // A deep-search hit can sit at any depth, so drilling into one has to
      // rebuild the whole trail rather than append to wherever the user was.
      if (currentDeepResults) {
        if (pending(node)) {
          const ancestors = getCascaderPath(currentIndex, node.value)
          requestChildren(node, {
            value: node.value,
            kind: "at",
            // The hit's own depth, so the settle rebuilds the same trail this
            // branch would have built had the level already been loaded.
            depth: Math.max(0, ancestors.length - 1),
          })
          return
        }
        const ancestors = getCascaderPath(currentIndex, node.value)
        setPathWithReason(
          ancestors.map((entry) => entry.value),
          "drill"
        )
        setQuery("")
        bumpAnnouncement(null)
        return
      }

      if (pending(node)) {
        requestChildren(node, { value: node.value, kind: "push", depth: 0 })
        return
      }
      pushLevel(node.value)
    },
    [
      toggleExpanded,
      setPathWithReason,
      setQuery,
      pushLevel,
      bumpAnnouncement,
      requestChildren,
    ]
  )

  /**
   * The other half of `requestChildren`: the fetch has settled, so the
   * navigation it was holding either happens or is dropped.
   *
   * Reads the load state rather than a promise, because the loader is the only
   * thing that knows whether a request was superseded, aborted or retried, and
   * a promise captured at press time would not survive any of the three. A
   * level with no entry at all is one whose request has not reached the store
   * yet - `runLoad` writes `loading: true` synchronously, so that gap is a
   * single commit and waiting through it is correct.
   *
   * On failure NOTHING moves and the intent is KEPT. The row that was pressed
   * is already showing its retry affordance, driven by the same `error` flag
   * this reads, and holding the intent is what makes that affordance mean
   * something: pressing it refires the level, and the navigation the user
   * originally asked for happens when it finally succeeds. The intent is
   * dropped by `popLevel` / `goToDepth` and on close, which are the three ways
   * a user says they no longer want it.
   */
  React.useEffect(() => {
    if (!pendingNavigation) return
    const state = loadStates.get(pendingNavigation.value)
    if (!state || state.loading || state.error) return

    setPendingNavigation(null)

    if (pendingNavigation.kind === "expand") {
      toggleExpanded(pendingNavigation.value)
      return
    }
    if (pendingNavigation.kind === "at") {
      goToLevelAt(pendingNavigation.value, pendingNavigation.depth)
      return
    }
    pushLevel(pendingNavigation.value)
  }, [pendingNavigation, loadStates, toggleExpanded, goToLevelAt, pushLevel])

  // A popup that closes mid-flight must not drill in when its answer arrives:
  // the user has moved on, and reopening would land them somewhere they never
  // asked to be. The loader aborts the request itself; this drops the intent.
  React.useEffect(() => {
    if (!open && !inline) setPendingNavigation(null)
  }, [open, inline])

  /* ------------------------------- selection ------------------------------ */

  /**
   * The one place the selection changes.
   *
   * Every path funnels through here so `onValueChange` reports the same shape
   * no matter what caused the change: a row press, the drag-select mouseup,
   * `setSelection`, or the headless `remove` / `clear`.
   */
  const emitSelection = React.useCallback(
    (
      nextValues: string[],
      node: CascaderNode<T> | null,
      reason: CascaderChangeReason
    ) => {
      const {
        selectedValues: current,
        multiple: currentMultiple,
        onValueChange: emit,
        index: currentIndex,
        resolveNode: resolve,
      } = latest.current

      // Nothing actually changed. `useControllable` used to swallow these via
      // its `Object.is` dedup; that dedup lives here now that the callback no
      // longer rides on it.
      const unchanged =
        nextValues.length === current.length &&
        nextValues.every((entry, i) => entry === current[i])
      if (unchanged) return

      const next = currentMultiple ? nextValues : (nextValues[0] ?? "")
      setValue(next)

      if (!emit) return

      const chain = node ? getCascaderPath(currentIndex, node.value) : []
      emit(next, {
        node,
        // A node absent from `items` has no ancestor chain in the index, so
        // fall back to the node itself rather than reporting an empty path
        // for a change that plainly had one.
        path: node ? (chain.length ? chain : [node]) : [],
        // `resolveNode`, not `index.byValue`: a selected value whose node is
        // not in `items` must still come back rather than being dropped.
        nodes: nextValues.map(resolve),
        reason,
      })
    },
    [setValue]
  )

  const setSelection = React.useCallback(
    (values: string[], reason?: CascaderChangeReason) => {
      const { selectedValues: current, resolveNode: resolve } = latest.current
      const before = new Set(current)
      const after = new Set(values)
      const added = values.find((entry) => !before.has(entry))
      const removed = current.find((entry) => !after.has(entry))

      if (reason === "clear") {
        emitSelection(values, null, "clear")
        return
      }
      if (added) {
        emitSelection(values, resolve(added), reason ?? "select")
        return
      }
      if (removed) {
        emitSelection(values, resolve(removed), reason ?? "deselect")
        return
      }
      // Same set: `emitSelection` will no-op, but route it anyway so an
      // explicit `reason` still decides how a reorder is reported.
      emitSelection(values, null, reason ?? "select")
    },
    [emitSelection]
  )

  const commit = React.useCallback(
    (node: CascaderNode<T>) => {
      const {
        multiple: currentMultiple,
        cascade: currentCascade,
        selectedValues: current,
        max: currentMax,
        index: currentIndex,
        isSelectable: currentIsSelectable,
        labels: currentLabels,
        closeOnSelect: currentCloseOnSelect,
      } = latest.current

      if (!currentMultiple) {
        emitSelection([node.value], node, "select")
        if (currentCloseOnSelect) {
          openReasonRef.current = "item-press"
          setOpen(false)
        } else {
          // The popup stays up for a compare-and-repick flow, so the query is
          // cleared the way a multiple commit clears it: the next pick starts
          // from the full level rather than from the old filter.
          setQuery("")
        }
        return
      }

      if (currentCascade) {
        const selecting = !current.includes(node.value)
        const next = applyCascadeSelection(
          currentIndex,
          current,
          node.value,
          selecting,
          currentIsSelectable
        )
        // `max` caps the whole gesture rather than truncating it. A subtree
        // select is one press, so honouring the cap by keeping an arbitrary
        // prefix of the subtree would leave a selection the user never asked
        // for and cannot reason about. Refusing it outright is legible - and
        // now audible: the refusal changes nothing on screen, so the live
        // region is the only place it can register at all.
        if (
          selecting &&
          currentMax != null &&
          next.length > currentMax &&
          next.length > current.length
        ) {
          announceNotice(currentLabels.maxReachedAnnouncement(currentMax))
          return
        }
        emitSelection(next, node, selecting ? "select" : "deselect")
        // The pressed row's checkbox flips visibly; how many values the
        // closure swept along with it - descendants selected, ancestors
        // reconciled - is invisible from that one row, so the sweep says its
        // number out loud. The node itself is not counted: it is the thing
        // that was pressed, not something that followed.
        const before = new Set(current)
        const after = new Set(next)
        let swept = 0
        for (const entry of selecting ? next : current) {
          if (entry === node.value) continue
          if (selecting ? !before.has(entry) : !after.has(entry)) swept += 1
        }
        if (swept > 0) {
          announceNotice(
            currentLabels.cascadeAnnouncement(
              node.label ?? node.value,
              swept,
              selecting
            )
          )
        }
        setQuery("")
        return
      }

      if (current.includes(node.value)) {
        emitSelection(
          current.filter((v) => v !== node.value),
          node,
          "deselect"
        )
      } else if (currentMax == null || current.length < currentMax) {
        emitSelection([...current, node.value], node, "select")
      } else {
        // The plain-multiple twin of the cascade refusal above, and it was
        // just as silent: the press bounced off the cap with no state change
        // for the live region to derive anything from.
        announceNotice(currentLabels.maxReachedAnnouncement(currentMax))
      }
      setQuery("")
    },
    [emitSelection, setOpen, setQuery, announceNotice]
  )

  /**
   * Safety net for selection paths that bypass the row-level veto (notably the
   * drag-select mouseup). `details.cancel()` suppresses the value commit and
   * the close in one call, because Base UI shares one event-details object
   * between them.
   */
  const handleComboboxValueChange = React.useCallback(
    (
      next: CascaderNode<T> | CascaderNode<T>[] | null,
      details: ComboboxPrimitive.Root.ChangeEventDetails
    ) => {
      if (!multiple) {
        const node = Array.isArray(next) ? (next[0] ?? null) : next
        // The paging row is a real option, so Base UI will happily report it as
        // a selection. `CascaderItem` vetoes the press first; this is the same
        // safety net branches get, for the paths a row-level veto cannot reach.
        if (node && isCascaderMoreNode(node)) {
          details.cancel()
          return
        }
        if (node && !isSelectable(node) && isBranch(node)) {
          details.cancel()
          navigate(node)
          return
        }
        if (node) {
          // `closeOnSelect={false}` must also stop Base UI's OWN close: the
          // value commit and the close ride one shared event-details object,
          // so cancelling here suppresses both and leaves the commit to us.
          // Our value is controlled, so Base UI's half had nothing to keep.
          if (!closeOnSelect) details.cancel()
          commit(node)
        }
        return
      }

      // Base UI hands over the ENTIRE next selection, because it is the only
      // side that knows which row was pressed. Re-deriving the toggle from the
      // array's tail is correct only for an add: on a remove the array is
      // shorter and its tail is a different, still-selected node, so the wrong
      // one gets dropped and the last remaining selection can never be cleared.
      // Take Base UI's array as the answer and only inspect what was ADDED.
      const nextNodes = Array.isArray(next) ? next : []
      const before = new Set(selectedValues)
      const added = nextNodes.find((node) => !before.has(node.value))

      if (added && isCascaderMoreNode(added)) {
        details.cancel()
        return
      }

      if (added && !isSelectable(added) && isBranch(added)) {
        details.cancel()
        navigate(added)
        return
      }

      /**
       * Cascading takes Base UI's array only as the REPORT of which row was
       * pressed, never as the answer.
       *
       * Base UI's next array is our current one with exactly one value added or
       * one removed, so the pressed node is recoverable from either direction -
       * and it has to be, because the answer it computed covers one row while
       * the commit covers a whole subtree.
       */
      if (cascade) {
        const nextValues = new Set(nextNodes.map((node) => node.value))
        const removed = selectedValues.find((entry) => !nextValues.has(entry))
        const toggled = added ?? (removed != null ? resolveNode(removed) : null)
        if (toggled) commit(toggled)
        return
      }

      if (
        max != null &&
        nextNodes.length > selectedValues.length &&
        nextNodes.length > max
      ) {
        details.cancel()
        // The third silent refusal site - the drag-select mouseup and every
        // other path the row-level veto cannot reach. Cancelling reverts the
        // press with no state change, so the live region is the only witness.
        announceNotice(labels.maxReachedAnnouncement(max))
        return
      }

      setSelection(nextNodes.map((node) => node.value))
      setQuery("")
    },
    [
      multiple,
      selectedValues,
      max,
      cascade,
      closeOnSelect,
      labels,
      announceNotice,
      isSelectable,
      isBranch,
      navigate,
      commit,
      resolveNode,
      setSelection,
      setQuery,
    ]
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean, details: ComboboxPrimitive.Root.ChangeEventDetails) => {
      if (details.isCanceled) return

      /**
       * Escape closes ONE popup at a time.
       *
       * `Combobox` builds no `FloatingTree`, so a `Popover` nested inside its
       * popup - the footer flyout - is not consulted first: the same Escape
       * reaches both, and without this the flyout and the cascader would
       * vanish together. The flyout has already closed itself by the time this
       * runs; its registration is cleared in an effect, so the set still reads
       * as occupied for exactly this event and is empty by the next Escape.
       */
      if (!nextOpen && details.reason === "escape-key" && hasOpenFlyout()) {
        details.cancel()
        return
      }

      // Base UI's own reason string, captured for the wrapped `onOpenChange`
      // above - which runs synchronously inside `setOpen`, so a ref written
      // just before the call is exact.
      openReasonRef.current = details.reason ?? "none"
      setOpen(nextOpen)

      if (!nextOpen) {
        setQuery("")
        return
      }

      // Opening onto the level that contains the current selection is the
      // difference between "edit this" and "start over". Without it a reopen
      // strands the user at whatever level they last browsed to, with the
      // selected row nowhere in sight.
      if (revealSelected) {
        setQuery("")
        const first = toArray(value)[0]
        setPathWithReason(
          first
            ? getCascaderPath(index, first)
                .slice(0, -1)
                .map((node) => node.value)
            : [],
          "reveal"
        )
      }
    },
    [
      setOpen,
      setQuery,
      revealSelected,
      value,
      index,
      setPathWithReason,
      hasOpenFlyout,
    ]
  )

  /* -------------------------------- context ------------------------------- */

  // Deliberately NOT memoised on anything else: see `CascaderRenderContextValue`.
  // Render props must always be the current closure, and only rows consume this.
  const renderContext = React.useMemo(
    () => ({ renderItem, renderLabel }),
    [renderItem, renderLabel]
  )

  /**
   * The stable half.
   *
   * Nothing in these deps moves on a keystroke, a level change or a highlight:
   * `index` is `useMemo([items])`, the three predicates are memoised on the
   * index, `selectable` and the selection, and every other entry is either a
   * scalar prop or a `[]`-dep callback. That is what makes `React.memo` on
   * `CascaderItem` actually hold while the user types.
   */
  // Destructured so the actions memo depends on the three stable callbacks
  // rather than on the loader object, which is republished on every load.
  const { active: hasLoader, loadMore, retryLevel, prefetchNode } = loader

  const actionsValue = React.useMemo<CascaderActionsContextValue<T>>(
    () => ({
      index,
      mode,
      multiple,
      cascade,
      branchesSelectable,
      indicator,
      expandTrigger,
      actions: resolvedActions,
      searchScope,
      maxHeight,
      inline: !!inline,
      invalid: !!invalid,
      baseId,
      labels,
      virtualized,
      registerVirtualRenderer,
      virtualize,
      virtualizeThreshold,
      estimateRowSize,
      overscan,
      hasLoader,
      loadMore,
      retryLevel,
      invalidateLevel,
      getIndex,
      getState,
      getHighlighted,
      setPath,
      pushLevel,
      popLevel,
      goToDepth,
      toggleExpanded,
      setFlyoutOpen,
      hasOpenFlyout,
      setQuery,
      setSelection,
      commit,
      navigate,
      navigateAt,
      resolveNode,
      isBranch,
      isSelectable,
      isSelected,
      isIndeterminate,
      selectedDescendantCount,
    }),
    [
      index,
      mode,
      multiple,
      cascade,
      branchesSelectable,
      indicator,
      expandTrigger,
      resolvedActions,
      searchScope,
      maxHeight,
      inline,
      invalid,
      baseId,
      labels,
      virtualized,
      registerVirtualRenderer,
      virtualize,
      virtualizeThreshold,
      estimateRowSize,
      overscan,
      hasLoader,
      loadMore,
      retryLevel,
      invalidateLevel,
      getIndex,
      getState,
      getHighlighted,
      setPath,
      pushLevel,
      popLevel,
      goToDepth,
      toggleExpanded,
      setFlyoutOpen,
      hasOpenFlyout,
      setQuery,
      setSelection,
      commit,
      navigate,
      navigateAt,
      resolveNode,
      isBranch,
      isSelectable,
      isSelected,
      isIndeterminate,
      selectedDescendantCount,
    ]
  )

  /**
   * The rows handed to Base UI, with a deliberately fresh array identity every
   * time windowing turns on and once more on the commit after it. That
   * identity is the ONLY thing that re-runs Base UI's `listRef` sizing effect;
   * see `virtualSyncs` above for why once is not enough.
   */
  const comboboxItems = React.useMemo(
    () => (virtualized ? renderedItems.slice() : renderedItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedItems, virtualized, virtualSyncs]
  )

  const comboboxValue = React.useMemo(() => {
    if (multiple) return selectedValues.map(resolveNode)
    return selectedValues.length ? resolveNode(selectedValues[0]) : null
  }, [multiple, selectedValues, resolveNode])

  return (
    // Every provider stores its value with the item generic erased; see
    // `useCascaderActions` / `useCascaderState`, which re-apply the caller's
    // own `T` on the way out.
    <CascaderActionsContext.Provider
      value={actionsValue as unknown as CascaderActionsContextValue}
    >
      <CascaderStateContext.Provider
        value={stateValue as unknown as CascaderStateContextValue}
      >
        <CascaderHighlightContext.Provider value={highlightStore}>
          <CascaderRenderContext.Provider
            value={renderContext as unknown as CascaderRenderContextValue}
          >
            <ComboboxPrimitive.Root
              items={renderedItems}
              // The empty frame that resets the highlight. See the comment above.
              filteredItems={swapping ? EMPTY : comboboxItems}
              // Filtering is ours: level vs deep search scope cannot be
              // expressed through Base UI's single matcher.
              filter={null}
              value={comboboxValue}
              onValueChange={handleComboboxValueChange}
              open={open}
              onOpenChange={handleOpenChange}
              inputValue={query}
              onInputValueChange={(next: string) => setQuery(next)}
              multiple={multiple}
              disabled={disabled}
              // Form wiring, straight through to Base UI's own hidden input.
              // Conditional spreads throughout: `mergeProps` iterates own keys
              // downstream, and an explicit `undefined` on a controlled prop
              // reads as "deleted" rather than "not supplied".
              name={name}
              {...(form != null ? { form } : null)}
              {...(id != null ? { id } : null)}
              {...(required != null ? { required } : null)}
              {...(readOnly != null ? { readOnly } : null)}
              {...(inputRef ? { inputRef } : null)}
              inline={inline}
              // Stops Base UI rendering its composite list, which is what makes
              // an explicit row `index` legal. `items` and `filteredItems` stay
              // exactly as they are: Base UI sizes `listRef` from them and
              // treats the holes a window leaves as enabled rows, and without
              // them ArrowDown stops dead at the last RENDERED row.
              virtualized={virtualized}
              itemToStringValue={(item: CascaderNode<T>) => item?.value ?? ""}
              itemToStringLabel={(item: CascaderNode<T>) => item?.label ?? ""}
              isItemEqualToValue={(a: CascaderNode<T>, b: CascaderNode<T>) =>
                a?.value === b?.value
              }
              // Fires on every arrow key AND on every pointer move across the
              // list, so it must never call setState. The ref serves the
              // keyboard handlers; the store serves anything that has to
              // re-render, and it de-dupes, so a pointer resting on one row is
              // free.
              onItemHighlighted={(
                item: CascaderNode<T> | undefined,
                details: ComboboxPrimitive.Root.HighlightEventDetails
              ) => {
                highlightedRef.current = item ?? null
                highlightStore.set({
                  index: details.index,
                  value: item?.value ?? null,
                })
                // Schedules a TIMEOUT and returns. This runs inside a layout
                // effect, so a synchronous setState here would be a render
                // phase cascade before the browser has painted the highlight.
                prefetchNode(item)
              }}
            >
              {children}
            </ComboboxPrimitive.Root>
          </CascaderRenderContext.Provider>
        </CascaderHighlightContext.Provider>
      </CascaderStateContext.Provider>
    </CascaderActionsContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Trigger                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Trigger.Props` describes the element's own props and stops short of `ref`,
 * which is why the shadcn combobox wrapper intersects the two as well. A form
 * library that reports an error on this field needs somewhere to put a ref, and
 * `onBlur` - the "touched" signal every form library asks for - lands here too,
 * because this is the focusable element outside the popup.
 */
export interface CascaderTriggerProps
  extends
    ComboboxPrimitive.Trigger.Props,
    Pick<React.ComponentPropsWithRef<"button">, "ref"> {
  /** Hides the trailing chevron, for a trigger that supplies its own. */
  showIcon?: boolean
}

function CascaderTrigger({
  className,
  children,
  showIcon = true,
  ref,
  ...props
}: CascaderTriggerProps) {
  const { invalid } = useCascaderActions()

  // `ref` is the one prop `mergeProps` does not merge, so it is taken off
  // `props` and chained by hand, exactly as `CascaderContent` chains its
  // popup ref.
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const setTrigger = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  /**
   * The audit measured 18 of 19 examples shipping an unnamed combobox, and
   * nothing says a word about it: the trigger renders, the picker works, and a
   * screen reader user hears the field's VALUE where its NAME should be - the
   * contents change with the selection, so "what is picked" is announced and
   * "what this field is for" never is. Checked in the DOM rather than in
   * props, because the name may legitimately arrive as a `<label for>` pairing
   * that no prop inspection can see.
   */
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const element = triggerRef.current
    if (!element) return
    const named =
      element.hasAttribute("aria-label") ||
      element.hasAttribute("aria-labelledby") ||
      element.closest("label") !== null ||
      (element.id !== "" &&
        element.ownerDocument.querySelector(
          `label[for="${CSS.escape(element.id)}"]`
        ) !== null)
    if (named) return
    warnCascaderOnce(
      "trigger-unnamed",
      "`CascaderTrigger` has no accessible name. Its contents are the field's VALUE - they change with the selection - so a screen reader hears what is picked but never what the field is for. Pass `aria-label` or `aria-labelledby`, or reference the trigger's `id` from a `<label>`."
    )
  })

  return (
    <ComboboxPrimitive.Trigger
      ref={setTrigger}
      data-slot="cascader-trigger"
      // Conditional spread, never `aria-invalid={invalid || undefined}`: Base
      // UI's `mergeProps` iterates own keys, so an explicit `undefined` deletes
      // whatever a `Field` wrapper had already put there.
      {...(invalid ? { "aria-invalid": true, "data-invalid": "" } : null)}
      className={cn("cn-combobox-trigger", className)}
      {...props}
    >
      {children}
      {showIcon ? (
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2}
          className="cn-combobox-trigger-icon pointer-events-none shrink-0"
        />
      ) : null}
    </ComboboxPrimitive.Trigger>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Chips                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ref for the chips container, to be handed to `CascaderContent`'s `anchor`.
 *
 * The chips container replaces the trigger, so the popup has to be positioned
 * against it instead. Exactly the shape the shadcn combobox uses, so the two
 * compose the same way.
 */
export function useCascaderAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export interface CascaderChipsProps
  extends
    Omit<ComboboxPrimitive.Chips.Props, "children">,
    Pick<React.ComponentPropsWithRef<"div">, "ref"> {
  /** Shown in place of the chips when nothing is selected. */
  placeholder?: React.ReactNode
  /**
   * How a `cascade` selection is condensed into chips. DISPLAY ONLY: the
   * stored value stays the full closure - that invariant is what keeps a
   * row's checked state an O(1) set lookup - and this maps it through
   * `getCascaderCheckedValues` at the render edge.
   *
   * - `"all"` (the default): one chip per stored value, as before.
   * - `"parent"`: a fully selected branch collapses to the branch's chip.
   * - `"child"`: only the deepest selected frontier gets chips.
   *
   * Removing a condensed chip removes its whole subtree closure and
   * reconciles the ancestors, so the display and the store cannot drift.
   */
  strategy?: CascaderCheckedStrategy
  /**
   * Replaces the chip list. Receives the resolved selection IN SELECTION ORDER
   * (condensed by `strategy` when one is set).
   *
   * Keep that order: Base UI removes a chip by its position among its
   * siblings, so a reordered list removes the wrong value.
   */
  children?: React.ReactNode | ((nodes: CascaderNode[]) => React.ReactNode)
}

/**
 * The multi-select trigger surface: one removable chip per selection.
 *
 * `CascaderValue` collapses a multi-selection to "3 selected", which is the
 * right default for a narrow trigger and useless the moment the user wants to
 * drop one of the three without reopening the panel. This is the other shape,
 * and it is a component rather than a recipe because getting it right needs
 * three things a recipe keeps getting wrong: the popup anchored to the chips
 * instead of to a trigger that no longer exists, an accessible name on every
 * remove button, and a label that disambiguates itself when two selections
 * from different branches happen to be called the same thing.
 *
 * Pair it with `useCascaderAnchor`:
 *
 * ```tsx
 * const anchor = useCascaderAnchor()
 *
 * <Cascader multiple items={items}>
 *   <CascaderChips ref={anchor} placeholder="Select attributes" />
 *   <CascaderContent anchor={anchor}>...</CascaderContent>
 * </Cascader>
 * ```
 */
function CascaderChips({
  className,
  children,
  placeholder,
  strategy = "all",
  ...props
}: CascaderChipsProps) {
  const {
    labels,
    multiple,
    invalid,
    resolveNode,
    index,
    isSelectable,
    setSelection,
  } = useCascaderActions()
  const { selectedValues } = useCascaderState()

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (multiple) return
    warnCascaderOnce(
      "chips-without-multiple",
      "`CascaderChips` renders one chip per selection and there is only ever one without `multiple`. Use `CascaderValue` for a single-select trigger."
    )
  }, [multiple])

  // DERIVED display, stored values untouched: the selection stays the full
  // closure and only the chips condense it.
  const displayedValues =
    strategy === "all"
      ? selectedValues
      : getCascaderCheckedValues(index, selectedValues, strategy)

  // Not memoised: `resolveNode` changes identity with the index and the array
  // is one entry per SELECTION, not per row, so the pass is trivially short.
  const nodes = displayedValues.map(resolveNode)
  const ambiguous = findAmbiguousCascaderLabels(nodes)

  /**
   * Removal for a CONDENSED chip. Base UI's own `ChipRemove` maps a press to
   * a position in the STORED value array, and once the chips are fewer than
   * the values that arithmetic removes the wrong one - so a condensed chip
   * carries its own remover, and it removes the chip's whole subtree closure:
   * the same deselect-and-reconcile a `cascade` row press performs, so a
   * parent chip's removal empties the branch instead of orphaning it.
   */
  const removeClosure = (node: CascaderNode) => {
    setSelection(
      applyCascadeSelection(
        index,
        selectedValues,
        node.value,
        false,
        isSelectable
      ),
      "deselect"
    )
  }

  const content = typeof children === "function" ? children(nodes) : children

  return (
    <ComboboxPrimitive.Chips
      data-slot="cascader-chips"
      // Base UI gives the container `role="toolbar"` so NVDA stays in focus
      // mode while arrowing between chips - and an unnamed toolbar is announced
      // as just "toolbar". Overridable: `{...props}` lands after it.
      aria-label={labels.chipsLabel}
      // Conditional spread, never an explicit `undefined`: `mergeProps`
      // iterates own keys. Every style keys its error treatment on
      // `.cn-combobox-chips:has([aria-invalid="true"])`.
      {...(invalid ? { "aria-invalid": true, "data-invalid": "" } : null)}
      className={cn("cn-combobox-chips", className)}
      {...props}
    >
      {content ??
        (nodes.length === 0 ? (
          <span
            data-slot="cascader-chips-placeholder"
            className="text-muted-foreground truncate"
          >
            {placeholder}
          </span>
        ) : (
          nodes.map((node) => (
            <CascaderChip
              key={node.value}
              node={node}
              // Only where the label alone would be ambiguous. A path on every
              // chip when nothing collides is noise in a very narrow space.
              showPath={ambiguous.has(node.value)}
              // Only a condensed chip needs the custom remover; the default
              // one-chip-per-value shape keeps Base UI's positional removal,
              // which is what routes it through the root's `setSelection`.
              {...(strategy !== "all"
                ? { onRemove: () => removeClosure(node) }
                : null)}
            />
          ))
        ))}
    </ComboboxPrimitive.Chips>
  )
}

export interface CascaderChipProps extends Omit<
  ComboboxPrimitive.Chip.Props,
  "children"
> {
  node: CascaderNode
  /** Prefix the label with its ancestor trail. */
  showPath?: boolean
  /** Trail segments to show, the node itself included. */
  maxSegments?: number
  /** Hides the remove button, for a read-only chip. */
  showRemove?: boolean
  /**
   * Replaces Base UI's positional removal for this chip - pressing the remove
   * button (or Backspace/Delete on the chip) runs this instead. `CascaderChips`
   * supplies it for a `strategy`-condensed chip, whose position no longer maps
   * onto the stored value array.
   */
  onRemove?: () => void
  /** Replaces the chip's label. The remove button is still rendered. */
  children?: React.ReactNode
}

/** Base UI hands its chip handlers events carrying the veto hook. */
type CascaderChipKeyEvent = Parameters<
  NonNullable<ComboboxPrimitive.Chip.Props["onKeyDown"]>
>[0]

type CascaderChipRemoveClickEvent = Parameters<
  NonNullable<ComboboxPrimitive.ChipRemove.Props["onClick"]>
>[0]

/**
 * One chip.
 *
 * Removal goes through Base UI's own `ChipRemove`, which reports the shortened
 * selection to the root - so it lands in exactly the same `setSelection` every
 * other deselection does, reason and details included, and `cascade` applies to
 * a chip press as it does to a row press.
 */
function CascaderChip({
  className,
  node,
  showPath = false,
  maxSegments = 2,
  showRemove = true,
  onRemove,
  children,
  ...props
}: CascaderChipProps) {
  const { labels, index } = useCascaderActions()

  const chain = showPath ? getCascaderPath(index, node.value) : []
  const segments = collapseCascaderPath(chain, {
    maxSegments,
    collapse: "start",
  })

  const label = segments.length
    ? segments
        .map((segment) => (segment.type === "node" ? segment.node.label : "…"))
        .join(` ${labels.pathSeparator} `)
    : node.label

  return (
    <ComboboxPrimitive.Chip
      data-slot="cascader-chip"
      // The keyboard half of `onRemove`: Base UI's chip removes ITSELF by
      // position on Backspace/Delete, which is the exact arithmetic a
      // condensed chip must not use. The veto runs first (consumer handlers
      // chain before Base UI's own), so the closure removal replaces the
      // positional one on the same keys.
      {...(onRemove
        ? {
            onKeyDown: (event: CascaderChipKeyEvent) => {
              if (event.key !== "Backspace" && event.key !== "Delete") return
              event.preventBaseUIHandler()
              onRemove()
            },
          }
        : null)}
      className={cn(
        "cn-combobox-chip has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children ?? <span className="truncate">{label}</span>}
      {showRemove ? (
        <ComboboxPrimitive.ChipRemove
          data-slot="cascader-chip-remove"
          // An icon-only button with no name is a "button" and nothing else to
          // a screen reader, and there is one per selection. Named after what
          // the chip DISPLAYS, not after the bare node label: two chips
          // disambiguated to "Customers / Created at" and "Orders / Created at"
          // would otherwise both be announced as "Remove Created at".
          aria-label={labels.removeChip(label)}
          // The pointer half of `onRemove`, same veto, same reason.
          {...(onRemove
            ? {
                onClick: (event: CascaderChipRemoveClickEvent) => {
                  event.preventBaseUIHandler()
                  onRemove()
                },
              }
            : null)}
          className="cn-combobox-chip-remove"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2}
            className="cn-combobox-chip-indicator-icon pointer-events-none"
          />
        </ComboboxPrimitive.ChipRemove>
      ) : null}
    </ComboboxPrimitive.Chip>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Content                                  */
/* -------------------------------------------------------------------------- */

export interface CascaderContentProps
  extends
    ComboboxPrimitive.Popup.Props,
    /**
     * Base UI's positioner surface, forwarded as-is so an unusual anchor
     * situation (a sticky toolbar, a scroll container that clips, a fixed
     * layout) does not force the consumer to rebuild the whole content stack.
     * Note there is no `trackAnchor` here: Base UI 1.5.0's positioner does
     * not have one.
     */
    Pick<
      ComboboxPrimitive.Positioner.Props,
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "anchor"
      | "collisionBoundary"
      | "collisionPadding"
      | "sticky"
      | "positionMethod"
    >,
    /** Where the portal mounts, for a shadow root or a scoped stacking context. */
    Pick<ComboboxPrimitive.Portal.Props, "container"> {}

/**
 * Portal + Positioner + floating panel.
 *
 * Unlike the shadcn `ComboboxContent` wrapper this does not clamp the popup to
 * the anchor width: a cascader panel is routinely wider than its trigger, and
 * columns mode is wider again. It keeps the `group/combobox-content` marker
 * because `.cn-combobox-empty` is defined in terms of it.
 */
function CascaderContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  collisionBoundary,
  collisionPadding,
  sticky,
  positionMethod,
  container,
  ref,
  ...props
}: CascaderContentProps) {
  const { labels } = useCascaderActions()
  const popupRef = React.useRef<HTMLDivElement | null>(null)

  // The popup element is needed by `initialFocus` below, and `ref` is the one
  // prop `mergeProps` does NOT merge - so it is taken off `props` and chained
  // here rather than left to the spread, where a consumer's own ref would
  // silently replace this one.
  const setPopup = React.useCallback(
    (node: HTMLDivElement | null) => {
      popupRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  /**
   * Where focus goes when the popup opens: the search field, in every case.
   *
   * That is where the level keys and `aria-activedescendant` live, so it is
   * where focus belongs in this composition however the popup was opened. Base
   * UI's own default says the same thing - but it is COMPUTED FROM THE FIRST
   * RENDER of the popup, when `inputInsidePopup` is still false and
   * `inputElement` still null because the field is a descendant that has not
   * mounted yet, and in that state the default collapses to `false`, which
   * means "do not move focus". Measured: opening from the KEYBOARD left focus
   * on the trigger, outside the panel, so the panel's own Tab handler never saw
   * the first Tab and the browser spent it walking Base UI's focus guards into
   * the popup - one press to get in, a second to reach the footer. Opening with
   * the POINTER landed on the field and reached the footer in one.
   *
   * `initialFocus` rather than an effect of our own, for the same reason
   * `CascaderSubmenuContent` uses the popover's: Base UI runs its focus manager
   * on open, and anything scheduled alongside it is a race. Resolving the field
   * INSIDE the callback (it runs a microtask after the layout effects, so the
   * field is mounted by then) is what fixes the stale-closure half.
   *
   * Touch is handed back to Base UI's rule deliberately - focusing the popup
   * rather than the field is what keeps the Android virtual keyboard shut - and
   * an unresolved field falls through to `true`, Base UI's "first tabbable
   * element, or the popup itself". Neither branch can leave focus outside the
   * panel. `inline` cascaders never render this component, so nothing here can
   * steal focus on page load.
   */
  const initialFocus = React.useCallback((openType: string) => {
    const popup = popupRef.current
    if (!popup) return true
    if (openType === "touch") return popup
    return (
      popup.querySelector<HTMLElement>('[data-slot="cascader-input"]') ?? true
    )
  }, [])

  return (
    // Conditional spreads throughout, never `prop={maybeUndefined}`: Base UI
    // merges props by iterating own keys, so an explicit `undefined` reads as
    // "deleted" rather than "not supplied". Defaults are untouched - a prop
    // the consumer did not pass never reaches the element at all.
    <ComboboxPrimitive.Portal
      {...(container !== undefined ? { container } : null)}
    >
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        {...(collisionBoundary !== undefined ? { collisionBoundary } : null)}
        {...(collisionPadding !== undefined ? { collisionPadding } : null)}
        {...(sticky !== undefined ? { sticky } : null)}
        {...(positionMethod !== undefined ? { positionMethod } : null)}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          ref={setPopup}
          data-slot="cascader-content"
          // The input lives inside the popup, so Base UI gives it
          // `role="dialog"` - and an unnamed dialog is announced as just
          // "dialog". Overridable: `{...props}` lands after it.
          aria-label={labels.panelLabel}
          initialFocus={initialFocus}
          className={cn(
            "cn-combobox-content cn-combobox-content-logical cn-menu-target cn-menu-translucent group/combobox-content relative flex max-h-(--available-height) max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) flex-col",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Panel                                   */
/* -------------------------------------------------------------------------- */

export type CascaderPanelProps = useRender.ComponentProps<"div">

/**
 * The nav + list(s) + footer container, with no positioning of its own.
 *
 * Used inside `CascaderContent` for the popover case, and directly for the
 * embedded case (pair it with `<Cascader inline>`). Keeping popup concerns out
 * of the panel is what makes the embedded case free rather than a second
 * implementation.
 *
 * `min-h-0` and `max-h-full` are the load-bearing half of the class list, not
 * decoration. This is the shrinking flex parent between the popup (or, when
 * embedded, whatever box the consumer gives it) and the list, and a flex child
 * without `min-h-0` refuses to shrink below its content - which is the single
 * most common reason a scroll area silently never scrolls. The EMBEDDED case is
 * where it matters most: there is no positioner to publish
 * `--available-height`, so the only thing bounding the list is the height its
 * parent chain hands down, and one missing `min-h-0` anywhere above breaks it.
 *
 * It also owns the panel's TAB ORDER, which is not a decoration either. The
 * scroll area between the field and the pinned footer makes itself a tab stop
 * whenever the level overflows, so the footer sat a variable number of Tab
 * presses away behind an unnamed `role="presentation"` stop that drew a focus
 * ring around the whole list - which reads as "the footer is unreachable". The
 * panel is the only element that is an ancestor of BOTH ends of that move in
 * both shapes (the popup case renders it inside `CascaderContent`, the
 * embedded case renders it alone), so it is the one place the correction can
 * live: `CascaderContent` does not exist when embedded, and `CascaderFooter`
 * is a sibling of the list rather than an ancestor of the field, so a key
 * pressed in the field never reaches it.
 */
function CascaderPanel({ className, ...props }: CascaderPanelProps) {
  const { mode } = useCascaderActions()

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab" || event.defaultPrevented) return
      // A browser-level move (Ctrl+Tab switches tabs) is never ours.
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const panel = event.currentTarget
      const target = event.target as HTMLElement | null
      if (!target || !panel.contains(target)) return

      const next = getCascaderTabTarget(panel, target, event.shiftKey)
      // Off either end of the panel. Left to the browser on purpose: leaving
      // the cascader is what dismisses it, and focus is never trapped in here.
      if (!next) return

      event.preventDefault()
      next.focus()
      // Nothing is announced for the move itself. The control it lands on says
      // what it is, and a live-region message on every Tab would be noise.
    },
    []
  )

  const defaultProps = {
    "data-slot": "cascader-panel",
    "data-mode": mode,
    // In `defaultProps` rather than wrapped around `props.onKeyDown`, because
    // `mergeProps` chains handlers right to left: a consumer's own `onKeyDown`
    // runs FIRST and can drop this one with `event.preventBaseUIHandler()`.
    onKeyDown: handleKeyDown,
    className: cn("flex max-h-full min-h-0 w-full flex-col", className),
  }

  return useRender({
    defaultTagName: "div",
    render: props.render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export interface CascaderListProps extends Omit<
  ComboboxPrimitive.List.Props,
  "style"
> {
  /**
   * Applied to the OUTER shell, which is the element that owns the height, so
   * an inline `--cascader-max-height` lands where the bound can read it.
   *
   * Narrowed from Base UI's `style`, which also accepts a state callback: the
   * shell is a plain `<div>` and has no list state to hand one.
   */
  style?: React.CSSProperties
  /**
   * Caps this level's height. Optional, and a CAP rather than a height: the
   * panel still shrinks to whatever room the viewport actually leaves. Omit it
   * and the cap is 24rem.
   */
  maxHeight?: number | string
}

/**
 * Scroll container for one level.
 *
 * Pattern 3 of the house scroll reference - viewport-bounded popup scroll - and
 * it is worth stating why, because this file used to get it wrong in the exact
 * way the reference calls out. `.cn-combobox-list` is `overflow-y-auto` with a
 * max-height that assumes ONE list under ONE input, which is wrong for columns
 * mode; the fix at the time was `maxHeight` in pixels, published as
 * `--cascader-max-height` and applied with `!`. That traded one wrong height
 * for another: a panel opened 200px above the fold still reserved 288px and
 * spilled off screen, and a tall window never got to use the room it had.
 *
 * The height now comes from `--available-height`, which the positioner
 * publishes as the space between the anchor and the edge of the viewport, and
 * `maxHeight` only decides how tall the panel may get when there is room to
 * spare. `min()` of the two, so whichever is smaller wins and neither can be
 * ignored. The four classes that express it are shared with `CascaderColumns`
 * and defined in `cascader-lib.tsx`.
 */
function CascaderList({
  className,
  style,
  maxHeight: maxHeightProp,
  ...props
}: CascaderListProps) {
  const { maxHeight, mode, labels, baseId, virtualized } = useCascaderActions()
  const { currentParent } = useCascaderState()
  const resolved = maxHeightProp ?? maxHeight

  return (
    <div
      data-slot="cascader-list-shell"
      style={
        resolved != null
          ? ({
              ...style,
              "--cascader-max-height":
                typeof resolved === "number" ? `${resolved}px` : resolved,
            } as React.CSSProperties)
          : style
      }
      className={cn(
        "relative flex max-h-full min-h-0",
        CASCADER_LIST_PAD_CLASS
      )}
    >
      <div
        data-slot="cascader-list-bounds"
        className={cn(
          "flex w-full min-w-0 flex-col overscroll-contain",
          CASCADER_LIST_HEIGHT_CLASS
        )}
      >
        <ScrollArea className={CASCADER_SCROLL_CLASS}>
          <ComboboxPrimitive.List
            data-slot="cascader-list"
            // Base UI names the list nothing at all, so every mode shipped an
            // unnamed listbox. The level's own parent is the name; the root
            // borrows a label.
            aria-label={currentParent?.label ?? labels.rootLevel}
            // Replaces Base UI's internal floating id. `aria-controls` on the
            // input reads the element's live id, so overriding it keeps that
            // wiring intact while giving the columns trail a predictable target
            // to point at.
            id={`${baseId}-column-0`}
            // NEVER `role={mode === "tree" ? "treeitem" : undefined}`: Base
            // UI's `mergeProps` iterates own keys, so an explicit `undefined`
            // DELETES its `role="listbox"` instead of leaving it alone.
            // Conditional spread only.
            {...(mode === "tree" ? { role: "tree" as const } : null)}
            // Same rule, same reason: a conditional spread, so nothing is
            // deleted from Base UI's own props when the list is not windowed.
            {...(virtualized ? { "data-virtualized": true } : null)}
            className={cn(
              CASCADER_ROWS_CLASS,
              // A windowed row is absolutely positioned, so the ROWS' box has
              // to be its containing block. Deliberately not the scrollport:
              // this is the element that carries the padding the windowed
              // geometry is measured against, and the two must be the same
              // element or every row sits one padding out.
              virtualized && "relative",
              className
            )}
            {...props}
          />
        </ScrollArea>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Empty / Loading                               */
/* -------------------------------------------------------------------------- */

export interface CascaderEmptyProps extends ComboboxPrimitive.Empty.Props {
  /**
   * @deprecated Ignored since the loading surface stopped drawing skeletons.
   *
   * Skeleton rows promised a shape the level did not necessarily have - three
   * grey bars ahead of a level that came back with one row, or twelve - and
   * they cost a second layout when the real rows arrived. The surface says
   * what it is doing instead, in the one line of text every style already
   * centres there, and the visible progress the request actually has a place
   * for is the SPINNER ON THE BRANCH ROW: `CascaderItem` swaps its chevron for
   * one in place while that branch's children load, which is where a
   * drill-down user's eye already is.
   *
   * Kept in the type so an existing call site still compiles.
   */
  skeletonRows?: number
}

/**
 * The empty, loading and error surface, in ONE element that never unmounts.
 *
 * Base UI's `Combobox.Empty` renders whenever `filteredItems.length === 0`,
 * which is exactly as true of a level that is still fetching as of one that
 * came back with nothing. Swapping a sibling in and out would therefore have
 * announced "No results found." over every async level on its way to loading.
 * Swapping the CHILDREN keeps one element, one mount, and one announcement.
 */
function CascaderEmpty({
  className,
  children,
  // Accepted and ignored; see the deprecation note on the prop. Destructured
  // rather than left in `...props` so it is never spread onto the DOM node.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  skeletonRows,
  ...props
}: CascaderEmptyProps) {
  const { labels, retryLevel } = useCascaderActions()
  const { query, path, searchState } = useCascaderState()
  // The level whose emptiness is on screen: drill and columns show the deepest
  // open one, tree always shows the root.
  const levelKey = path.length ? path[path.length - 1] : CASCADER_ROOT_KEY
  const loadState = useCascaderLoadState(levelKey)
  const state = query.trim() ? (searchState ?? loadState) : loadState

  let body: React.ReactNode = children ?? labels.empty

  if (state?.error) {
    body = (
      <span
        data-slot="cascader-error"
        className="flex flex-col items-center gap-1.5"
      >
        <span>{labels.error}</span>
        <button
          type="button"
          data-slot="cascader-retry"
          // A real button, because this one lives OUTSIDE the listbox. The
          // in-list paging row cannot have one: a focusable element inside a
          // `role="option"` is a `nested-interactive` violation.
          onClick={() => retryLevel(levelKey)}
          className="text-foreground hover:bg-accent focus-visible:ring-ring/50 rounded-md px-2 py-0.5 font-medium outline-hidden transition-colors focus-visible:ring-2"
        >
          {labels.retry}
        </button>
      </span>
    )
  } else if (state?.loading) {
    body = (
      <span
        data-slot="cascader-loading"
        className="flex w-full items-center justify-center"
      >
        {labels.loading}
      </span>
    )
  }

  return (
    <ComboboxPrimitive.Empty
      data-slot="cascader-empty"
      data-state={state?.error ? "error" : state?.loading ? "loading" : "empty"}
      className={cn("cn-combobox-empty", className)}
      // The ONE place an explicit `undefined` is the right tool. Base UI's
      // `mergeProps` iterates own keys, so passing it DELETES its live region -
      // which is exactly what is wanted here. `CascaderStatus` is the single
      // live region; leaving this one in place both duplicated every
      // announcement and announced "No results found." on every level swap,
      // because the swap renders one deliberately empty frame to reset the
      // highlight.
      role={undefined}
      aria-live={undefined}
      aria-atomic={undefined}
      {...props}
    >
      {body}
    </ComboboxPrimitive.Empty>
  )
}

export type CascaderStatusProps = ComboboxPrimitive.Status.Props

/**
 * Polite live region describing the current level and result count. Drill-down
 * hides that context in a visual breadcrumb, so without this a screen reader
 * user has no idea the list changed underneath them.
 *
 * Built on `Combobox.Status` rather than a hand-rolled `role="status"` div, so
 * it inherits Base UI's initial-mutation marker: Safari/VoiceOver needs a text
 * change roughly 200ms after mount before it will read a polite region at all,
 * and the FIRST announcement is the one most likely to be dropped without it.
 */
function CascaderStatus({
  className,
  children,
  ...props
}: CascaderStatusProps) {
  const { announcement } = useCascaderState()

  return (
    <ComboboxPrimitive.Status
      data-slot="cascader-status"
      className={cn("sr-only", className)}
      {...props}
    >
      {children ?? announcement}
    </ComboboxPrimitive.Status>
  )
}

export {
  Cascader,
  CascaderTrigger,
  CascaderChip,
  CascaderChips,
  CascaderContent,
  CascaderPanel,
  CascaderList,
  CascaderEmpty,
  CascaderStatus,
}

/**
 * The context surface moved to `cascader-context.tsx` in the Phase C split, so
 * it is re-exported here: every existing import path keeps working, and the row
 * component can import the contexts without an import cycle through this file.
 */
export {
  createCascaderHighlightStore,
  useCascaderActions,
  useCascaderHighlight,
  useCascaderRender,
  useCascaderState,
}

export type {
  CascaderActionsContextValue,
  CascaderColumn,
  CascaderHighlight,
  CascaderHighlightStore,
  CascaderItemState,
  CascaderRenderContextValue,
  CascaderStateContextValue,
}
