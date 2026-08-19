// @ts-nocheck
import type {
  CascaderCollapse,
  CascaderFlatNode,
  CascaderIndex,
  CascaderNode,
  CascaderPathSegment,
  CascaderSelectable,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"

/**
 * Key used for root level children in `CascaderIndex.childrenOf`. A sentinel
 * string keeps the map monomorphic, which matters when the index holds tens of
 * thousands of nodes.
 */
export const CASCADER_ROOT_KEY = "\u0000root"

/**
 * Prefix for the paging pseudo-node's value.
 *
 * NUL-prefixed for the same reason `CASCADER_ROOT_KEY` is: no real node value
 * can collide with it. And written as an ESCAPE SEQUENCE for the same reason
 * too - a raw 0x00 byte makes this module read as binary, and `grep -I` then
 * skips the entire file.
 */
export const CASCADER_MORE_PREFIX = "\u0000more:"

/* -------------------------------------------------------------------------- */
/*                                Scroll layout                               */
/* -------------------------------------------------------------------------- */

/**
 * The four classes that make a cascader surface scroll, in one place because
 * the single list and each Miller column have to agree exactly.
 *
 * They live in the LIB rather than next to `CascaderList` for one boring
 * reason: `cascader-columns.tsx` needs them too, and it must not import
 * `cascader.tsx` - that file is the root and pulls the whole primitive in
 * behind it. This module is imported by both already and depends on nothing.
 *
 * The shape is Pattern 3 of the house scroll reference, viewport-bounded popup
 * scroll:
 *
 * ```
 * <div class="relative flex max-h-full min-h-0">   // shell, publishes the pad
 *   <div class={HEIGHT_CLASS}>                     // the bound
 *     <ScrollArea class={SCROLL_CLASS}>            // the scrollport
 *       <list class={ROWS_CLASS} />                // the rows
 * ```
 */

/**
 * The bound.
 *
 * `--available-height` is what the positioner publishes: the distance from the
 * anchor to the edge of the viewport. `--cascader-max-height` is the optional
 * explicit cap. `min()` of the two, so a panel opened near the bottom of the
 * window shrinks to fit and a panel with room to spare still stops at the cap
 * rather than growing to fill the screen.
 *
 * Both fallbacks are load-bearing. An INLINE panel has no positioner and
 * therefore no `--available-height`, and `min()` with an undefined custom
 * property is an INVALID declaration - the whole max-height is dropped, not
 * just that term - so the panel would grow without limit. `100vh` makes the
 * viewport term inert instead. `24rem` is the default cap, which is why nothing
 * has to set the variable in the common case.
 */
export const CASCADER_LIST_HEIGHT_CLASS =
  "max-h-[min(var(--available-height,100vh),var(--cascader-max-height,24rem))]"

/**
 * Each style's own list padding, republished as a variable.
 *
 * The rows and the scrollport are two different elements once a `ScrollArea` is
 * between them, and both need this number: the rows carry it as `padding`, the
 * scrollport as `scroll-padding`, so the row Base UI scrolls into view is not
 * tucked under the edge. Mirrored from `.cn-combobox-list` in all eight sheets
 * - `p-1` everywhere except `p-1.5` in luma and sera, and none at all in lyra.
 * Keep them in step with `registry/styles/style-*.css`.
 *
 * The scrollport takes `max(pad, 4px)` rather than the raw value, because the
 * two numbers answer different questions. Lyra's rows genuinely have no inset,
 * but `scroll-padding: 0` would land an arrowed-to row flush against the edge
 * of the scrollport with no breathing room at all - and `.cn-combobox-list`
 * agrees: it pairs lyra's missing `p-*` with a `scroll-py-1` of its own.
 */
export const CASCADER_LIST_PAD_CLASS =
  "[--cascader-list-pad:0px]"

/**
 * The `ScrollArea` between the bound and the rows.
 *
 * `size-full min-h-0` is what makes the root FILL its bounded parent rather
 * than invent a height of its own. The viewport override is the documented
 * gotcha: a `max-h-*` on the ScrollArea root bounds nothing, because the
 * element that actually scrolls is the viewport inside it. The bound is on the
 * parent here and the viewport is told to fill it, which comes to the same
 * thing and keeps one height expression in one place.
 */
export const CASCADER_SCROLL_CLASS =
  "size-full min-h-0 **:data-[slot=scroll-area-viewport]:h-full **:data-[slot=scroll-area-viewport]:overscroll-contain **:data-[slot=scroll-area-viewport]:scroll-py-[max(var(--cascader-list-pad,4px),4px)]"

/**
 * The rows' own box: the padding `.cn-combobox-list` used to carry, and the
 * `data-empty:p-0` that came with it so an empty state is not inset twice.
 *
 * Block layout, not flex, because `.cn-combobox-list` was block and the rows
 * are already `w-full`. A flex column would lay them out identically right up
 * until something in a consumer's own row markup cared about being a flex item
 * rather than a block, which is not a difference worth introducing for nothing.
 */
export const CASCADER_ROWS_CLASS = "p-(--cascader-list-pad,4px) data-empty:p-0"

/* -------------------------------------------------------------------------- */
/*                                  Tab order                                 */
/* -------------------------------------------------------------------------- */

/**
 * What counts as a keyboard stop inside a panel.
 *
 * The panel has to answer this itself because the scrollport lies. Base UI's
 * ScrollArea viewport makes ITSELF tabbable whenever the content overflows
 * (`tabIndex: hiddenState.x && hiddenState.y ? -1 : 0`), so the number of Tab
 * presses between the search field and the pinned footer changes with the
 * length of the level: one when the list fits, two when it does not, and one
 * MORE PER COLUMN in columns mode. Every one of those extra stops is a
 * `role="presentation"` div with no accessible name that lights the whole list
 * up with a focus ring, so a keyboard user reads it as "the footer is
 * unreachable" and stops pressing. The shadcn `ui/scroll-area.tsx` wrapper is
 * registry-delivered and forwards nothing to its viewport, so the attribute
 * cannot be fixed where it is set.
 *
 * Deliberately the plain HTML set rather than a full "tabbable" implementation:
 * everything the panel renders is a real control or has an explicit
 * `tabindex`, and a consumer's own control inside the panel is covered by the
 * same rule.
 */
const CASCADER_TAB_STOP_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * The stop to step over. Nothing in the primitive ever focuses it on purpose,
 * and the list it wraps is driven from the search field.
 */
const CASCADER_TAB_SKIP_SELECTOR = '[data-slot="scroll-area-viewport"]'

/**
 * Subtrees that are out of the tab order regardless of what they contain, so a
 * collapsed column or a hidden branch cannot hand back a stop nothing can see.
 * Layout is not consulted (`offsetParent`, client rects) - it is unavailable in
 * a test environment and would make the order depend on a measured frame.
 */
const CASCADER_TAB_HIDDEN_SELECTOR = "[hidden],[inert],[aria-hidden='true']"

/** The panel's real keyboard stops, in DOM order. */
function getCascaderTabStops(panel: HTMLElement): HTMLElement[] {
  const stops = Array.from(
    panel.querySelectorAll<HTMLElement>(CASCADER_TAB_STOP_SELECTOR)
  )
  return stops.filter(
    (stop) =>
      // Checked again on the element rather than left to the selector. An
      // option row and a columns trail row are REAL `<button>`s carrying
      // `tabindex="-1"`, so they satisfy the `button` clause and only the
      // negative clause takes them back out. Without this the first Tab lands
      // on row one of the trail.
      stop.getAttribute("tabindex") !== "-1" &&
      !stop.matches(CASCADER_TAB_SKIP_SELECTOR) &&
      !stop.closest(CASCADER_TAB_HIDDEN_SELECTOR)
  )
}

/**
 * The footer's own keyboard stops, in DOM order.
 *
 * `scope` may be the panel (the input's hand-off looks the footer up from
 * there) or the footer itself (its strip handler already stands on it). The
 * same stop filter as the Tab ring, deliberately: an `aria-disabled` command
 * is still a stop, so a footer whose only row is disabled is still reachable
 * and announces WHY it does nothing, instead of being unfindable.
 */
export function getCascaderFooterStops(scope: HTMLElement): HTMLElement[] {
  const footer = scope.matches('[data-slot="cascader-footer"]')
    ? scope
    : scope.querySelector<HTMLElement>('[data-slot="cascader-footer"]')
  if (!footer) return []
  return getCascaderTabStops(footer)
}

/**
 * Where Tab (or Shift+Tab) should land from `from`, or `null` when the move
 * leaves the panel.
 *
 * `null` is the important half of the contract: it means "let the browser do
 * it", which is how Tab off the last footer control still leaves the cascader
 * instead of wrapping. Focus is never trapped in here.
 *
 * `from` does not have to be a stop. The scrollport, an option row and the
 * list itself all hold focus at one time or another, and none of them are in
 * the ring, so an unknown element is resolved by DOM position instead: the
 * first stop after it going forward, the last stop before it going back.
 */
export function getCascaderTabTarget(
  panel: HTMLElement,
  from: Element | null,
  backwards: boolean
): HTMLElement | null {
  const stops = getCascaderTabStops(panel)
  if (stops.length === 0 || !from) return null

  const index = stops.indexOf(from as HTMLElement)
  if (index !== -1) return stops[index + (backwards ? -1 : 1)] ?? null

  if (backwards) {
    for (let i = stops.length - 1; i >= 0; i -= 1) {
      const position = from.compareDocumentPosition(stops[i])
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return stops[i]
    }
    return null
  }

  for (const stop of stops) {
    const position = from.compareDocumentPosition(stop)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return stop
  }
  return null
}

/**
 * The writing direction in force at `element`.
 *
 * Three sources, because no one of them covers the field on its own:
 *
 * 1. **Base UI's `DirectionProvider`**, which is what an RTL app has to mount
 *    anyway for Base UI's own RTL behaviour, and the only source that reaches a
 *    PORTALLED popup when `dir` is scoped to a subtree of the page rather than
 *    to the document. It only ever votes yes: with no provider mounted it
 *    answers `"ltr"`, which is indistinguishable from an explicit one, so
 *    treating that as authoritative would override a real `<html dir="rtl">`.
 * 2. **The nearest `dir` attribute**, which is where an RTL app actually
 *    declares itself and which `closest` finds on `<html>` from inside a portal.
 * 3. **The computed style**, for a direction that comes from CSS instead.
 *
 * Read from the keydown handler and from the hint's layout effect, never
 * during render, so the layout read stays off the render path.
 */
export function isCascaderRtl(element: Element, provided: string): boolean {
  if (provided === "rtl") return true
  const explicit = element.closest("[dir]")?.getAttribute("dir")?.toLowerCase()
  if (explicit === "rtl") return true
  if (explicit === "ltr") return false
  return (
    element.ownerDocument?.defaultView?.getComputedStyle(element).direction ===
    "rtl"
  )
}

/**
 * The paging row, as a REAL node in the rendered list rather than a DOM-only
 * row appended after it.
 *
 * Every index Base UI hands out - the highlight, `aria-activedescendant`, the
 * virtualizer's row index - is an index into the rendered array. A row that
 * exists in the DOM but not in that array shifts every index after it by one,
 * which silently mis-highlights the whole tail of the level. Making the row a
 * node keeps one array and one index space, and has the side benefit of being
 * keyboard reachable: it is simply the last option in the list.
 */
export function createCascaderMoreNode<T = unknown>(
  parentKey: string,
  loadedCount = 0
): CascaderNode<T> {
  return {
    value: `${CASCADER_MORE_PREFIX}${parentKey}`,
    // Empty on purpose: `itemToStringLabel` feeds Base UI's typeahead, and a
    // paging row must never be reachable by typing a letter.
    label: "",
    // How many children the level already has, so the row can say "Loading
    // more..." rather than "Loading..." without a second prop threaded to it.
    count: loadedCount,
  }
}

/** Whether a node is the paging pseudo-node. */
export function isCascaderMoreNode<T>(node: CascaderNode<T>): boolean {
  return node.value.startsWith(CASCADER_MORE_PREFIX)
}

/**
 * The level key a paging pseudo-node belongs to, or `null` for a real node, so
 * a caller can branch on one call instead of two.
 */
export function getCascaderMoreParent<T>(node: CascaderNode<T>): string | null {
  if (!isCascaderMoreNode(node)) return null
  return node.value.slice(CASCADER_MORE_PREFIX.length)
}

/**
 * Normalizes either supported input shape into a single index.
 *
 * Nested input is walked depth first. Flat input is grouped by `getParent` and
 * depths are derived by walking parent links, guarded against cycles so a
 * malformed dataset degrades instead of hanging the render.
 *
 * Duplicate values are ignored after the first occurrence: `value` is the
 * selection key, so a duplicate is a data bug, and first-wins stays stable when
 * pages are appended.
 */
export function buildCascaderIndex<T = unknown>(
  items: readonly CascaderNode<T>[] | undefined,
  getParent?: (node: CascaderNode<T>) => string | null | undefined
): CascaderIndex<T> {
  const byValue = new Map<string, CascaderNode<T>>()
  const childrenOf = new Map<string, CascaderNode<T>[]>()
  const parentOf = new Map<string, string | null>()
  const depthOf = new Map<string, number>()
  const all: CascaderNode<T>[] = []

  const push = (parentKey: string, node: CascaderNode<T>) => {
    const bucket = childrenOf.get(parentKey)
    if (bucket) {
      bucket.push(node)
    } else {
      childrenOf.set(parentKey, [node])
    }
  }

  if (getParent) {
    // Flat adjacency. Two passes: register, then link.
    for (const node of items ?? []) {
      // A nullish entry is a data bug (a sparse array, a failed map), and the
      // build must degrade like it does for duplicates: skip it, say so in dev.
      if (node == null) {
        if (process.env.NODE_ENV !== "production") {
          warnCascaderOnce(
            "nullish-entry",
            "Ignored a null or undefined entry in `items` or `children`. Check the arrays you pass in."
          )
        }
        continue
      }
      if (byValue.has(node.value)) continue
      byValue.set(node.value, node)
      all.push(node)
    }

    for (const node of all) {
      const rawParent = getParent(node)
      // An unknown parent makes the node a root rather than dropping it, so a
      // partially loaded dataset still renders something useful.
      const parent =
        rawParent != null && byValue.has(rawParent) ? rawParent : null
      parentOf.set(node.value, parent)
      push(parent ?? CASCADER_ROOT_KEY, node)
    }

    for (const node of all) {
      let depth = 0
      let cursor = parentOf.get(node.value) ?? null
      const seen = new Set<string>([node.value])
      while (cursor != null && !seen.has(cursor)) {
        seen.add(cursor)
        depth += 1
        cursor = parentOf.get(cursor) ?? null
      }
      depthOf.set(node.value, depth)
    }
  } else {
    // Nested children.
    const walk = (
      nodes: readonly CascaderNode<T>[] | undefined,
      parent: string | null,
      depth: number
    ) => {
      for (const node of nodes ?? []) {
        // Same degradation as the flat path: a nullish entry is skipped rather
        // than crashing the render that called the build.
        if (node == null) {
          if (process.env.NODE_ENV !== "production") {
            warnCascaderOnce(
              "nullish-entry",
              "Ignored a null or undefined entry in `items` or `children`. Check the arrays you pass in."
            )
          }
          continue
        }
        if (byValue.has(node.value)) continue
        byValue.set(node.value, node)
        parentOf.set(node.value, parent)
        depthOf.set(node.value, depth)
        all.push(node)
        push(parent ?? CASCADER_ROOT_KEY, node)
        if (node.children?.length) walk(node.children, node.value, depth + 1)
      }
    }
    walk(items, null, 0)
  }

  return {
    byValue,
    childrenOf,
    parentOf,
    depthOf,
    roots: childrenOf.get(CASCADER_ROOT_KEY) ?? [],
    all,
  }
}

/**
 * Folds asynchronously loaded pages back into an index built from `items`.
 *
 * This is what makes loaded data survive an `items` change. The base index is
 * rebuilt from scratch whenever `items` changes identity; the pages are held
 * separately and merged on top, so a parent re-rendering with a new `items`
 * array re-runs the build and then re-merges the SAME pages rather than
 * throwing away everything the user has drilled into.
 *
 * Every invariant of `buildCascaderIndex` is mirrored exactly:
 *
 * - **First wins.** Static `items` is authoritative: a page node whose value is
 *   already indexed is dropped, not merged over. Within `pages`, insertion
 *   order decides, which is what keeps appended pages stable.
 * - **Nested children are walked**, because a server is free to return a whole
 *   subtree in one response.
 * - **Depths are derived by walking parent links**, cycle-guarded, so a page
 *   that arrives before its parent still ends up at the right depth once the
 *   parent does.
 *
 * `detached` is the deliberate exception: those nodes go into `byValue` ONLY.
 * They are values the cascader must be able to name - async search hits, a
 * selection resolved out of band - but that have no place in any level. Adding
 * them to `all` would make `searchCascaderDeep` return them a second time, and
 * adding them to `childrenOf` would list them in a level the server never put
 * them in.
 */
export function mergeCascaderIndex<T = unknown>(
  base: CascaderIndex<T>,
  pages: ReadonlyMap<string, readonly CascaderNode<T>[]>,
  detached?: ReadonlyMap<string, CascaderNode<T>>
): CascaderIndex<T> {
  // The overwhelmingly common case: no async loader, or nothing loaded yet.
  // Returning the base index unchanged keeps its identity stable, which is what
  // every `useMemo` downstream is keyed on.
  if (pages.size === 0 && !detached?.size) return base

  const byValue = new Map(base.byValue)
  const childrenOf = new Map(base.childrenOf)
  const parentOf = new Map(base.parentOf)
  const depthOf = new Map(base.depthOf)

  // Copy-on-write per bucket: only the levels that actually received a page pay
  // for a new array, so merging one page into a 50k node index stays cheap.
  const copied = new Set<string>()
  const append = (parentKey: string, node: CascaderNode<T>) => {
    let bucket = childrenOf.get(parentKey)
    if (!copied.has(parentKey)) {
      bucket = bucket ? bucket.slice() : []
      childrenOf.set(parentKey, bucket)
      copied.add(parentKey)
    }
    bucket!.push(node)
  }

  const insert = (parentKey: string, nodes: readonly CascaderNode<T>[]) => {
    for (const node of nodes) {
      if (byValue.has(node.value)) continue
      byValue.set(node.value, node)
      parentOf.set(
        node.value,
        parentKey === CASCADER_ROOT_KEY ? null : parentKey
      )
      append(parentKey, node)
      if (node.children?.length) insert(node.value, node.children)
    }
  }

  for (const [parentKey, nodes] of pages) insert(parentKey, nodes)

  for (const value of byValue.keys()) {
    if (depthOf.has(value)) continue
    let depth = 0
    let cursor = parentOf.get(value) ?? null
    const seen = new Set<string>([value])
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor)
      depth += 1
      cursor = parentOf.get(cursor) ?? null
    }
    depthOf.set(value, depth)
  }

  const roots = childrenOf.get(CASCADER_ROOT_KEY) ?? []

  // Rebuilt depth first over the MERGED tree rather than patched, so `all` keeps
  // the document order deep search relies on instead of listing loaded children
  // after every static node.
  const all: CascaderNode<T>[] = []
  const visited = new Set<string>()
  const walk = (nodes: readonly CascaderNode<T>[]) => {
    for (const node of nodes) {
      if (visited.has(node.value)) continue
      visited.add(node.value)
      all.push(node)
      const children = childrenOf.get(node.value)
      if (children?.length) walk(children)
    }
  }
  walk(roots)

  // A page whose parent never arrived is unreachable from the roots. It is
  // still real, loaded data, so it stays searchable rather than vanishing.
  for (const [value, node] of byValue) {
    if (visited.has(value)) continue
    visited.add(value)
    all.push(node)
  }

  if (detached) {
    for (const [value, node] of detached) {
      if (byValue.has(value)) continue
      byValue.set(value, node)
    }
  }

  return { byValue, childrenOf, parentOf, depthOf, roots, all }
}

