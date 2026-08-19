// @ts-nocheck
import * as React from "react"
import {
  useCascaderActions,
  useCascaderState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import type { CascaderColumn } from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import {
  CascaderItem,
  getCascaderMoreProps,
} from "@pi-dash/design-system/components/reui/cascader/cascader-item"
import {
  CASCADER_LIST_HEIGHT_CLASS,
  CASCADER_LIST_PAD_CLASS,
  CASCADER_ROOT_KEY,
  CASCADER_ROWS_CLASS,
  CASCADER_SCROLL_CLASS,
  warnCascaderOnce,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"

import { cn } from "@pi-dash/design-system/lib/utils"
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading02Icon } from "@hugeicons/core-free-icons"

export interface CascaderColumnsProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** Width of each column. */
  columnWidth?: number | string
  /**
   * Caps each column's height. Falls back to the root `maxHeight`, and then to
   * a 24rem cap. A CAP rather than a height: the columns still shrink to
   * whatever room the viewport leaves.
   */
  maxHeight?: number | string
  /**
   * Replaces the default panel for every column.
   *
   * The slot exists so a windowed panel can be swapped in without this file
   * depending on a virtualization library:
   * `{(column) => <CascaderVirtualColumn column={column} />}`.
   */
  children?: (column: CascaderColumn) => React.ReactNode
}

/**
 * Miller columns: the open trail rendered side by side, one panel per level.
 *
 * Only the DEEPEST column is a real listbox. Base UI owns exactly one list, and
 * a Miller-columns UI moves keyboard focus one column at a time anyway, so the
 * trail behind renders as plain buttons with identical markup. That keeps one
 * state machine and one keyboard model across all three modes instead of
 * forking a second, 2D one.
 *
 * ArrowLeft / ArrowRight move between columns, handled by `CascaderInput`.
 */
function CascaderColumns({
  className,
  columnWidth = 220,
  maxHeight: maxHeightProp,
  children,
  ...props
}: CascaderColumnsProps) {
  const { maxHeight, mode, labels } = useCascaderActions()
  const { columns } = useCascaderState()

  // Before the early return, so the hook count is the same in both modes. The
  // component rendering nothing at all is precisely the thing that is easy to
  // stare at for an hour without suspecting the mode.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (mode === "columns") return
    warnCascaderOnce(
      `columns-outside-columns-mode:${mode}`,
      `\`CascaderColumns\` renders nothing in \`mode="${mode}"\`, so \`columnWidth\` and everything else on it does nothing. Set \`mode="columns"\` on the root, or render \`CascaderList\` instead.`
    )
  }, [mode])

  if (mode !== "columns") return null

  const height = maxHeightProp ?? maxHeight
  const toCss = (value: number | string) =>
    typeof value === "number" ? `${value}px` : value

  return (
    <div
      data-slot="cascader-columns"
      // One named container around the trail, so the panels inside are
      // announced as levels of one thing rather than as loose siblings.
      role="group"
      aria-label={labels.columnsLabel}
      style={
        {
          "--cascader-column-width": toCss(columnWidth),
          // Only ever set from an EXPLICIT cap. The default lives in the
          // fallback slot of the `min()` on the panel, so an unset variable
          // means "24rem or whatever the viewport leaves", not "no height".
          // The old `?? 280` here is exactly the pixel default this pass
          // removed: it ignored a short viewport and wasted a tall one.
          ...(height != null
            ? { "--cascader-max-height": toCss(height) }
            : null),
        } as React.CSSProperties
      }
      className={cn(
        // `max-h-full` alongside `min-h-0`: the trail is the shrinking child of
        // the panel, and the columns inside it size against this box.
        "flex max-h-full min-h-0 items-stretch overflow-x-auto overscroll-x-contain",
        CASCADER_LIST_PAD_CLASS,
        className
      )}
      {...props}
    >
      {columns.map((column) =>
        children ? (
          <React.Fragment key={column.depth}>{children(column)}</React.Fragment>
        ) : (
          <CascaderColumnPanel key={column.depth} column={column} />
        )
      )}
    </div>
  )
}

/**
 * One column.
 *
 * `columnWidth` is the width of the LIST, not of the box: every column but the
 * first draws a 1px divider on its inline start, and with `border-box` sizing
 * that divider came out of the rows rather than out of the gap. The second
 * column's rows were a pixel narrower than the first's and every column after
 * it repeated the error, which is exactly the kind of drift that reads as "the
 * rows don't fill this one". Widening the bordered columns by the border keeps
 * every column's CONTENT box at `columnWidth`.
 *
 * The column no longer scrolls itself. It is the BOUND - the same
 * `min(--available-height, cap)` expression the single list uses, so a Miller
 * trail opened low on the page shrinks with the window instead of running off
 * it - and a `ScrollArea` inside it owns the scrolling. That is what put a real
 * thumb on every column, which matters more here than anywhere else in the
 * primitive: three or four side-by-side panes with no scrollbars gave no hint
 * that any of them had more rows below the fold.
 */
const PANEL_CLASS = `flex w-(--cascader-column-width) shrink-0 flex-col overscroll-contain not-first:w-[calc(var(--cascader-column-width)_+_1px)] not-first:border-border/60 not-first:border-s ${CASCADER_LIST_HEIGHT_CLASS}`

