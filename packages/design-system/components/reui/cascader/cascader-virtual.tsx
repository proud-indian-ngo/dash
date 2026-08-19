// @ts-nocheck
"use client"

import * as React from "react"
import { CascaderColumnPanel } from "@pi-dash/design-system/components/reui/cascader/cascader-columns"
import {
  useCascaderActions,
  useCascaderHighlight,
  useCascaderState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import type { CascaderColumn } from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import {
  CascaderItem,
  CascaderItems,
  getCascaderMoreProps,
} from "@pi-dash/design-system/components/reui/cascader/cascader-item"
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Virtualizer,
} from "@tanstack/react-virtual"

/**
 * Windowing for the cascader, kept in its own file so the primitive's own
 * install never pulls `@tanstack/react-virtual` in.
 *
 * Three Base UI facts shape everything here, and none of them are negotiable:
 *
 * 1. A windowed row MUST carry an explicit `index`. Base UI's fallback is an
 *    O(n) `findItemIndex` per row per render, and it returns `-1` during the
 *    single empty frame the root renders to reset the highlight on a level
 *    swap - which would leave `aria-activedescendant` pointing at nothing.
 * 2. Neither `Combobox.Collection` nor a FUNCTION CHILD on `Combobox.List` may
 *    be used. The list implicitly wraps a function child in a Collection, and a
 *    Collection renders every filtered item, which is exactly the thing
 *    windowing exists to avoid.
 * 3. Base UI's internal scroll-into-view reads `listRef.current[index]`, which
 *    is empty for a windowed-out row, so it silently no-ops. The highlight is
 *    therefore mirrored out of the store and fed to `scrollToIndex` here.
 *
 * The mirror image of (1) is that an explicit index is DESTRUCTIVE while the
 * list is not virtualized: `useCompositeListItem` skips registration, the
 * surrounding `CompositeList` then truncates `elementsRef` to zero, and the
 * first arrow key highlights nothing. That is why every component below renders
 * plain, index-less rows until the root has actually flipped `virtualized`, and
 * why the index is gated in exactly one place inside `CascaderItem`.
 */

/* -------------------------------------------------------------------------- */
/*                                 Virtualizer                                */
/* -------------------------------------------------------------------------- */

export interface UseCascaderVirtualizerOptions {
  count: number
  getScrollElement: () => HTMLElement | null
  /** Row height used before a row has been measured. */
  estimateSize?: number
  /** Rows rendered beyond each edge of the viewport. */
  overscan?: number
  /** Key rows by node value, never by index: a tree expand shifts every index. */
  getItemKey: (index: number) => string | number
  /**
   * Render index of the highlighted row, or `-1`. Pinned into the window so
   * `aria-activedescendant` always resolves to a mounted element.
   */
  activeIndex?: number
}

export type CascaderVirtualizer = Virtualizer<HTMLElement, HTMLElement>

/**
 * The cascader's virtualizer: a plain TanStack virtualizer plus the two things
 * a combobox list needs on top of it.
 *
 * `activeIndex` is clamped against `count` on EVERY read rather than once by
 * the caller. The highlight is emitted from a layout effect, so it can be one
 * commit ahead of a level that just shrank - an unclamped read would pin an
 * index past the end of the list and scroll to a row that no longer exists.
 */
export function useCascaderVirtualizer({
  count,
  getScrollElement,
  estimateSize = 32,
  overscan = 8,
  getItemKey,
  activeIndex = -1,
}: UseCascaderVirtualizerOptions): CascaderVirtualizer {
  const active = activeIndex >= 0 && activeIndex < count ? activeIndex : -1

  // Keeps the highlighted row mounted even when it is scrolled far out of the
  // window, so the input's `aria-activedescendant` never points at a removed
  // node - which axe reports and screen readers read as nothing at all.
  const rangeExtractor = React.useCallback(
    (range: Range) => {
      const indices = new Set(defaultRangeExtractor(range))
      if (active !== -1) indices.add(active)
      return Array.from(indices).sort((a, b) => a - b)
    },
    [active]
  )

  const measureEstimate = React.useCallback(() => estimateSize, [estimateSize])

  // React Compiler declines to memoize anything that calls `useVirtualizer`,
  // because the virtualizer hands back methods whose identity it cannot reason
  // about. That bail-out is correct and costs nothing here: rows are memoised
  // one by one through `CascaderItem`, and nothing downstream memoises on the
  // virtualizer's own methods. Acknowledged rather than left to accumulate.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count,
    getScrollElement,
    estimateSize: measureEstimate,
    overscan,
    getItemKey,
    rangeExtractor,
  })

  // The replacement for Base UI's scroll-into-view, which no-ops on a windowed
  // row. Without it the highlight can move entirely off screen, which is an
  // accessibility bug rather than a cosmetic one.
  React.useEffect(() => {
    if (active === -1) return
    virtualizer.scrollToIndex(active, { align: "auto" })
  }, [active, count, virtualizer])

  return virtualizer
}