/** Children of `parent`, or the root level when `parent` is nullish. */
export function getCascaderChildren<T>(
  index: CascaderIndex<T>,
  parent?: string | null
): CascaderNode<T>[] {
  return index.childrenOf.get(parent ?? CASCADER_ROOT_KEY) ?? []
}

/**
 * A node is a branch when it has known children, or declares `hasChildren` for
 * an async level that has not been fetched yet.
 */
export function isCascaderBranch<T>(
  index: CascaderIndex<T>,
  node: CascaderNode<T>
): boolean {
  if (node.hasChildren) return true
  return (index.childrenOf.get(node.value)?.length ?? 0) > 0
}

/** Trailing count for the default row. Explicit `count` wins over the tree. */
export function getCascaderCount<T>(
  index: CascaderIndex<T>,
  node: CascaderNode<T>
): number {
  if (typeof node.count === "number") return node.count
  return index.childrenOf.get(node.value)?.length ?? 0
}

/** Whether a node may be committed as a selection. */
export function isCascaderSelectable<T>(
  index: CascaderIndex<T>,
  node: CascaderNode<T>,
  selectable: CascaderSelectable<T>
): boolean {
  // FIRST, before anything a consumer can override. `selectable="any"` and a
  // custom predicate both say yes to every node they are shown, and the paging
  // row is a node - committing it would select the string that names a level.
  if (isCascaderMoreNode(node)) return false
  if (node.disabled) return false
  // A disabled ANCESTOR refuses the whole subtree, and it has to be checked
  // here rather than left to the rows: a disabled branch cannot be opened, so
  // its children are unreachable by pointer, but `searchCascaderDeep` still
  // surfaces them - committing one would select what the UI says is shut.
  // Cycle-guarded like every other parent walk, O(depth) per call.
  {
    const seen = new Set<string>([node.value])
    let cursor = index.parentOf.get(node.value) ?? null
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor)
      if (index.byValue.get(cursor)?.disabled) return false
      cursor = index.parentOf.get(cursor) ?? null
    }
  }
  if (typeof selectable === "function") return selectable(node)
  if (selectable === "any") return true
  return !isCascaderBranch(index, node)
}