export interface CascaderColumnPanelProps {
  column: CascaderColumn
  /**
   * Replaces the panel's rows. The empty state still wins on an empty column,
   * so a replacement never has to reimplement it.
   */
  children?: React.ReactNode
  /**
   * Makes the panel the containing block for absolutely positioned rows. Set by
   * the windowed column; there is no reason to set it by hand.
   */
  virtualized?: boolean
}

function CascaderColumnPanel({
  column,
  children,
  virtualized,
}: CascaderColumnPanelProps) {
  const {
    labels,
    baseId,
    isBranch,
    isSelectable,
    isSelected,
    isIndeterminate,
    retryLevel,
  } = useCascaderActions()
  const { loadStates } = useCascaderState()

  // Each column loads on its own, which is the whole reason the loader is keyed
  // per level rather than carrying one global flag: opening a three-level trail
  // fires three requests that land in any order.
  const columnKey = column.parent?.value ?? CASCADER_ROOT_KEY
  const loadState = loadStates.get(columnKey)

  let emptyBody: React.ReactNode = labels.empty
  if (loadState?.error) {
    emptyBody = (
      <>
        {labels.error}{" "}
        <button
          type="button"
          data-slot="cascader-retry"
          onClick={() => retryLevel(columnKey)}
          className="text-foreground hover:bg-accent focus-visible:ring-ring/50 rounded-md px-1 font-medium outline-hidden transition-colors focus-visible:ring-2"
        >
          {labels.retry}
        </button>
      </>
    )
  } else if (loadState?.loading) {
    emptyBody = (
      <span className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Loading02Icon} strokeWidth={2} className="size-3.5 animate-spin" aria-hidden />
        {labels.loading}
      </span>
    )
  }

  const rows =
    column.items.length === 0 ? (
      <p
        data-slot="cascader-column-empty"
        data-state={
          loadState?.error ? "error" : loadState?.loading ? "loading" : "empty"
        }
        className="text-muted-foreground px-2 py-1.5 text-sm"
      >
        {emptyBody}
      </p>
    ) : (
      (children ??
      column.items.map((node, i) => {
        const open = node.value === column.activeValue
        return (
          <CascaderItem
            key={node.value}
            node={node}
            // Only the deepest column is Base UI's listbox; the trail behind is
            // navigable by pointer and reflects state, but does not compete for
            // `aria-activedescendant`.
            as={column.active ? "option" : "button"}
            depth={column.depth}
            // Answered here rather than left to the row, for the same reason
            // `CascaderItems` answers them: the trail rows are memoised too.
            branch={isBranch(node)}
            selectable={isSelectable(node)}
            selected={isSelected(node)}
            indeterminate={isIndeterminate(node)}
            {...getCascaderMoreProps(node, loadStates)}
            data-open={open || undefined}
            className={open ? "bg-accent/60 text-accent-foreground" : undefined}
            // Set metadata belongs to option rows only. A trail row is a
            // `role="button"`, which allows neither.
            {...(column.active
              ? {
                  "aria-setsize": column.items.length,
                  "aria-posinset": i + 1,
                }
              : null)}
            // The one trail row that IS open owns the column to its right.
            {...(!column.active && open
              ? {
                  "aria-expanded": true,
                  "aria-controls": `${baseId}-column-${column.depth + 1}`,
                }
              : null)}
          />
        )
      }))
    )

  const shared = {
    "data-slot": "cascader-column",
    "data-active": column.active || undefined,
    "data-depth": column.depth,
    // Every panel is addressable, so the trail row that opened it can point
    // `aria-controls` here, and every panel is named - the root column had no
    // parent to name it and so had no name at all.
    id: `${baseId}-column-${column.depth}`,
    "aria-label": column.parent?.label ?? labels.rootLevel,
    // Conditional spread, never an explicit `undefined`: the active column is a
    // Base UI element, and its `mergeProps` iterates own keys.
    ...(virtualized ? { "data-virtualized": true } : null),
  }

  // A windowed panel positions its rows absolutely, so the ROWS' box has to be
  // their containing block. Deliberately not the scrollport: the rows' box is
  // the one carrying the padding the windowed geometry is measured against, and
  // splitting the two would offset every row by that padding.
  const rowsClass = cn(CASCADER_ROWS_CLASS, virtualized && "relative")

  // The active column IS the Combobox list. Base UI collects its options
  // through the CompositeList that `Combobox.List` renders, so rows outside it
  // are invisible to arrow-key navigation and to `aria-activedescendant`.
  const body = column.active ? (
    <ComboboxPrimitive.List {...shared} className={rowsClass}>
      {rows}
    </ComboboxPrimitive.List>
  ) : (
    // A named `group`, not a bare div: the trail is still structure worth
    // exposing, but it is not a second listbox competing with the active
    // column.
    <div {...shared} role="group" className={rowsClass}>
      {rows}
    </div>
  )

  return (
    <div
      data-slot="cascader-column-bounds"
      // Repeated from `shared` on purpose: this is the box a consumer sees in
      // the trail - it owns the width, the divider and the height - so a
      // per-column style hook has to reach it, and `:first-child` on the
      // semantic element no longer means "first column".
      data-active={column.active || undefined}
      data-depth={column.depth}
      className={PANEL_CLASS}
    >
      <ScrollArea className={CASCADER_SCROLL_CLASS}>{body}</ScrollArea>
    </div>
  )
}

export { CascaderColumnPanel, CascaderColumns }