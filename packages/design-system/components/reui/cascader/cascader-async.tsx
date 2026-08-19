// @ts-nocheck
"use client"

import * as React from "react"
import { useCascaderState } from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import {
  CASCADER_ROOT_KEY,
  isCascaderMoreNode,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type {
  CascaderIndex,
  CascaderLoadContext,
  CascaderLoadReason,
  CascaderLoadResult,
  CascaderLoadState,
  CascaderNode,
  CascaderSearchContext,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"

/**
 * Async data for the cascader.
 *
 * The whole design turns on ONE decision: loaded pages are kept in a store of
 * their own and merged onto the index built from `items`, rather than being
 * folded into that build. `items` can change identity at any time - a parent
 * re-render with an inline array is enough - and folding pages into the build
 * would mean every such change silently discarded everything the user had
 * drilled into. Merging instead means an `items` change re-runs the build and
 * then re-merges the SAME maps.
 *
 * Two further decisions follow from that:
 *
 * - **Map membership is the discriminator**, not a status field. A level with
 *   no entry in `states` has never been fetched; a level with an entry, no
 *   `loading`, no `error` and no children is empty for real. That is what lets
 *   `resolveValue` inject an ancestor chain into `pages` WITHOUT touching
 *   `states`, so the level still reads as unloaded and a real drill-in still
 *   goes to the server.
 * - **Loads fire from one declarative effect** keyed on the visible levels, not
 *   from `pushLevel` or `navigate`. A consumer driving a controlled `path`
 *   never calls either, so an imperative trigger would silently never fire for
 *   exactly the consumers most likely to need async data.
 */

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/** Fetches one level. `node` is `null` for the root level. */
export type CascaderGetChildren<T = unknown> = (
  node: CascaderNode<T> | null,
  context: CascaderLoadContext
) =>
  | CascaderNode<T>[]
  | CascaderLoadResult<T>
  | Promise<CascaderNode<T>[] | CascaderLoadResult<T>>

/** Server-side search, replacing the local index scan while the query is set. */
export type CascaderOnSearch<T = unknown> = (
  query: string,
  context: CascaderSearchContext
) =>
  | CascaderNode<T>[]
  | CascaderLoadResult<T>
  | Promise<CascaderNode<T>[] | CascaderLoadResult<T>>

/** Resolves a selected value to its ancestor chain, root first, node last. */
export type CascaderResolveValue<T = unknown> = (
  value: string,
  context: CascaderLoadContext
) => CascaderNode<T>[] | Promise<CascaderNode<T>[]>

/**
 * Everything the loader knows, in three maps.
 *
 * `pages` and `states` are keyed by LEVEL - a parent's value, or
 * `CASCADER_ROOT_KEY` for the root. `detached` is keyed by node value and holds
 * nodes that must be resolvable by value but belong to no level: async search
 * hits, and selections resolved out of band.
 */
export interface CascaderLoaderStore<T = unknown> {
  pages: Map<string, CascaderNode<T>[]>
  states: Map<string, CascaderLoadState>
  detached: Map<string, CascaderNode<T>>
}

export interface UseCascaderLoaderOptions<T = unknown> {
  /** The index built from `items`, before any pages are merged in. */
  base: CascaderIndex<T>
  getChildren?: CascaderGetChildren<T>
  onSearch?: CascaderOnSearch<T>
  resolveValue?: CascaderResolveValue<T>
  /** Milliseconds of quiet before `onSearch` fires. */
  searchDebounce?: number
  /** Changing this drops every cached page, state and detached node. */
  loadKey?: unknown
  /** Speculatively fetch a branch's children when it is highlighted. */
  prefetch?: boolean
  /**
   * Called when a request fails, alongside the error state the store keeps.
   * Never for a request that was aborted or superseded: those are navigation,
   * not failures, and reporting them would page someone about nothing.
   */
  onLoadError?: (
    error: unknown,
    context: { parent: string | null; reason: string }
  ) => void
  /** Whether the panel is live: the popup is open, or the cascader is inline. */
  enabled: boolean
  query: string
  /** Level keys that are currently on screen. Root is `CASCADER_ROOT_KEY`. */
  levels: string[]
  /** The navigation path, handed to `onSearch` as its scope. */
  path: string[]
  /** Current selection, for `resolveValue`. */
  values: string[]
}

export interface CascaderLoader<T = unknown> {
  /** Whether a `getChildren` loader is configured at all. */
  active: boolean
  store: CascaderLoaderStore<T>
  states: ReadonlyMap<string, CascaderLoadState>
  /**
   * Async search hits, or `null` when no `onSearch` is running. An EMPTY array
   * while the first request is in flight, so the level list behind it is not
   * briefly shown as if it were the answer.
   */
  searchResults: CascaderNode<T>[] | null
  searchState: CascaderLoadState | null
  /**
   * Fetches a level's FIRST page, unless it has been fetched already.
   *
   * The imperative half of the declarative level effect, and the whole reason
   * "load before you navigate" is possible: the effect only fires for levels
   * that are already on screen, so a branch the user has merely PRESSED has to
   * be asked for by hand. No-ops when there is no loader, when the level
   * already has a state entry (in flight, loaded, or failed) or when `items`
   * already supplies its children - the same three guards the effect uses, so
   * the two can never disagree about whether a request will happen.
   */
  ensureLevel: (parentKey: string, reason: CascaderLoadReason) => void
  /** Fetches the next page of a level. No-ops unless one is available. */
  loadMore: (parentKey: string) => void
  /** Refires a failed level. No-ops unless that level is in an error state. */
  retryLevel: (parentKey: string) => void
  /** Schedules a speculative fetch. Safe to call on every highlight move. */
  prefetchNode: (node: CascaderNode<T> | null | undefined) => void
  /**
   * Evicts ONE level: aborts its in-flight request, deletes its `states` and
   * `pages` entries and clears its paging latch. Map membership is the
   * discriminator, so deletion IS the reset - the level reads as never
   * loaded, and the next time it is on screen the level effect refetches it.
   * `null` targets the root level.
   */
  invalidateLevel: (value: string | null) => void
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

/**
 * How long a branch must stay highlighted before `prefetch` fetches it.
 *
 * Long enough that holding ArrowDown through a level does not fire a request
 * per row, short enough that a deliberate pause has already started the fetch
 * by the time the user presses ArrowRight.
 */
const PREFETCH_DELAY = 150

/** Request keys for the two non-level requests. Never collide with a value. */
const SEARCH_KEY = "\u0000search"
const RESOLVE_PREFIX = "\u0000resolve:"

const NO_STATE: CascaderLoadState = {
  loading: false,
  error: false,
  hasMore: false,
}

/** Stable empty result, so an idle search never churns the state context. */
const NO_RESULTS: CascaderNode<never>[] = []

function createStore<T>(): CascaderLoaderStore<T> {
  return { pages: new Map(), states: new Map(), detached: new Map() }
}

function sameLoadState(a: CascaderLoadState, b: CascaderLoadState): boolean {
  return (
    a.loading === b.loading &&
    a.error === b.error &&
    a.hasMore === b.hasMore &&
    a.cursor === b.cursor
  )
}

/* -------------------------------------------------------------------------- */
/*                              Store transitions                             */
/* -------------------------------------------------------------------------- */

/**
 * Copy-on-write, and a NO-OP when nothing changed.
 *
 * The store's identity is what the merged index is memoised on, so returning a
 * fresh object for an unchanged state would rebuild the whole index for
 * nothing.
 */
function withLoadState<T>(
  store: CascaderLoaderStore<T>,
  key: string,
  update: (state: CascaderLoadState) => CascaderLoadState
): CascaderLoaderStore<T> {
  const current = store.states.get(key) ?? NO_STATE
  const next = update(current)
  if (store.states.has(key) && sameLoadState(current, next)) return store
  const states = new Map(store.states)
  states.set(key, next)
  return { pages: store.pages, states, detached: store.detached }
}

function withPage<T>(
  store: CascaderLoaderStore<T>,
  key: string,
  items: readonly CascaderNode<T>[],
  options: { append: boolean; hasMore: boolean; cursor?: string }
): CascaderLoaderStore<T> {
  // A fresh level REPLACES its page and a further page APPENDS to it. Replacing
  // is what lets a `resolveValue` stub be superseded by the authoritative list
  // instead of being pinned to the top of the level forever.
  const previous = options.append ? (store.pages.get(key) ?? []) : []
  const seen = new Set(previous.map((node) => node.value))
  const merged = previous.slice()
  for (const item of items) {
    if (seen.has(item.value)) continue
    seen.add(item.value)
    merged.push(item)
  }

  const pages = new Map(store.pages)
  pages.set(key, merged)
  const states = new Map(store.states)
  states.set(key, {
    loading: false,
    error: false,
    hasMore: options.hasMore,
    cursor: options.cursor,
  })
  return { pages, states, detached: store.detached }
}

function withDetached<T>(
  store: CascaderLoaderStore<T>,
  items: readonly CascaderNode<T>[]
): CascaderLoaderStore<T> {
  let detached: Map<string, CascaderNode<T>> | null = null
  for (const item of items) {
    if (store.detached.get(item.value) === item) continue
    detached = detached ?? new Map(store.detached)
    detached.set(item.value, item)
  }
  if (!detached) return store
  return { pages: store.pages, states: store.states, detached }
}

/**
 * Places a resolved ancestor chain, root first, into `pages`.
 *
 * Deliberately does NOT write `states`: the levels it touches must still read
 * as never loaded, so opening one still fetches it for real. The chain is
 * mirrored into `detached` too, so that when the authoritative page for a level
 * REPLACES the stub, the trigger keeps its label.
 */
function withChain<T>(
  store: CascaderLoaderStore<T>,
  chain: readonly CascaderNode<T>[]
): CascaderLoaderStore<T> {
  if (chain.length === 0) return store
  const pages = new Map(store.pages)
  const detached = new Map(store.detached)
  let parentKey = CASCADER_ROOT_KEY

  for (const node of chain) {
    const bucket = pages.get(parentKey)
    if (!bucket) {
      pages.set(parentKey, [node])
    } else if (!bucket.some((entry) => entry.value === node.value)) {
      pages.set(parentKey, [...bucket, node])
    }
    detached.set(node.value, node)
    parentKey = node.value
  }

  return { pages, states: store.states, detached }
}

/* -------------------------------------------------------------------------- */
/*                                    Hook                                    */
/* -------------------------------------------------------------------------- */

interface CascaderLoaderLatest<T> {
  base: CascaderIndex<T>
  store: CascaderLoaderStore<T>
  getChildren?: CascaderGetChildren<T>
  onSearch?: CascaderOnSearch<T>
  resolveValue?: CascaderResolveValue<T>
  onLoadError?: (
    error: unknown,
    context: { parent: string | null; reason: string }
  ) => void
  prefetch: boolean
  path: string[]
}

interface CascaderSearchSlice<T> {
  query: string
  results: CascaderNode<T>[]
  loading: boolean
  error: boolean
}

/**
 * The loader. Called from the root as a SIBLING of the `buildCascaderIndex`
 * memo - never inside it - so the build stays a pure function of `items` and
 * the merge stays a pure function of the build plus this store.
 */
export function useCascaderLoader<T = unknown>({
  base,
  getChildren,
  onSearch,
  resolveValue,
  searchDebounce = 250,
  loadKey,
  prefetch = false,
  onLoadError,
  enabled,
  query,
  levels,
  path,
  values,
}: UseCascaderLoaderOptions<T>): CascaderLoader<T> {
  const [store, setStore] = React.useState<CascaderLoaderStore<T>>(createStore)
  const [search, setSearch] = React.useState<CascaderSearchSlice<T> | null>(
    null
  )

  /**
   * The latest callbacks and derived state, WRITTEN IN AN EFFECT.
   *
   * `getChildren` will be an inline closure in essentially every consumer, so
   * closing over it would cancel and refire every in-flight request on every
   * parent re-render. Reading it through a ref is what keeps the request
   * machinery `[]`-dep and stable.
   *
   * Declared FIRST on purpose: effects run in declaration order, so by the time
   * the level effect below runs, this ref already holds the current commit.
   */
  const latest = React.useRef<CascaderLoaderLatest<T>>({
    base,
    store,
    getChildren,
    onSearch,
    resolveValue,
    onLoadError,
    prefetch,
    path,
  })

  React.useEffect(() => {
    latest.current = {
      base,
      store,
      getChildren,
      onSearch,
      resolveValue,
      onLoadError,
      prefetch,
      path,
    }
  })

  /**
   * One AbortController PER KEY, not one for the whole cascader. Columns mode
   * opens three or four levels at once and every one of them is a separate
   * request with a separate lifetime.
   */
  const controllers = React.useRef(new Map<string, AbortController>())
  /** Monotonic per key. The stale guard for out-of-order responses. */
  const requestIds = React.useRef(new Map<string, number>())
  /** In-flight `(level, cursor)` signatures, so a duplicate ask is free. */
  const inflight = React.useRef(new Map<string, string>())
  /**
   * The `(child count, cursor)` signature at the last paging fire, per level.
   *
   * The one thing a `hasMore` flag cannot protect against: a page that resolves
   * with zero new items while the server keeps reporting `hasMore: true`.
   * Neither half has moved, so the row is latched and cannot fire again. The
   * cursor is IN the signature because a page of all-duplicates leaves the
   * count unchanged while the cursor still advances - real progress, and a
   * count-only latch would brick paging on it forever.
   */
  const moreLatch = React.useRef(new Map<string, string>())
  /** Values `resolveValue` has already been asked about, so it asks once. */
  const attempted = React.useRef(new Set<string>())
  /** Every node the loader has seen, so a level key can name its own node. */
  const known = React.useRef(new Map<string, CascaderNode<T>>())
  const timers = React.useRef<{
    prefetch: ReturnType<typeof setTimeout> | null
  }>({ prefetch: null })
  /** Bumped by a `loadKey` change, so responses from before it are dropped. */
  const epoch = React.useRef(0)

  const remember = React.useCallback((nodes: readonly CascaderNode<T>[]) => {
    const map = known.current
    const walk = (list: readonly CascaderNode<T>[]) => {
      for (const node of list) {
        map.set(node.value, node)
        if (node.children?.length) walk(node.children)
      }
    }
    walk(nodes)
  }, [])

  const abortKey = React.useCallback((key: string) => {
    const controller = controllers.current.get(key)
    if (!controller) return
    controllers.current.delete(key)
    inflight.current.delete(key)
    controller.abort()
  }, [])

  /* ------------------------------- level load ------------------------------ */

  const runLoad = React.useCallback(
    (
      key: string,
      reason: CascaderLoadReason,
      cursor: string | undefined,
      append: boolean
    ) => {
      const { getChildren: loader, base: currentBase } = latest.current
      if (!loader) return

      const signature = `${append ? "1" : "0"}:${cursor ?? ""}`
      if (inflight.current.get(key) === signature) return

      abortKey(key)
      const controller = new AbortController()
      controllers.current.set(key, controller)
      inflight.current.set(key, signature)

      const requestId = (requestIds.current.get(key) ?? 0) + 1
      requestIds.current.set(key, requestId)
      const startEpoch = epoch.current

      const node =
        key === CASCADER_ROOT_KEY
          ? null
          : (currentBase.byValue.get(key) ?? known.current.get(key) ?? null)

      setStore((prev) =>
        withLoadState(prev, key, (state) => ({
          ...state,
          loading: true,
          error: false,
        }))
      )

      const settle = () => {
        if (inflight.current.get(key) === signature)
          inflight.current.delete(key)
        if (controllers.current.get(key) === controller) {
          controllers.current.delete(key)
        }
      }

      const stale = () =>
        controller.signal.aborted ||
        startEpoch !== epoch.current ||
        requestId !== requestIds.current.get(key)

      // `Promise.resolve().then(...)` rather than calling the loader directly:
      // it normalises a SYNCHRONOUS throw into a rejection, so a loader that
      // validates its arguments and throws lands in the error state instead of
      // taking the render down with it.
      Promise.resolve()
        .then(() => loader(node, { signal: controller.signal, cursor, reason }))
        .then((result) => {
          settle()
          if (stale()) return
          const items = Array.isArray(result) ? result : result.items
          const nextCursor = Array.isArray(result)
            ? undefined
            : result.nextCursor
          const hasMore = Array.isArray(result)
            ? false
            : (result.hasMore ?? nextCursor != null)

          if (!append) moreLatch.current.delete(key)
          remember(items)
          setStore((prev) =>
            withPage(prev, key, items, { append, hasMore, cursor: nextCursor })
          )
        })
        .catch((error: unknown) => {
          settle()
          if (stale()) return
          // The error is KEPT rather than swallowed: `retry` is only meaningful
          // if the level can say it failed.
          setStore((prev) =>
            withLoadState(prev, key, (state) => ({
              ...state,
              loading: false,
              error: true,
            }))
          )
          // Behind the stale guard on purpose: an abort or a superseded
          // response is navigation, not a failure worth reporting.
          latest.current.onLoadError?.(error, {
            parent: key === CASCADER_ROOT_KEY ? null : key,
            reason,
          })
        })
    },
    [abortKey, remember]
  )

  /** No-op when the level has already been loaded. Map membership decides. */
  const ensureLevel = React.useCallback(
    (key: string, reason: CascaderLoadReason) => {
      const {
        getChildren: loader,
        store: current,
        base: index,
      } = latest.current
      if (!loader) return
      if (current.states.has(key)) return
      // A level that `items` already fills is not the loader's business. This
      // is what makes the common hybrid shape work with no extra flag: a static
      // root plus `getChildren` for the branches below it fetches the branches
      // and never asks for a root the consumer already supplied.
      if (index.childrenOf.has(key)) return
      runLoad(key, reason, undefined, false)
    },
    [runLoad]
  )

  const loadMore = React.useCallback(
    (key: string) => {
      const { getChildren: loader, store: current } = latest.current
      if (!loader) return
      const state = current.states.get(key)
      if (!state || state.loading || !state.hasMore) return

      const loaded = current.pages.get(key)?.length ?? 0
      const signature = `${loaded}:${state.cursor ?? ""}`
      if (moreLatch.current.get(key) === signature) return
      moreLatch.current.set(key, signature)

      runLoad(key, "more", state.cursor, true)
    },
    [runLoad]
  )

  const retryLevel = React.useCallback(
    (key: string) => {
      const { getChildren: loader, store: current } = latest.current
      if (!loader) return
      const state = current.states.get(key)
      if (!state?.error) return

      const loaded = current.pages.get(key)?.length ?? 0
      // A retry must be able to re-fire the page the latch just blocked.
      moreLatch.current.delete(key)
      runLoad(key, "retry", loaded > 0 ? state.cursor : undefined, loaded > 0)
    },
    [runLoad]
  )

  /**
   * The eviction primitive. Everything it does is a DELETION, because map
   * membership is the load-state discriminator: with the `states` entry gone
   * the level reads as never loaded, `ensureLevel`'s guards pass again, and
   * the next time the level is on screen the declarative effect refetches it
   * - a level that is on screen right now refetches on this very commit.
   *
   * `detached` is deliberately untouched: resolved chains and search hits
   * belong to no level, and the trigger still needs their labels while the
   * fresh page is in flight.
   */
  const invalidateLevel = React.useCallback(
    (value: string | null) => {
      const key = value ?? CASCADER_ROOT_KEY
      abortKey(key)
      // Advance the request id too: the abort settles the controller, but a
      // response already past its signal check must still find itself stale.
      requestIds.current.set(key, (requestIds.current.get(key) ?? 0) + 1)
      moreLatch.current.delete(key)
      setStore((prev) => {
        if (!prev.states.has(key) && !prev.pages.has(key)) return prev
        const states = new Map(prev.states)
        states.delete(key)
        const pages = new Map(prev.pages)
        pages.delete(key)
        return { pages, states, detached: prev.detached }
      })
    },
    [abortKey]
  )

  const prefetchNode = React.useCallback(
    (node: CascaderNode<T> | null | undefined) => {
      const {
        prefetch: on,
        getChildren: loader,
        store: current,
      } = latest.current
      if (!on || !loader || !node) return
      if (isCascaderMoreNode(node)) return
      // Only a level that is DECLARED and unfetched is worth speculating on.
      if (!node.hasChildren) return
      if (current.states.has(node.value)) return

      const holder = timers.current
      if (holder.prefetch) clearTimeout(holder.prefetch)
      // A TIMEOUT, not a direct call. `onItemHighlighted` fires from Base UI's
      // layout effect, and a synchronous setState there is a render-phase
      // cascade that re-enters the root before the browser has painted.
      holder.prefetch = setTimeout(() => {
        holder.prefetch = null
        ensureLevel(node.value, "prefetch")
      }, PREFETCH_DELAY)
    },
    [ensureLevel]
  )

  /* --------------------------------- search -------------------------------- */

  const runSearch = React.useCallback(
    (text: string) => {
      const { onSearch: searcher, path: currentPath } = latest.current
      if (!searcher) return

      abortKey(SEARCH_KEY)
      const controller = new AbortController()
      controllers.current.set(SEARCH_KEY, controller)
      const requestId = (requestIds.current.get(SEARCH_KEY) ?? 0) + 1
      requestIds.current.set(SEARCH_KEY, requestId)
      const startEpoch = epoch.current

      setSearch((prev) => ({
        query: text,
        results: prev?.results ?? [],
        loading: true,
        error: false,
      }))

      const settle = () => {
        if (controllers.current.get(SEARCH_KEY) === controller) {
          controllers.current.delete(SEARCH_KEY)
        }
      }
      const stale = () =>
        controller.signal.aborted ||
        startEpoch !== epoch.current ||
        requestId !== requestIds.current.get(SEARCH_KEY)

      Promise.resolve()
        .then(() =>
          searcher(text, { signal: controller.signal, path: currentPath })
        )
        .then((result) => {
          settle()
          if (stale()) return
          const items = Array.isArray(result) ? result : result.items
          remember(items)
          // Search hits go to `detached`, never into a level: a hit can live
          // anywhere in the tree, and inserting it under whichever level
          // happens to be open would list it somewhere the server never did.
          setStore((prev) => withDetached(prev, items))
          setSearch({
            query: text,
            results: items,
            loading: false,
            error: false,
          })
        })
        .catch((error: unknown) => {
          settle()
          if (stale()) return
          setSearch((prev) => ({
            query: text,
            results: prev?.results ?? [],
            loading: false,
            error: true,
          }))
          // A search belongs to no level, so the parent is `null`.
          latest.current.onLoadError?.(error, {
            parent: null,
            reason: "search",
          })
        })
    },
    [abortKey, remember]
  )

  /* --------------------------------- resolve ------------------------------- */

  const runResolve = React.useCallback(
    (value: string) => {
      const { resolveValue: resolver } = latest.current
      if (!resolver) return

      const key = `${RESOLVE_PREFIX}${value}`
      abortKey(key)
      const controller = new AbortController()
      controllers.current.set(key, controller)
      const startEpoch = epoch.current

      const settle = () => {
        if (controllers.current.get(key) === controller) {
          controllers.current.delete(key)
        }
      }

      Promise.resolve()
        .then(() =>
          resolver(value, { signal: controller.signal, reason: "resolve" })
        )
        .then((chain) => {
          settle()
          if (controller.signal.aborted || startEpoch !== epoch.current) return
          if (!chain?.length) return
          remember(chain)
          setStore((prev) => withChain(prev, chain))
        })
        .catch((error: unknown) => {
          settle()
          // Un-attempt on failure, so the next values-effect pass asks again.
          // Without this a resolver that failed once - a flaky network, an
          // abort - could never be retried: `attempted` is written BEFORE the
          // call, and nothing else ever removes the value.
          attempted.current.delete(value)
          // Aborted and superseded responses stay unreported, as everywhere.
          if (controller.signal.aborted || startEpoch !== epoch.current) return
          latest.current.onLoadError?.(error, {
            parent: null,
            reason: "resolve",
          })
        })
    },
    [abortKey, remember]
  )

  /* --------------------------------- resets -------------------------------- */

  const cancelAll = React.useCallback(() => {
    const keys = Array.from(controllers.current.keys())
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    inflight.current.clear()

    const holder = timers.current
    if (holder.prefetch) {
      clearTimeout(holder.prefetch)
      holder.prefetch = null
    }
    if (keys.length === 0) return

    setStore((prev) => {
      let states: Map<string, CascaderLoadState> | null = null
      for (const key of keys) {
        const state = prev.states.get(key)
        if (!state?.loading) continue
        states = states ?? new Map(prev.states)
        if ((prev.pages.get(key)?.length ?? 0) > 0) {
          states.set(key, { ...state, loading: false })
        } else {
          // No entry AT ALL, because membership is what says "loaded". A
          // stranded `loading: true` would make the level read as loaded and
          // empty forever, and nothing would ever fetch it again.
          states.delete(key)
        }
      }
      return states ? { ...prev, states } : prev
    })
    setSearch((prev) => (prev?.loading ? { ...prev, loading: false } : prev))
  }, [])

  // A `loadKey` change drops everything. Declared BEFORE the level effect so a
  // reset always lands before the levels are asked for again.
  const loadKeyRef = React.useRef<{ key: unknown } | null>(null)
  React.useEffect(() => {
    const previous = loadKeyRef.current
    loadKeyRef.current = { key: loadKey }
    if (!previous || Object.is(previous.key, loadKey)) return

    epoch.current += 1
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    inflight.current.clear()
    // `requestIds` is deliberately NOT cleared: the ids are stale-response
    // guards, not cache. Clearing them would let the first post-reset request
    // for a level reuse the id its aborted predecessor captured, and the id
    // check in `stale()` would stop being sufficient on its own - only the
    // epoch bump and the abort would still reject the old response. Keeping
    // the counters monotonic per key keeps all three guards independently
    // correct. (The unmount cleanup still clears them: a remounted instance
    // is a fresh loader, and StrictMode's dev remount depends on that.)
    moreLatch.current.clear()
    attempted.current.clear()
    known.current.clear()

    const holder = timers.current
    if (holder.prefetch) {
      clearTimeout(holder.prefetch)
      holder.prefetch = null
    }

    setStore(createStore)
    setSearch(null)
  }, [loadKey])

  // Closing the popup aborts every request. It does NOT drop the cache: the
  // pages are still valid, and reopening onto a level that is already loaded is
  // the whole point of keeping them.
  React.useEffect(() => {
    if (enabled) return
    if (controllers.current.size === 0) return
    cancelAll()
  }, [enabled, cancelAll])

  React.useEffect(() => {
    const active = controllers.current
    const holder = timers.current
    const pending = inflight.current
    const ids = requestIds.current
    return () => {
      for (const controller of active.values()) controller.abort()
      active.clear()
      // Cleared WITH the controllers, for StrictMode's dev-only remount: its
      // second effect pass re-runs the level loads, and a stale inflight
      // signature would make `runLoad` treat the aborted request as still
      // pending and skip the refetch forever. The aborted promises themselves
      // are already stale-guarded, so emptying the ids underneath them is safe.
      pending.clear()
      ids.clear()
      if (holder.prefetch) clearTimeout(holder.prefetch)
    }
  }, [])

  /* ------------------------------- the effects ----------------------------- */

  const hasLoader = typeof getChildren === "function"
  const hasSearch = typeof onSearch === "function"
  const hasResolve = typeof resolveValue === "function"
  const trimmed = query.trim()

  // Serialised so the effect keys on the CONTENT of the level list rather than
  // on the array identity, which is rebuilt on every render of the root.
  const levelsKey = JSON.stringify(levels)
  const valuesKey = JSON.stringify(values)

  /**
   * THE load trigger. One effect, keyed on the levels that are on screen:
   * the current level in drill mode, every open column in columns mode, the
   * root plus every expanded branch in tree mode.
   */
  React.useEffect(() => {
    if (!enabled || !hasLoader) return
    for (const key of levels) ensureLevel(key, "level")
    // `levels` is depended on through `levelsKey`; `store` re-runs the pass
    // after a load lands or a `loadKey` reset empties the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasLoader, levelsKey, store, ensureLevel])

  React.useEffect(() => {
    if (!hasSearch) return undefined
    if (!enabled || !trimmed) {
      abortKey(SEARCH_KEY)
      setSearch((prev) => (prev === null ? prev : null))
      return undefined
    }
    const timer = setTimeout(() => runSearch(trimmed), searchDebounce)
    return () => {
      clearTimeout(timer)
      abortKey(SEARCH_KEY)
    }
  }, [hasSearch, enabled, trimmed, searchDebounce, abortKey, runSearch])

  React.useEffect(() => {
    if (!enabled || !hasResolve) return
    for (const value of values) {
      if (!value) continue
      if (attempted.current.has(value)) continue
      if (base.byValue.has(value) || known.current.has(value)) continue
      attempted.current.add(value)
      runResolve(value)
    }
    // `values` is depended on through `valuesKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasResolve, valuesKey, base, runResolve])

  /* -------------------------------- the value ------------------------------ */

  const searchResults = React.useMemo(() => {
    if (!hasSearch || !trimmed) return null
    if (!search || search.query !== trimmed) {
      return NO_RESULTS as CascaderNode<T>[]
    }
    return search.results
  }, [hasSearch, trimmed, search])

  const searchState = React.useMemo<CascaderLoadState | null>(() => {
    if (!hasSearch || !trimmed) return null
    const settled = search?.query === trimmed
    return {
      loading: !settled || !!search?.loading,
      error: settled && !!search?.error,
      hasMore: false,
    }
  }, [hasSearch, trimmed, search])

  return React.useMemo(
    () => ({
      active: hasLoader,
      store,
      states: store.states,
      searchResults,
      searchState,
      ensureLevel,
      loadMore,
      retryLevel,
      invalidateLevel,
      prefetchNode,
    }),
    [
      hasLoader,
      store,
      searchResults,
      searchState,
      ensureLevel,
      loadMore,
      retryLevel,
      invalidateLevel,
      prefetchNode,
    ]
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Consumers                                 */
/* -------------------------------------------------------------------------- */

/**
 * The load state of one level, or `null` when that level has never been
 * fetched - which is the same answer a cascader with no loader at all gives.
 *
 * Pass a parent value, or nothing for the root level.
 */
export function useCascaderLoadState(
  parent?: string | null
): CascaderLoadState | null {
  const { loadStates } = useCascaderState()
  return loadStates.get(parent ?? CASCADER_ROOT_KEY) ?? null
}