/**
 * Ancestor chain for `value`, root first and the node itself last. Returns an
 * empty array for an unknown value, which is the normal case while async data
 * is still loading.
 */
export function getCascaderPath<T>(
  index: CascaderIndex<T>,
  value: string | null | undefined
): CascaderNode<T>[] {
  if (value == null) return []
  const chain: CascaderNode<T>[] = []
  const seen = new Set<string>()
  let cursor: string | null | undefined = value
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor)
    const node = index.byValue.get(cursor)
    if (!node) break
    chain.push(node)
    cursor = index.parentOf.get(cursor) ?? null
  }
  return chain.reverse()
}

/**
 * Case-folds one string for matching.
 *
 * `toLocaleLowerCase`, not `toLowerCase`: the invariant mapping turns Turkish
 * "I" into "i" rather than "ı", so a Turkish user typing "ışık" never matches
 * "IŞIK". Both the query and the label go through this same call, so the two
 * sides always fold the same way whatever the host locale is - which is what
 * makes it safe, and what a one-sided lowercase never was.
 *
 * Casing for DISPLAY is a different matter and is never done here: a label is
 * already written the way its author wants it read. See `cascader-i18n`.
 */
export function foldCascaderText(text: string): string {
  return text.toLocaleLowerCase()
}

/** Folds once so callers can hoist the cost out of a per-node loop. */
export function normalizeCascaderQuery(query: string): string {
  return foldCascaderText(query.trim())
}

