// @ts-nocheck
import type * as React from "react"

/**
 * A single node in the cascader tree.
 *
 * Two input shapes are supported and both normalize to the same internal index:
 *
 * - **Nested**: nodes carry `children`.
 * - **Flat adjacency**: nodes carry no `children` and the root receives
 *   `getParent`, which returns each node's parent value (`null`/`undefined` for
 *   a root node). Preferred for large, normalized datasets because it skips the
 *   re-nesting step entirely.
 */
export interface CascaderNode<T = unknown> {
  /** Stable, unique identifier. Also the committed selection value. */
  value: string
  /** Human readable label. Used for display, filtering and typeahead. */
  label: string
  /** Leading icon rendered by the default row. */
  icon?: React.ReactNode
  /** Secondary line rendered under the label by the default row. */
  description?: string
  /** Nested children. Omit when supplying a flat list plus `getParent`. */
  children?: CascaderNode<T>[]
  /**
   * Marks a node as a branch before its children are known. Required for async
   * nodes, otherwise the node renders as a selectable leaf until it is loaded.
   */
  hasChildren?: boolean
  /**
   * Trailing count shown by the default row. Falls back to the number of known
   * children. Set it explicitly for async nodes, where the real total is known
   * to the server before the children are fetched.
   */
  count?: number
  /** Disabled nodes stay in the accessibility tree and are not selectable. */
  disabled?: boolean
  /** Extra terms matched by level and deep search alongside the label. */
  keywords?: string[]
  /**
   * Async paging: another page of children is available for this node.
   *
   * Only read when the node arrives nested inside a `getChildren` result. The
   * authoritative signal for the level the node OWNS is `hasMore` on that
   * level's own `CascaderLoadResult`.
   */
  hasMore?: boolean
  /** Arbitrary payload. Carried through to every render callback untouched. */
  data?: T
}

/**
 * One footer ACTION.
 *
 * Deliberately not a `CascaderNode`. An action is a command - "Create new
 * attribute", "Import from CSV" - and it must never join the option ring, the
 * filter set or the selection: the three modes stay the only way to move
 * through the data tree. The two types are kept apart so that distinction
 * cannot be blurred by passing one where the other is expected.
 */
export interface CascaderActionItem {
  /** Stable key. Falls back to the label when it is a string, then the index. */
  value?: string
  label: React.ReactNode
  /** Leading icon. */
  icon?: React.ReactNode
  disabled?: boolean
  /** Pressed. Ignored when `items` is present - a flyout opens instead. */
  onSelect?: () => void
  /**
   * Turns the row into a submenu trigger that opens a side-anchored flyout
   * listing these entries. One level deep on purpose: a footer is for
   * commands, and a command list that nests is a menu bar in disguise.
   */
  items?: CascaderActionItem[]
  /**
   * Group heading rendered above this entry inside a flyout. Consecutive
   * entries sharing a heading are drawn under one.
   */
  group?: string
}

/** Panel layout. See the docs for the keyboard map of each. */
export type CascaderMode = "drill" | "columns" | "tree"

/** Which nodes a search query is matched against. */
export type CascaderSearchScope = "level" | "deep"

/**
 * Which nodes may be committed as a selection.
 *
 * The predicate arm is generic over the item payload rather than universally
 * quantified per call: a per-call `<T>` would force every predicate to accept
 * EVERY payload, so an annotated `(node: CascaderNode<Member>) => boolean`
 * could never satisfy it. The default argument keeps a bare
 * `CascaderSelectable` meaning what it always meant.
 */
export type CascaderSelectable<T = unknown> =
  | "leaf"
  | "any"
  | ((node: CascaderNode<T>) => boolean)

/** How a path is shortened when it does not fit. */
export type CascaderCollapse = "middle" | "start" | "none"

/** What the trigger renders for the current selection. */
export type CascaderValueDisplay = "path" | "leaf" | "count"

/** Why `onValueChange` fired. */
export type CascaderChangeReason = "select" | "deselect" | "clear"

/**
 * Second argument handed to `onValueChange`.
 *
 * The value alone is a bare id, which every consumer then has to look back up
 * in its own data. The details object hands over the resolved nodes instead, so
 * the common cases - "what did they just pick", "what is its path", "what is
 * selected now" - need no lookup at the call site.
 */