/* -------------------------------------------------------------------------- */
/*                                  Geometry                                  */
/* -------------------------------------------------------------------------- */

interface CascaderVirtualGutter {
  block: number
  inline: number
}

const NO_GUTTER: CascaderVirtualGutter = { block: 0, inline: 0 }

/**
 * The ROWS' BOX's own padding, measured once per container.
 *
 * A windowed row is absolutely positioned, so its offsets resolve against that
 * box's PADDING box while the spacer that gives the list its scroll height is
 * an in-flow child sitting inside its CONTENT box. Left alone, every row would
 * sit flush against the edges and the last one would stop short of the bottom.
 * Every style sets its own list padding, so the value is read rather than
 * hardcoded.
 *
 * Deliberately NOT the scrollport. Since the scroll rework the two are separate
 * elements and the padding is on this one, so measuring the viewport would read
 * a flat zero and offset every row by one style's inset.
 */
function useCascaderVirtualGutter(
  contentElement: HTMLElement | null
): CascaderVirtualGutter {
  const [gutter, setGutter] = React.useState<CascaderVirtualGutter>(NO_GUTTER)

  React.useLayoutEffect(() => {
    if (!contentElement) return
    const styles = getComputedStyle(contentElement)
    const block = Number.parseFloat(styles.paddingTop) || 0
    const inline =
      Number.parseFloat(styles.paddingInlineStart || styles.paddingLeft) || 0
    setGutter((previous) =>
      previous.block === block && previous.inline === inline
        ? previous
        : { block, inline }
    )
  }, [contentElement])

  return gutter
}

/**
 * Absolute placement for one row.
 *
 * `insetInlineStart` / `insetInlineEnd` rather than `left` / `width`, so a
 * windowed list is laid out correctly in RTL without a second code path.
 */
function cascaderVirtualRowStyle(
  start: number,
  gutter: CascaderVirtualGutter
): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    insetInlineStart: gutter.inline,
    insetInlineEnd: gutter.inline,
    transform: `translateY(${start + gutter.block}px)`,
  }
}

/**
 * The element that actually SCROLLS, given the element the rows are laid out
 * in.
 *
 * Since the scroll rework those are two different nodes. The rows' box is the
 * list (or the column's inner group): it carries the per-style padding and, when
 * windowed, the `position: relative` that makes it the containing block for the
 * absolutely positioned rows. The scrollport is Base UI's `ScrollArea` viewport
 * one level up, and that is what TanStack has to observe and what
 * `scrollToIndex` has to move - pointed at the rows' box instead, the
 * virtualizer would read `clientHeight` from an element that never overflows,
 * conclude the whole list is visible and render every row.
 *
 * `closest` rather than `parentElement`, and a fallback to the content element
 * itself, so a hand-written list with a plain `overflow-y-auto` container keeps
 * working exactly as it did.
 */
function cascaderScrollElement(
  content: HTMLElement | null
): HTMLElement | null {
  if (!content) return null
  return (
    content.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
    content
  )
}

/**
 * The one non-option child of the listbox.
 *
 * `role="presentation"` takes it out of the accessibility tree entirely, so the
 * listbox still owns nothing but options. It also doubles as the handle on the
 * rows' box: its parent IS that box, which saves threading a ref through
 * `CascaderList` and works just as well inside a custom one.
 */