/**
 * Default matcher: case-insensitive substring over the label and any keywords.
 * `normalized` must already be folded via `normalizeCascaderQuery`.
 */
export function matchesCascaderQuery<T>(
  node: CascaderNode<T>,
  normalized: string
): boolean {
  if (!normalized) return true
  // Coerced, not trusted: a label-less node is malformed data, and the first
  // keystroke is the worst possible place to crash over it. An empty label
  // matches nothing, which is the honest answer for a node with no text.
  if (foldCascaderText(node.label ?? "").includes(normalized)) return true
  if (node.keywords) {
    for (const keyword of node.keywords) {
      if (foldCascaderText(keyword).includes(normalized)) return true
    }
  }
  return false
}

/** Filters one level in place-order. Returns the input when the query is empty. */
export function filterCascaderLevel<T>(
  nodes: readonly CascaderNode<T>[],
  query: string,
  matches: (
    node: CascaderNode<T>,
    normalized: string
  ) => boolean = matchesCascaderQuery
): CascaderNode<T>[] {
  const normalized = normalizeCascaderQuery(query)
  if (!normalized) return nodes as CascaderNode<T>[]
  return nodes.filter((node) => matches(node, normalized))
}

/**
 * Searches every node in the index, optionally scoped to the subtree under
 * `within`. Runs over the prebuilt `all` array rather than re-walking the tree,
 * so a keystroke costs one linear pass and no allocation per level.
 */