export interface CascaderChangeDetails<T = unknown> {
  /** The node that was committed or toggled. Null when the selection was cleared. */
  node: CascaderNode<T> | null
  /** Ancestor chain of `node`, root first, node last. */
  path: CascaderNode<T>[]
  /** Every currently selected node, resolved. */
  nodes: CascaderNode<T>[]
  reason: CascaderChangeReason
}

/**
 * Normalized view of the item tree. Built once per `items` identity and shared
 * by every mode, search and virtualizer, so no consumer input shape reaches the
 * render path directly.
 */
export interface CascaderIndex<T = unknown> {
  /** Every node by value. */
  byValue: Map<string, CascaderNode<T>>
  /** Children by parent value. Root children are keyed by `ROOT_KEY`. */
  childrenOf: Map<string, CascaderNode<T>[]>
  /** Parent value by node value. `null` for root nodes. */
  parentOf: Map<string, string | null>
  /** Zero-based depth by node value. */
  depthOf: Map<string, number>
  /** Top level nodes, in input order. */
  roots: CascaderNode<T>[]
  /** Every node in a stable, depth-first order. Used by deep search. */
  all: CascaderNode<T>[]
}

/** One row of a flattened tree-mode list. */
export interface CascaderFlatNode<T = unknown> {
  node: CascaderNode<T>
  depth: number
  /** Whether the node is a branch (known children, or `hasChildren`). */
  branch: boolean
  /** Whether a branch is currently expanded. */
  expanded: boolean
  /** Number of siblings, for `aria-setsize`. */
  setSize: number
  /** One-based index among siblings, for `aria-posinset`. */
  posInSet: number
}

/** One segment of a rendered path, after collapsing. */
export type CascaderPathSegment<T = unknown> =
  | { type: "node"; node: CascaderNode<T> }
  | { type: "ellipsis"; hidden: CascaderNode<T>[] }

/**
 * Async load state for a single node's children.
 *
 * Deliberately WITHOUT a `status` field. The discriminator between "declared a
 * branch but never fetched" and "fetched and genuinely empty" is MAP
 * MEMBERSHIP, not a value: a level with no entry has never been loaded, and a
 * level with an entry, no `loading`, no `error` and no children is empty for
 * real. A status field would be a second, redundant source of that truth and
 * the two would eventually disagree.
 */
export interface CascaderLoadState {
  /** A request for this level is in flight. */
  loading: boolean
  /** The last request for this level failed. Cleared by a retry. */
  error: boolean
  /** More pages are available for this node. */
  hasMore: boolean
  /** Opaque cursor handed back to `getChildren` for the next page. */
  cursor?: string
}

/** Why the cascader asked for a level. */
export type CascaderLoadReason =
  /** The level became visible. */
  | "level"
  /** The next page of an already loaded level. */
  | "more"
  /** Speculative fetch for a highlighted branch, from `prefetch`. */
  | "prefetch"
  /** The user pressed retry after a failure. */
  | "retry"
  /** `resolveValue` is resolving a selection whose node is not loaded. */
  | "resolve"

/** Argument handed to `getChildren`. */
export interface CascaderLoadContext {
  /** Aborted when the request is superseded or the popup closes. */
  signal: AbortSignal
  /** Cursor returned by the previous page, or `undefined` for the first. */
  cursor?: string
  /**
   * Why the level is being fetched. Additive: a loader that ignores it behaves
   * exactly as it did before the field existed.
   */
  reason?: CascaderLoadReason
}

/** Value returned by `getChildren`. A bare array is also accepted. */
export interface CascaderLoadResult<T = unknown> {
  items: CascaderNode<T>[]
  nextCursor?: string
  /** Defaults to whether `nextCursor` was supplied. */
  hasMore?: boolean
}

/** Argument handed to `onSearch`. */
export interface CascaderSearchContext {
  /** Aborted when the query changes or the popup closes. */
  signal: AbortSignal
  /** The path the user is searching within, deepest last. */
  path: string[]
}

