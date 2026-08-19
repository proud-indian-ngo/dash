// @ts-nocheck
import * as React from "react"
import type {
  CascaderActionItem,
  CascaderChangeReason,
  CascaderFlatNode,
  CascaderIndex,
  CascaderLabels,
  CascaderLoadState,
  CascaderMode,
  CascaderNode,
  CascaderSearchScope,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"

/**
 * The cascader publishes its internals through FOUR channels, not one, because
 * they change at wildly different rates and a row must not re-render at the
 * rate of the fastest one:
 *
 * | Channel | Republishes when | Consumed by |
 * | :-- | :-- | :-- |
 * | actions | `items`, `selectable`, the selection, or a config prop changes | every part, rows included |
 * | state | every keystroke, navigation and selection | lists, nav, status |
 * | render | the `renderItem` / `renderLabel` identities change | rows |
 * | highlight | every arrow key and every pointer move over the list | the virtualizer |
 *
 * A single context republished on all four schedules at once, which meant one
 * keystroke re-rendered every row in the level even though nothing a row reads
 * had changed. Splitting them is what makes `React.memo` on the row worth
 * anything at all.
 */

/* -------------------------------------------------------------------------- */
/*                                Shared types                                */
/* -------------------------------------------------------------------------- */

/** One open level in columns mode. */
export interface CascaderColumn<T = unknown> {
  /** The node this column lists the children of, or null for the root column. */
  parent: CascaderNode<T> | null
  items: CascaderNode<T>[]
  /** Depth of this column, 0 for the root column. */
  depth: number
  /** The node in this column that is currently drilled into, if any. */
  activeValue: string | null
  /** Whether this is the deepest column, the one Base UI owns. */
  active: boolean
}

/** State handed to `renderItem`. */
export interface CascaderItemState<T = unknown> {
  branch: boolean
  selected: boolean
  disabled: boolean
  depth: number
  count: number
  /** Ancestor chain, root first. Populated for deep-search rows. */
  path: CascaderNode<T>[]
}

/* -------------------------------------------------------------------------- */
/*                                    State                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything derived from the query, the path and the selection.
 *
 * Volatile by construction: typing one character rebuilds most of it. Subscribe
 * only from components that genuinely render a list, a breadcrumb or a count -
 * never from a row.
 */
export interface CascaderStateContextValue<T = unknown> {
  /**
   * Normalized view of the item tree.
   *
   * Also published on the actions context, from the same `useMemo` and so with
   * the same identity. Rows need it for counts, depths and deep-search paths
   * without subscribing to anything keystroke-volatile.
   */
  index: CascaderIndex<T>
  /** Drill/columns navigation path, deepest last. */
  path: string[]
  /** Tree mode expansion. */
  expanded: ReadonlySet<string>
  query: string
  /** Node the current level belongs to, or `null` at the root. */
  currentParent: CascaderNode<T> | null
  /** Rows for the current level, already filtered. */
  levelItems: CascaderNode<T>[]
  /** Deep-search results, or `null` when not deep-searching. */
  deepResults: CascaderNode<T>[] | null
  /** What `Combobox.Root` is currently rendering, in render order. */
  renderedItems: CascaderNode<T>[]
  /**
   * Columns mode: one entry per open level, root first. The LAST entry is the
   * active column and is the one Base UI owns; the earlier ones are the trail.
   */
  columns: CascaderColumn<T>[]
  /** Tree mode: the flattened visible-row list. */
  treeRows: CascaderFlatNode<T>[]
  selectedValues: string[]
  /**
   * How many selected nodes each value has BELOW it, at any depth. Absent means
   * zero, so a level with nothing selected carries an empty map rather than one
   * entry per row.
   *
   * ONE pass over the selection produces this, and the partial-selection set is
   * read off the same map - see `getCascaderSelectedDescendants`. A row asks for
   * its own number through `selectedDescendantCount` on the actions context,
   * which is an O(1) lookup into this map: a row must never subscribe here, and
   * it must never walk its own subtree.
   */
  selectedDescendants: ReadonlyMap<string, number>
  /**
   * Async load state per LEVEL - a parent's value, or `CASCADER_ROOT_KEY` for
   * the root. Empty unless a `getChildren` loader is configured.
   *
   * MEMBERSHIP is the discriminator, not any field on the value: a level with
   * no entry has never been fetched, and a level with an entry, no `loading`,
   * no `error` and no children has been fetched and is genuinely empty. Read it
   * through `useCascaderLoadState()` rather than by hand.
   */
  loadStates: ReadonlyMap<string, CascaderLoadState>
  /**
   * Load state of the async SEARCH, or `null` when no `onSearch` request is
   * running. Separate from `loadStates` because a search belongs to no level.
   */
  searchState: CascaderLoadState | null
  /** Live-region text. Empty until something worth announcing happens. */
  announcement: string
}

const CascaderStateContext = React.createContext<
  CascaderStateContextValue | undefined
>(undefined)

/**
 * The volatile half of the cascader's internals, typed for the caller's own
 * item payload.
 *
 * One provider has to serve every `T`, so the context is stored with its item
 * generic erased to `unknown` and re-applied here. There is no way to express
 * that in the type system without an assertion: React contexts are invariant in
 * their value. The item payload is never inspected by the primitive, so the
 * erasure is safe.
 */
export function useCascaderState<T = unknown>(): CascaderStateContextValue<T> {
  const context = React.useContext(CascaderStateContext)
  if (!context) {
    throw new Error("useCascaderState must be used within a Cascader")
  }
  return context as unknown as CascaderStateContextValue<T>
}

/* -------------------------------------------------------------------------- */
/*                                   Actions                                  */
/* -------------------------------------------------------------------------- */

/**
 * Configuration plus every callback, published on a schedule slow enough that a
 * memoised row can subscribe to it.
 *
 * Nothing here changes on a keystroke, a level change or a highlight move. The
 * mutators are all `[]`-dep callbacks reading a latest-props ref, so they are
 * referentially stable for the life of the cascader.
 *
 * The three predicates are the deliberate exception: they are read DURING
 * RENDER, and a `[]`-dep callback reading a ref written in an effect would hand
 * a row values from the previous commit with nothing scheduled to correct them.
 * They are memoised on the narrowest input each one actually needs - `index`,
 * `selectable`, the selection - none of which is keystroke-volatile.
 */
export interface CascaderActionsContextValue<T = unknown> {
  /** Normalized view of the item tree. Same identity as on the state context. */
  index: CascaderIndex<T>
  mode: CascaderMode
  multiple: boolean
  /**
   * Whether a commit propagates over the pressed node's LOADED subtree, and
   * reconciles its ancestors afterwards. Multi-select only.
   */
  cascade: boolean
  /**
   * Whether a BRANCH can be committed at all under the current `selectable`
   * setting: `"any"`, or a predicate, which may say yes to any node it is
   * shown.
   *
   * A per-LIST answer where `isSelectable` is a per-ROW one, and that is the
   * whole point of it. The inline-end gutter each style reserves for the check
   * is a COLUMN, so it has to be reserved on every branch row in a level or on
   * none of them. Deriving it per row made a predicate that accepted one
   * branch and refused the next put their chevrons and counts on two different
   * insets, which is exactly what a user reads as "these rows jump".
   */
  branchesSelectable: boolean
  /**
   * The root's `indicator` prop: whether the built-in SINGLE-SELECT check is
   * drawn, and with it the inline-end gutter every style reserves for one.
   *
   * A per-LIST answer for the same reason `branchesSelectable` is one - the
   * gutter is a COLUMN, and a column that some rows reserve and others do not
   * is a column that visibly jumps. `false` drops the check element and gives
   * the gutter back, so a row's trailing content ends where the label starts on
   * the other edge.
   *
   * Read alongside `multiple`, never on its own: in multi-select the checkbox
   * is the selection CONTROL rather than a mark, so the row ignores this and
   * keeps both the box and the gutter. `data-selected` is published on the row
   * in every mode, which is what a consumer marking selection itself paints
   * from, and `aria-selected` is unaffected either way.
   */
  indicator: boolean
  /**
   * How a branch row in columns mode's ACTIVE column opens from the pointer:
   * `"click"` (the default) on a press only, `"hover"` after the pointer has
   * rested on the row for a beat. Consumed by `CascaderItem` in columns mode
   * only - drill and tree ignore it - and it never commits a selection.
   *
   * Optional, and read with a `"click"` default at the consumer: the root
   * threads its own `expandTrigger` prop into this field, and a context value
   * built without it behaves exactly as before.
   */
  expandTrigger?: "click" | "hover"
  /** Footer actions supplied through the root's `actions` prop. */
  actions: CascaderActionItem[]
  searchScope: CascaderSearchScope
  maxHeight?: number | string
  /** Whether the cascader renders without a floating popup. */
  inline: boolean
  /**
   * Whether the field is in an invalid state. Published rather than passed so
   * the trigger, the chips container and the search input all agree without the
   * consumer having to set `aria-invalid` on each of them.
   */
  invalid: boolean
  /**
   * Prefix for every id the primitive mints. Columns are
   * `${baseId}-column-${depth}`, so a row can point `aria-controls` at the panel
   * it opens without either side reaching into the DOM.
   *
   * The id SCHEME is load-bearing outside this package too: the filters
   * primitive's `FilterMenuPinKeeper` locates the flat list through
   * `${baseId}-column-0` and the `cascader-item` slot to restore the highlight
   * across a live re-pin. Renaming either degrades that menu's keyboard
   * behaviour silently, so treat the scheme as part of the contract.
   */
  baseId: string
  labels: CascaderLabels

  /**
   * Whether the rendered rows are currently WINDOWED.
   *
   * Also handed to `Combobox.Root`, which is what makes an explicit row `index`
   * legal: Base UI stops rendering its composite list and lets each row
   * register itself instead. `CascaderItem` reads this to decide whether to
   * forward its `index` prop at all - passing one while this is false makes
   * `aria-activedescendant` resolve to nothing.
   *
   * Latched per level, so a query narrowing 5,000 rows to 12 mid-keystroke does
   * not tear the virtualizer down and rebuild it on the next character.
   */
  virtualized: boolean
  /**
   * Mounts a windowing renderer and returns its unregister. Call it from a
   * LAYOUT effect: `virtualized` is derived from it, and the flip has to land
   * before the browser paints.
   */
  registerVirtualRenderer: () => () => void
  /** The root's `virtualize` prop, unresolved. `undefined` means "decide by count". */
  virtualize?: boolean
  /** Row count at which windowing turns itself on. */
  virtualizeThreshold: number
  /** Row height handed to the virtualizer before a row has been measured. */
  estimateRowSize: number
  /** Rows rendered beyond each edge of the viewport. */
  overscan: number

  /**
   * Whether a `getChildren` loader is configured.
   *
   * Parts use it to decide whether "this level has no rows" means "empty" or
   * "not fetched yet" before they have a load state to look at.
   */
  hasLoader: boolean
  /**
   * Fetches the next page of a level. Keyed by parent value, or
   * `CASCADER_ROOT_KEY` for the root. No-ops unless a page is available, and
   * latched so a page that returns nothing new cannot be asked for twice.
   */
  loadMore: (parentKey: string) => void
  /** Refires a failed level. No-ops unless that level is in an error state. */
  retryLevel: (parentKey: string) => void
  /**
   * Evicts one level's async cache: aborts its in-flight request, deletes its
   * `states` and `pages` entries and clears its paging latch, so map
   * membership reads never-loaded and the next visit refetches. A level that
   * is on screen when it is evicted refetches immediately. `null` targets the
   * root level. The enterprise reach-in for "this branch's data just changed
   * on the server" - a mutation elsewhere in the app, a websocket push.
   */
  invalidateLevel: (value: string | null) => void

  /**
   * The index as of the last COMMIT. Equal to `index` by the time any event
   * handler can run, so prefer this inside the stable callbacks, where closing
   * over `index` would mean giving up their stable identity.
   */
  getIndex: () => CascaderIndex<T>
  /** The state context value as of the last commit. For event handlers only. */
  getState: () => CascaderStateContextValue<T>
  /**
   * The currently highlighted row, or null. Read through a getter rather than
   * state: the highlight changes on every arrow key, and re-rendering the whole
   * level for it would undo the memoization the row component relies on.
   */
  getHighlighted: () => CascaderNode<T> | null

  setPath: (next: string[] | ((prev: string[]) => string[])) => void
  pushLevel: (value: string) => void
  popLevel: () => void
  /** Navigates to an exact depth. Used by the breadcrumb and column trail. */
  goToDepth: (depth: number) => void
  toggleExpanded: (value: string) => void
  /**
   * Registers a side-anchored flyout (a footer submenu) as open or closed.
   *
   * `Combobox` has no `FloatingTree`, so a popup nested inside its popup does
   * not get Escape routed to it first: one Escape would dismiss the flyout AND
   * the cascader. The root reads this from its `onOpenChange` guard and
   * cancels the close while any flyout is open, which is what makes Escape
   * close them one at a time.
   *
   * Backed by a ref rather than state, on purpose. The guard runs inside an
   * event handler and needs the answer as of THAT event, and re-rendering the
   * whole root because a footer menu opened would throw away the row
   * memoization the primitive is built on.
   */
  setFlyoutOpen: (key: string, open: boolean) => void
  /** Whether any flyout owned by this cascader is currently open. */
  hasOpenFlyout: () => boolean
  setQuery: (next: string) => void
  /**
   * Replaces the whole selection. Backs the headless `useCascaderSelection`.
   *
   * The node and reason reported to `onValueChange` are derived by diffing the
   * next selection against the current one. Pass `reason` when the caller knows
   * better than the diff can - `clear()` empties the selection deliberately,
   * which is not the same event as deselecting the last remaining node.
   */
  setSelection: (values: string[], reason?: CascaderChangeReason) => void
  /**
   * Commits a node. Exposed so rows outside Base UI's listbox (the ancestor
   * columns in columns mode) can select without being `Combobox.Item`s.
   */
  commit: (node: CascaderNode<T>) => void
  /** Called by a row when a branch is pressed. */
  navigate: (node: CascaderNode<T>) => void
  /**
   * Navigates into `node` treating it as a child of `depth`, replacing anything
   * deeper. Columns mode needs this: pressing a province in the first column
   * must rebuild the trail from there, not append a fourth column to it.
   */
  navigateAt: (node: CascaderNode<T>, depth: number) => void
  /**
   * Resolves a value to a node, falling back to a remembered label and finally
   * to a synthetic node. Never returns undefined, so a selection whose node is
   * not in `items` (async data not loaded yet, or an item removed after the
   * fact) still renders something instead of a blank trigger.
   */
  resolveNode: (value: string) => CascaderNode<T>
  isBranch: (node: CascaderNode<T>) => boolean
  isSelectable: (node: CascaderNode<T>) => boolean
  isSelected: (node: CascaderNode<T>) => boolean
  /**
   * Whether a node has some but not all of its loaded subtree selected.
   *
   * Always `false` without `cascade`: partial selection is only a coherent idea
   * once a commit propagates, and answering it otherwise would mark a plain
   * multi-select's ancestors as mixed for no reason.
   */
  isIndeterminate: (node: CascaderNode<T>) => boolean
  /**
   * How many selected nodes a branch holds below it, at any depth.
   *
   * An O(1) read of the `selectedDescendants` map on the state context, exposed
   * here because a memoised row may not subscribe to that context. Unlike
   * `isIndeterminate` this answers in every mode: the number is as true of a
   * plain multi-select as it is of a cascading one.
   */
  selectedDescendantCount: (node: CascaderNode<T>) => number
}

const CascaderActionsContext = React.createContext<
  CascaderActionsContextValue | undefined
>(undefined)

/**
 * The stable half of the cascader's internals, typed for the caller's own item
 * payload. See `useCascaderState` for why the generic is erased and restored.
 */
export function useCascaderActions<
  T = unknown,
>(): CascaderActionsContextValue<T> {
  const context = React.useContext(CascaderActionsContext)
  if (!context) {
    throw new Error("useCascaderActions must be used within a Cascader")
  }
  return context as unknown as CascaderActionsContextValue<T>
}

/* -------------------------------------------------------------------------- */
/*                                Render props                                */
/* -------------------------------------------------------------------------- */

/**
 * Render props live in their OWN context, republished every render.
 *
 * They cannot ride on the actions context: a consumer almost always passes an
 * inline closure, and reading it through a getter on a memoised object returns
 * whichever closure was captured when that object was built - so the row keeps
 * calling a stale render prop that closes over stale state. Splitting them out
 * costs one extra provider and makes them always current.
 */
export interface CascaderRenderContextValue<T = unknown> {
  renderItem?: (
    node: CascaderNode<T>,
    state: CascaderItemState<T>
  ) => React.ReactNode
  renderLabel?: (
    node: CascaderNode<T>,
    state: CascaderItemState<T>
  ) => React.ReactNode
}

const CascaderRenderContext = React.createContext<CascaderRenderContextValue>(
  {}
)

export function useCascaderRender<
  T = unknown,
>(): CascaderRenderContextValue<T> {
  return React.useContext(
    CascaderRenderContext
  ) as CascaderRenderContextValue<T>
}

/* -------------------------------------------------------------------------- */
/*                               Highlight store                              */
/* -------------------------------------------------------------------------- */

/** The row Base UI currently considers highlighted. */
export interface CascaderHighlight {
  /** Render index of the highlighted row, or `-1` when nothing is. */
  index: number
  /** Value of the highlighted node, or `null` when nothing is. */
  value: string | null
}

/**
 * An external store, deliberately NOT React state.
 *
 * `onItemHighlighted` fires on every arrow key AND on every pointer move across
 * the list. Routing that through `setState` would re-render the entire root -
 * and with it every list, every row and the live region - at mousemove rate.
 * A store lets the one component that needs the highlight (the virtualizer)
 * subscribe to it and leaves everything else untouched.
 */
export interface CascaderHighlightStore {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => CascaderHighlight
  /** No-ops when nothing changed, so a pointer resting on a row costs nothing. */
  set: (next: CascaderHighlight) => void
}

const NO_HIGHLIGHT: CascaderHighlight = { index: -1, value: null }

export function createCascaderHighlightStore(): CascaderHighlightStore {
  let snapshot: CascaderHighlight = NO_HIGHLIGHT
  const listeners = new Set<() => void>()

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    // Returns the SAME object until something actually changes, which is what
    // `useSyncExternalStore` requires to avoid an infinite render loop.
    getSnapshot() {
      return snapshot
    },
    set(next) {
      if (next.index === snapshot.index && next.value === snapshot.value) return
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * A shared, permanently empty store, so the hook degrades to "nothing is
 * highlighted" outside a `Cascader` instead of throwing. Nothing ever writes to
 * it: each root creates and writes its own.
 */
const FALLBACK_HIGHLIGHT_STORE = createCascaderHighlightStore()

const CascaderHighlightContext = React.createContext<CascaderHighlightStore>(
  FALLBACK_HIGHLIGHT_STORE
)

/** Subscribes to the highlight. Re-renders ONLY the calling component. */
export function useCascaderHighlight(): CascaderHighlight {
  const store = React.useContext(CascaderHighlightContext)
  return React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  )
}

export {
  CascaderActionsContext,
  CascaderHighlightContext,
  CascaderRenderContext,
  CascaderStateContext,
}