export function searchCascaderDeep<T>(
  index: CascaderIndex<T>,
  query: string,
  options: {
    within?: string | null
    limit?: number
    matches?: (node: CascaderNode<T>, normalized: string) => boolean
  } = {}
): CascaderNode<T>[] {
  const normalized = normalizeCascaderQuery(query)
  if (!normalized) return []

  const { within, limit = 200, matches = matchesCascaderQuery } = options
  const results: CascaderNode<T>[] = []

  // One memoised ancestry map serves the whole query, instead of a fresh Set
  // per matching node: siblings share almost their entire parent chain, so a
  // per-node allocation pays `matches x depth` for answers this map already
  // holds. The provisional `false` written on the way up doubles as the cycle
  // guard - re-reaching it ends the walk - and the trail is promoted to `true`
  // only once `within` was actually found above it.
  const ancestry = within == null ? null : new Map<string, boolean>()
  const isWithin = (node: CascaderNode<T>) => {
    if (within == null || !ancestry) return true
    const trail: string[] = []
    let answer = false
    let cursor: string | null | undefined = index.parentOf.get(node.value)
    while (cursor != null) {
      if (cursor === within) {
        answer = true
        break
      }
      const cached = ancestry.get(cursor)
      if (cached !== undefined) {
        answer = cached
        break
      }
      ancestry.set(cursor, false)
      trail.push(cursor)
      cursor = index.parentOf.get(cursor) ?? null
    }
    if (answer) for (const value of trail) ancestry.set(value, true)
    return answer
  }

  for (const node of index.all) {
    if (results.length >= limit) break
    if (!matches(node, normalized)) continue
    if (!isWithin(node)) continue
    results.push(node)
  }

  return results
}