/**
 * Every user facing string, so the primitive ships no hardcoded copy.
 *
 * Callbacks take plain labels rather than nodes on purpose: a `CascaderNode<T>`
 * parameter would force the labels object to carry the item generic, and a
 * concrete `CascaderNode<string>` would then fail to satisfy it.
 */
export interface CascaderLabels {
  /** Placeholder for the search input. Receives the current level's label. */
  search: string | ((parentLabel?: string) => string)
  back: string
  /** Shown while a level's FIRST page is in flight. */
  loading: string
  /** Shown on the paging row while the NEXT page is in flight. */
  loadingMore: string
  /**
   * The idle paging affordance. `loadingMore` is what replaces it once the
   * request is in flight, so the two cannot share one string.
   */
  loadMore: string
  /** Shown when a level failed to load. */
  error: string
  /** The retry affordance rendered next to `error`. */
  retry: string
  empty: string
  /** Rendered by `CascaderValue` when `display="count"`. */
  selectedCount: (count: number) => string
  /** Accessible name of the in-panel breadcrumb trail. */
  breadcrumbLabel: string
  /** Accessible name of the chips container. Base UI gives it `role="toolbar"`. */
  chipsLabel: string
  /** Accessible name of a chip's remove button. Receives the chip's own label. */
  removeChip: (label: string) => string
  /**
   * Separator between ancestors in a deep-search row's path line and in a
   * path-disambiguated chip. Not every locale writes a trail with a slash.
   */
  pathSeparator: string
  /**
   * Accessible name of the root level, used wherever there is no parent node to
   * name it: the list, the first column, and the root announcement.
   */
  rootLevel: string
  /**
   * Appended to a branch row's accessible name, so "Person 24" reads as
   * "Person, 24 items" rather than as a number glued to a label.
   */
  itemCount: (count: number) => string
  /**
   * Appended to a branch row's accessible name outside tree mode, where the
   * row opens another list instead of expanding in place.
   */
  branchAffordance: string
  /**
   * Appended to a selected trail row's accessible name. Only the columns trail
   * needs it: those rows are plain buttons, so they carry no `aria-selected`.
   */
  selectedState: string
  /**
   * The `cascade` counterpart of `selectedState`, for a trail row with some but
   * not all of its subtree selected. Option rows say this with
   * `aria-checked="mixed"`; a `role="button"` trail row may not carry it.
   */
  partiallySelectedState: string
  /** Accessible name of the columns container. */
  columnsLabel: string
  /** Accessible name of the pinned footer holding the actions. */
  actionsLabel: string
  /**
   * Appended to a submenu trigger's accessible name, so a footer row that
   * opens a flyout is not announced identically to one that fires.
   */
  submenuAffordance: string
  /** Accessible name of the popup. */
  panelLabel: string
  /**
   * Visually hidden description of the arrow-key model, read per mode AND per
   * writing direction: the level keys mirror in RTL, so a hint that names the
   * LTR keys there teaches exactly the wrong ones.
   */
  keyboardHint: (mode: CascaderMode, dir: "ltr" | "rtl") => string
  /** Announced by the live region when navigation returns to the root level. */
  rootAnnouncement: (count: number) => string
  /** Announced by the live region when a tree branch expands. */
  expandedAnnouncement: (label: string, count: number) => string
  /** Announced by the live region when a tree branch collapses. */
  collapsedAnnouncement: (label: string) => string
  /** Announced by the live region on a level change. */
  levelAnnouncement: (
    parentLabel: string,
    depth: number,
    count: number
  ) => string
  /** Announced by the live region after filtering. */
  resultsAnnouncement: (count: number) => string
  /** Announced by the live region when `max` blocks a further selection. */
  maxReachedAnnouncement: (max: number) => string
  /**
   * Announced by the live region when a `cascade` commit sweeps a branch's
   * subtree along with it. `count` is how many descendants followed the
   * branch, and `selecting` distinguishes the two directions of the sweep.
   */
  cascadeAnnouncement: (
    label: string,
    count: number,
    selecting: boolean
  ) => string
  /**
   * Announced by the live region while a server search (`onSearch`) is in
   * flight. Distinct from `loadingMore`, which names the next PAGE of a
   * level: announcing a search as paging misreads what the user is waiting
   * for.
   */
  searchingAnnouncement: string
}