function CascaderVirtualSpacer({
  height,
  onContentElement,
}: {
  height: number
  onContentElement: (element: HTMLElement | null) => void
}) {
  return (
    <div
      ref={(node) => onContentElement(node?.parentElement ?? null)}
      role="presentation"
      data-slot="cascader-virtual-spacer"
      style={{ height }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Rows                                    */
/* -------------------------------------------------------------------------- */

export interface CascaderVirtualItemsProps {
  /** Row height before measurement. Defaults to the root `estimateRowSize`. */
  estimateSize?: number
  /** Rows rendered beyond each edge. Defaults to the root `overscan`. */
  overscan?: number
}

/**
 * Windowed replacement for `CascaderItems`. Drop it inside `CascaderList`.
 *
 * Registers itself with the root in a LAYOUT effect, because the root's
 * `virtualized` flag is derived from that registration and the flip has to land
 * before the browser paints. Until the root has seen it, this renders exactly
 * what `CascaderItems` renders - so no frame ever contains rows carrying an
 * explicit index while Base UI still believes it owns the composite list.
 */
function CascaderVirtualItems(props: CascaderVirtualItemsProps) {
  const { virtualized, registerVirtualRenderer } = useCascaderActions()

  React.useLayoutEffect(
    () => registerVirtualRenderer(),
    [registerVirtualRenderer]
  )

  if (!virtualized) return <CascaderItems />

  return <CascaderVirtualRows {...props} />
}

function CascaderVirtualRows({
  estimateSize,
  overscan,
}: CascaderVirtualItemsProps) {
  const {
    estimateRowSize,
    overscan: rootOverscan,
    mode,
    isBranch,
    isSelectable,
    isSelected,
    isIndeterminate,
  } = useCascaderActions()
  const { renderedItems, treeRows, deepResults, loadStates } =
    useCascaderState()
  // The one component in the whole primitive that re-renders on the highlight.
  // It has to: the pinned row and the scroll target are both derived from it.
  const highlight = useCascaderHighlight()

  // Two elements, deliberately: the rows' box is what the gutter is measured
  // from (it carries the padding), and the scrollport is what the virtualizer
  // observes. See `cascaderScrollElement`.
  const [contentElement, setContentElement] =
    React.useState<HTMLElement | null>(null)
  const gutter = useCascaderVirtualGutter(contentElement)

  const tree = mode === "tree"
  const count = tree ? treeRows.length : renderedItems.length
  const showPath = !tree && deepResults !== null

  const getItemKey = React.useCallback(
    (index: number) =>
      (tree ? treeRows[index]?.node.value : renderedItems[index]?.value) ??
      index,
    [tree, treeRows, renderedItems]
  )

  const virtualizer = useCascaderVirtualizer({
    count,
    getScrollElement: () => cascaderScrollElement(contentElement),
    estimateSize: estimateSize ?? estimateRowSize,
    overscan: overscan ?? rootOverscan,
    getItemKey,
    activeIndex: highlight.index,
  })

  return (
    <>
      <CascaderVirtualSpacer
        height={virtualizer.getTotalSize()}
        onContentElement={setContentElement}
      />
      {virtualizer.getVirtualItems().map((row) => {
        const flat = tree ? treeRows[row.index] : undefined
        const node = tree ? flat?.node : renderedItems[row.index]
        // The window can name a row the level no longer has, for exactly one
        // commit after a query narrows it. Skipping is correct; the virtualizer
        // recomputes from the new count on the same tick.
        if (!node) return null

        return (
          <CascaderItem
            key={row.key}
            // Measured, not assumed: rows are two lines with a `description`,
            // three in deep search, and every style sets its own row height. An
            // estimate alone would make `scrollToIndex` land on the wrong row.
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={cascaderVirtualRowStyle(row.start, gutter)}
            node={node}
            index={row.index}
            depth={flat?.depth}
            expanded={flat?.expanded}
            branch={flat ? flat.branch : isBranch(node)}
            selectable={isSelectable(node)}
            selected={isSelected(node)}
            indeterminate={isIndeterminate(node)}
            {...getCascaderMoreProps(node, loadStates)}
            showPath={showPath}
            aria-setsize={flat ? flat.setSize : count}
            aria-posinset={flat ? flat.posInSet : row.index + 1}
          />
        )
      })}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Column                                   */
/* -------------------------------------------------------------------------- */

export interface CascaderVirtualColumnProps extends CascaderVirtualItemsProps {
  column: CascaderColumn
}

/**
 * Windowed replacement for one Miller column. Pass it through the
 * `CascaderColumns` render slot:
 *
 * ```tsx
 * <CascaderColumns>
 *   {(column) => <CascaderVirtualColumn column={column} />}
 * </CascaderColumns>
 * ```
 *
 * One virtualizer PER COLUMN, because each column scrolls independently. Only
 * the deepest column is Base UI's listbox, so only it may carry row indices,
 * only it subscribes to the highlight and only it scrolls to it. The trail
 * behind is `as="button"` rows outside Base UI entirely, which makes its
 * windowing plain DOM windowing and lets it kick in on its own row count rather
 * than waiting for the root to flip.
 */
function CascaderVirtualColumn({
  column,
  estimateSize,
  overscan,
}: CascaderVirtualColumnProps) {
  const {
    virtualized,
    registerVirtualRenderer,
    virtualize,
    virtualizeThreshold,
  } = useCascaderActions()

  React.useLayoutEffect(
    () => registerVirtualRenderer(),
    [registerVirtualRenderer]
  )

  const windowed = column.active
    ? virtualized
    : (virtualize ?? column.items.length >= virtualizeThreshold)

  if (!windowed) return <CascaderColumnPanel column={column} />

  return (
    <CascaderColumnPanel column={column} virtualized>
      {column.active ? (
        <CascaderVirtualActiveColumnRows
          column={column}
          estimateSize={estimateSize}
          overscan={overscan}
        />
      ) : (
        <CascaderVirtualColumnRows
          column={column}
          estimateSize={estimateSize}
          overscan={overscan}
          activeIndex={-1}
        />
      )}
    </CascaderColumnPanel>
  )
}

/**
 * Subscribes to the highlight on behalf of the active column only, so a trail
 * column never re-renders on an arrow key or a pointer move over the list.
 */
function CascaderVirtualActiveColumnRows(props: CascaderVirtualColumnProps) {
  const highlight = useCascaderHighlight()
  return <CascaderVirtualColumnRows {...props} activeIndex={highlight.index} />
}

function CascaderVirtualColumnRows({
  column,
  estimateSize,
  overscan,
  activeIndex,
}: CascaderVirtualColumnProps & { activeIndex: number }) {
  const {
    estimateRowSize,
    overscan: rootOverscan,
    baseId,
    isBranch,
    isSelectable,
    isSelected,
    isIndeterminate,
  } = useCascaderActions()
  const { loadStates } = useCascaderState()

  const [contentElement, setContentElement] =
    React.useState<HTMLElement | null>(null)
  const gutter = useCascaderVirtualGutter(contentElement)

  const items = column.items
  const getItemKey = React.useCallback(
    (index: number) => items[index]?.value ?? index,
    [items]
  )

  const virtualizer = useCascaderVirtualizer({
    count: items.length,
    getScrollElement: () => cascaderScrollElement(contentElement),
    estimateSize: estimateSize ?? estimateRowSize,
    overscan: overscan ?? rootOverscan,
    getItemKey,
    activeIndex,
  })

  return (
    <>
      <CascaderVirtualSpacer
        height={virtualizer.getTotalSize()}
        onContentElement={setContentElement}
      />
      {virtualizer.getVirtualItems().map((row) => {
        const node = items[row.index]
        if (!node) return null
        const open = node.value === column.activeValue

        return (
          <CascaderItem
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={cascaderVirtualRowStyle(row.start, gutter)}
            node={node}
            as={column.active ? "option" : "button"}
            depth={column.depth}
            branch={isBranch(node)}
            selectable={isSelectable(node)}
            selected={isSelected(node)}
            indeterminate={isIndeterminate(node)}
            {...getCascaderMoreProps(node, loadStates)}
            data-open={open || undefined}
            className={open ? "bg-accent/60 text-accent-foreground" : undefined}
            // Only the listbox column may carry an index or listbox metadata.
            // A trail row is a `role="button"`, which allows neither.
            {...(column.active
              ? {
                  index: row.index,
                  "aria-setsize": items.length,
                  "aria-posinset": row.index + 1,
                }
              : null)}
            {...(!column.active && open
              ? {
                  "aria-expanded": true,
                  "aria-controls": `${baseId}-column-${column.depth + 1}`,
                }
              : null)}
          />
        )
      })}
    </>
  )
}

export { CascaderVirtualColumn, CascaderVirtualItems }