/**
 * Flattens the tree into the visible-row list for tree mode, honouring
 * `expanded`. Sibling counts are captured per level so rows can carry
 * `aria-setsize` / `aria-posinset` without a second pass.
 *
 * `sentinels` names the level keys that need a paging pseudo-row - a level with
 * another page to fetch, one whose fetch is in flight, or one that failed. The
 * row is emitted after that level's last loaded child and counts as a sibling,
 * because it is a real option: it occupies an index, it is arrow-reachable, and
 * `aria-setsize` would be a lie if it did not include it.
 *
 * Root level rows are keyed by `CASCADER_ROOT_KEY`, exactly as in `childrenOf`.
 */
export function flattenCascaderTree<T>(
  index: CascaderIndex<T>,
  expanded: ReadonlySet<string>,
  sentinels?: ReadonlySet<string>
): CascaderFlatNode<T>[] {
  const rows: CascaderFlatNode<T>[] = []

  const walk = (
    nodes: readonly CascaderNode<T>[],
    parentKey: string,
    depth: number
  ) => {
    const sentinel = sentinels?.has(parentKey) ?? false
    const setSize = nodes.length + (sentinel ? 1 : 0)
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const branch = isCascaderBranch(index, node)
      const isExpanded = branch && expanded.has(node.value)
      rows.push({
        node,
        depth,
        branch,
        expanded: isExpanded,
        setSize,
        posInSet: i + 1,
      })
      if (isExpanded) {
        walk(index.childrenOf.get(node.value) ?? [], node.value, depth + 1)
      }
    }
    if (sentinel) {
      rows.push({
        node: createCascaderMoreNode<T>(parentKey, nodes.length),
        depth,
        branch: false,
        expanded: false,
        setSize,
        posInSet: setSize,
      })
    }
  }

  walk(index.roots, CASCADER_ROOT_KEY, 0)
  return rows
}

/**
 * Shortens a path to at most `maxSegments` node segments, replacing the elided
 * run with a single ellipsis segment that still carries the hidden nodes so a
 * consumer can surface them in a tooltip.
 *
 * Shared by the trigger value and the in-panel breadcrumb so the two can never
 * disagree about how a deep path reads.
 */
export function collapseCascaderPath<T>(
  path: readonly CascaderNode<T>[],
  options: { maxSegments?: number; collapse?: CascaderCollapse } = {}
): CascaderPathSegment<T>[] {
  const { maxSegments = 3, collapse = "middle" } = options

  const asNodes = (
    nodes: readonly CascaderNode<T>[]
  ): CascaderPathSegment<T>[] =>
    nodes.map((node) => ({ type: "node" as const, node }))

  if (collapse === "none" || maxSegments <= 0 || path.length <= maxSegments) {
    return asNodes(path)
  }

  if (collapse === "start") {
    const tail = path.slice(path.length - maxSegments)
    return [
      { type: "ellipsis", hidden: path.slice(0, path.length - maxSegments) },
      ...asNodes(tail),
    ]
  }

  // "middle": keep the root for orientation and as much of the tail as fits.
  const head = path.slice(0, 1)
  const tailCount = maxSegments - 1
  const tail = path.slice(path.length - tailCount)
  const hidden = path.slice(1, path.length - tailCount)

  if (hidden.length === 0) return asNodes(path)

  return [...asNodes(head), { type: "ellipsis", hidden }, ...asNodes(tail)]
}

/* -------------------------------------------------------------------------- */
/*                              Cascade selection                             */
/* -------------------------------------------------------------------------- */

/**
 * Every LOADED node in the subtree rooted at `value`, the root itself first,
 * depth first after it.
 *
 * "Loaded" is the whole caveat of `cascade`, and it is stated in the name on
 * purpose: the index only knows the children that `items` supplied or that a
 * `getChildren` call has already returned. There is no way to include an
 * unfetched descendant without fetching it, and selecting a node must not fire
 * a network request per level of an arbitrarily deep subtree.
 */
export function collectCascaderSubtree<T>(
  index: CascaderIndex<T>,
  value: string
): CascaderNode<T>[] {
  const root = index.byValue.get(value)
  if (!root) return []

  const out: CascaderNode<T>[] = []
  const seen = new Set<string>()
  const walk = (node: CascaderNode<T>) => {
    if (seen.has(node.value)) return
    seen.add(node.value)
    out.push(node)
    const children = index.childrenOf.get(node.value)
    if (children) for (const child of children) walk(child)
  }
  walk(root)
  return out
}

/**
 * Toggles `value` together with its loaded subtree, then reconciles ancestors.
 *
 * The selection stays a flat array of values - there is no second, hidden
 * "checked" state - so the invariant this maintains is the whole contract:
 *
 * - **A branch's value is in the selection exactly when every selectable loaded
 *   child of it is.** That is what makes a row's checked state an O(1) set
 *   lookup, which is what keeps a windowed 5,000 row level cheap.
 * - **Indeterminate is derived, never stored.** See `getCascaderIndeterminate`.
 *
 * Nodes the `isSelectable` predicate rejects - disabled ones, and anything a
 * custom predicate refuses - are skipped on the way down AND ignored on the way
 * up, so one disabled child cannot permanently block its parent from ever
 * reading as fully selected.
 *
 * The pressed node itself is always included: it was committed, so it is
 * selectable by definition.
 */
export function applyCascadeSelection<T>(
  index: CascaderIndex<T>,
  selected: readonly string[],
  value: string,
  select: boolean,
  isSelectable: (node: CascaderNode<T>) => boolean = () => true
): string[] {
  const next = new Set(selected)
  const subtree = collectCascaderSubtree(index, value)

  // A value the index has never heard of still toggles itself, so an async
  // selection that arrived before its level did is not silently dropped.
  if (subtree.length === 0) {
    if (select) next.add(value)
    else next.delete(value)
  }

  for (const node of subtree) {
    if (node.value !== value && !isSelectable(node)) continue
    if (select) next.add(node.value)
    else next.delete(node.value)
  }

  // Bottom up: a parent can only answer once its children have.
  const seen = new Set<string>([value])
  let cursor = index.parentOf.get(value) ?? null
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = index.byValue.get(cursor)
    const children = index.childrenOf.get(cursor) ?? []
    const selectable = children.filter((child) => isSelectable(child))
    const full =
      selectable.length > 0 &&
      selectable.every((child) => next.has(child.value)) &&
      // Never promote a node the consumer said may not be committed. With
      // `selectable="leaf"` no branch qualifies, which is why `cascade`
      // warns when it is paired with leaf-only selection.
      !!parent &&
      isSelectable(parent)
    if (full) next.add(cursor)
    else next.delete(cursor)
    cursor = index.parentOf.get(cursor) ?? null
  }

  return Array.from(next)
}

/**
 * How many selected nodes each value has BELOW it, at any depth.
 *
 * The one pass that answers both "is this branch partially selected?" and "how
 * many of its descendants are selected?", so the dash on a checkbox and the
 * number in the trailing slot can never disagree.
 *
 * Walks up from each selection rather than down from each node, so the cost is
 * `selections x depth` instead of one subtree scan per rendered row. That
 * matters: a per-row walk is `rows x descendants`, which is quadratic on a wide
 * tree and is paid again on every keystroke that re-renders the level.
 *
 * A value counts itself for none of its own count and once for each of its
 * ancestors, so a branch that is selected together with two of its children
 * reports 2 rather than 3.
 */
export function getCascaderSelectedDescendants<T>(
  index: CascaderIndex<T>,
  selected: readonly string[]
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const value of selected) {
    const seen = new Set<string>([value])
    let cursor = index.parentOf.get(value) ?? null
    while (cursor != null && !seen.has(cursor)) {
      seen.add(cursor)
      counts.set(cursor, (counts.get(cursor) ?? 0) + 1)
      cursor = index.parentOf.get(cursor) ?? null
    }
  }

  return counts
}

/**
 * The PARTIALLY selected values, read off the counts above: an ancestor of a
 * selection that is not itself selected.
 *
 * Split from the walk so a caller that already holds the counts - the root
 * does - pays for one traversal rather than two.
 */
export function getCascaderIndeterminateFrom(
  counts: ReadonlyMap<string, number>,
  selected: readonly string[]
): Set<string> {
  const selectedSet = new Set(selected)
  const partial = new Set<string>()

  for (const [value, count] of counts) {
    if (count > 0 && !selectedSet.has(value)) partial.add(value)
  }

  return partial
}

/**
 * The values that are PARTIALLY selected: not selected themselves, but with at
 * least one selected descendant.
 *
 * Kept as the one-call form for consumers. The root uses the two halves above
 * directly, because it publishes the counts as well.
 */
export function getCascaderIndeterminate<T>(
  index: CascaderIndex<T>,
  selected: readonly string[]
): Set<string> {
  return getCascaderIndeterminateFrom(
    getCascaderSelectedDescendants(index, selected),
    selected
  )
}

/** How `getCascaderCheckedValues` condenses a full-closure selection. */
export type CascaderCheckedStrategy = "all" | "parent" | "child"

/**
 * The cascade selection under a reporting strategy. DERIVED OUTPUT ONLY: the
 * STORED value stays the full closure - that invariant is what keeps a row's
 * checked state an O(1) set lookup on a windowed level - and this condenses it
 * at the edge, for an `onValueChange` payload or a server that wants the
 * antd-style minimal form.
 *
 * - `"all"`: the closure as-is, byte for byte.
 * - `"parent"`: a value survives only when its parent is NOT selected, so a
 *   fully selected branch is reported as the branch alone. Roots and values
 *   the index has never heard of are always kept.
 * - `"child"`: a value survives only when NO child of it is selected, so the
 *   same branch is reported as its deepest selected frontier.
 *
 * Order is preserved from `selected`, because a filter cannot reorder.
 */
export function getCascaderCheckedValues<T>(
  index: CascaderIndex<T>,
  selected: readonly string[],
  strategy: CascaderCheckedStrategy
): readonly string[] {
  if (strategy === "all") return selected

  const set = new Set(selected)
  if (strategy === "parent") {
    return selected.filter((value) => {
      const parent = index.parentOf.get(value)
      return parent == null || !set.has(parent)
    })
  }

  return selected.filter((value) => {
    const children = index.childrenOf.get(value)
    if (!children?.length) return true
    return !children.some((child) => set.has(child.value))
  })
}

/**
 * The values in `nodes` whose label is shared with another node in the same
 * list, and which therefore need their path shown to stay distinguishable.
 *
 * Used by the chips: "Name" twice over says nothing, "Person / Name" and
 * "Company / Name" say everything, and showing a path on every chip when
 * nothing collides is just noise.
 */
export function findAmbiguousCascaderLabels<T>(
  nodes: readonly CascaderNode<T>[]
): Set<string> {
  const firstByLabel = new Map<string, string>()
  const ambiguous = new Set<string>()

  for (const node of nodes) {
    const first = firstByLabel.get(node.label)
    if (first === undefined) {
      firstByLabel.set(node.label, node.value)
      continue
    }
    ambiguous.add(node.value)
    ambiguous.add(first)
  }

  return ambiguous
}

/* -------------------------------------------------------------------------- */
/*                              Development only                              */
/* -------------------------------------------------------------------------- */

/**
 * The ledger of warnings already emitted, keyed by the exact occurrence.
 *
 * Module scoped, because the alternative is a warning per render: every one of
 * these fires from a render or an effect that re-runs, and a console line
 * repeated sixty times a second is indistinguishable from noise.
 */
const CASCADER_WARNED = new Set<string>()

/**
 * Warns once per `key`, never in production, and never by throwing.
 *
 * Every call site is additionally wrapped in a `process.env.NODE_ENV` check so
 * a production bundler drops the message string too, not just the call.
 */
export function warnCascaderOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === "production") return
  if (CASCADER_WARNED.has(key)) return
  CASCADER_WARNED.add(key)
  console.warn(`[Cascader] ${message}`)
}

/**
 * Empties the ledger. For tests only - a warning is meant to be seen once per
 * page, and there is nothing to reset in an application.
 */
export function resetCascaderWarnings(): void {
  CASCADER_WARNED.clear()
}

/** What a dev-time scan of the consumer's `items` found wrong with it. */
export interface CascaderDataIssues {
  /**
   * Values that appear more than once. The first occurrence wins and the rest
   * are dropped, so a duplicate silently removes a row.
   */
  duplicates: string[]
  /**
   * Values sitting on a `getParent` cycle. Their depth is clamped by the cycle
   * guard rather than derived, so the tree renders but reads wrong.
   */
  cycles: string[]
}

/**
 * Dev-time scan of the raw input, run apart from `buildCascaderIndex` so the
 * build itself stays a hot, allocation-free path in production.
 *
 * Both problems are silent by construction: the build drops a duplicate and
 * clamps a cycle rather than throwing, which is the right runtime behaviour and
 * exactly why they need saying out loud in development.
 */
export function findCascaderDataIssues<T>(
  items: readonly CascaderNode<T>[] | undefined,
  getParent?: (node: CascaderNode<T>) => string | null | undefined
): CascaderDataIssues {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const flat: CascaderNode<T>[] = []

  const visit = (nodes: readonly CascaderNode<T>[] | undefined) => {
    for (const node of nodes ?? []) {
      // The build skips a nullish entry, so the dev scan of the same input has
      // to survive it too - it runs BEFORE the build's warning can fire.
      if (node == null) continue
      if (seen.has(node.value)) duplicates.add(node.value)
      else seen.add(node.value)
      flat.push(node)
      // Walked even in flat mode: a node carrying BOTH `children` and a
      // `getParent` answer is itself a bug worth surfacing as a duplicate.
      if (node.children?.length) visit(node.children)
    }
  }
  visit(items)

  const cycles: string[] = []
  if (getParent) {
    const parentOf = new Map<string, string | null>()
    for (const node of flat) {
      if (parentOf.has(node.value)) continue
      const raw = getParent(node)
      parentOf.set(node.value, raw != null && seen.has(raw) ? raw : null)
    }
    for (const node of flat) {
      const walked = new Set<string>([node.value])
      let cursor = parentOf.get(node.value) ?? null
      while (cursor != null) {
        if (walked.has(cursor)) {
          cycles.push(node.value)
          break
        }
        walked.add(cursor)
        cursor = parentOf.get(cursor) ?? null
      }
    }
  }

  return { duplicates: Array.from(duplicates), cycles }
}