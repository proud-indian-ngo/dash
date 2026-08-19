// @ts-nocheck
"use client"

import * as React from "react"
import {
  useCascaderActions,
  useCascaderState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import { resolveCascaderSearchLabel } from "@pi-dash/design-system/components/reui/cascader/cascader-i18n"
import {
  collapseCascaderPath,
  getCascaderFooterStops,
  getCascaderPath,
  isCascaderRtl,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type {
  CascaderCollapse,
  CascaderNode,
  CascaderValueDisplay,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { useDirection } from "@base-ui/react/direction-provider"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@pi-dash/design-system/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons"

/* -------------------------------------------------------------------------- */
/*                                  Separator                                 */
/* -------------------------------------------------------------------------- */

function PathChevron() {
  return (
    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3 shrink-0 opacity-50 rtl:-scale-x-100" />
  )
}

/* -------------------------------------------------------------------------- */
/*                                     Nav                                    */
/* -------------------------------------------------------------------------- */

export type CascaderNavProps = useRender.ComponentProps<"div">

/**
 * Header holding the back control and the search input.
 *
 * Carries the separator that shadcn's command surface puts under its input, so
 * the search row reads as a header rather than as the first list row.
 *
 * The breadcrumb is NOT part of it. It belongs to the list below the separator:
 * it describes where the rows come from, not what the field searches, and
 * inside the header it read as a second line of chrome above a border that was
 * already doing that job.
 */
function CascaderNav({ className, ...props }: CascaderNavProps) {
  const defaultProps = {
    "data-slot": "cascader-nav",
    className: cn(
      // `py-1` rather than `py-1.5`: the row inside already sets its own
      // per-style height, so equal padding on all four edges made the header
      // read taller than it is wide. 6px beside the field, 4px above and
      // below it.
      "border-border/60 flex shrink-0 flex-col gap-1 border-b px-1.5 py-1",
      className
    ),
  }

  return useRender({
    defaultTagName: "div",
    render: props.render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

/* -------------------------------------------------------------------------- */
/*                                    Back                                    */
/* -------------------------------------------------------------------------- */

export interface CascaderBackProps extends Omit<
  useRender.ComponentProps<"button">,
  "children"
> {
  children?: React.ReactNode
}

/**
 * Pops one level. Renders nothing at the root so the header does not reserve
 * dead space in the common shallow case.
 */
function CascaderBack({ className, children, ...props }: CascaderBackProps) {
  const { popLevel, labels, mode } = useCascaderActions()
  const { path } = useCascaderState()

  // The visibility check happens after `useRender`, never before it. Returning
  // early here would change the hook count between the root level and any
  // deeper one, which React reports as a hook-order violation on the first
  // drill-in.
  const hidden = mode !== "drill" || path.length === 0

  const defaultProps = {
    "data-slot": "cascader-back",
    type: "button" as const,
    "aria-label": labels.back,
    onClick: () => popLevel(),
    className: cn(
      "text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 flex shrink-0 items-center justify-center rounded-md outline-hidden transition-colors focus-visible:ring-2",
      // Kept a notch under the row height so it reads as an affordance rather
      // than a second field, and scaled per style so that ratio holds.
      "size-6",
      className
    ),
    children: children ?? (
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4 rtl:-scale-x-100" />
    ),
  }

  const element = useRender({
    defaultTagName: "button",
    render: props.render,
    props: mergeProps<"button">(defaultProps, props),
  })

  return hidden ? null : element
}

/* -------------------------------------------------------------------------- */
/*                                 Breadcrumb                                 */
/* -------------------------------------------------------------------------- */

export interface CascaderBreadcrumbProps extends Omit<
  useRender.ComponentProps<"nav">,
  "children"
> {
  /** Maximum visible node segments before the middle collapses. */
  maxSegments?: number
  collapse?: CascaderCollapse
  /** Clicking a segment navigates back to that level. Defaults to true. */
  interactive?: boolean
}

/**
 * Compact trail of the current level AND its ancestors. Uses the same
 * collapsing helper as `CascaderValue`, so the panel and the trigger can never
 * disagree about how a deep path reads.
 *
 * The current level IS the last crumb. It was dropped for one release, on the
 * argument that the search placeholder ("Search Company...") already named it -
 * but a trail that stops one short of where you are stops being a position
 * indicator and becomes a list of places you are not. Seen live, the missing
 * crumb read as a rendering bug: one drill in showed nothing at all, and two
 * showed only the grandparent. So the trail now runs `Person > Company` while
 * Company's children are listed, and `Company` after a single drill.
 *
 * The last crumb is the ONE segment that is not a button. It marks the level on
 * screen with `aria-current="page"`, the standard breadcrumb contract: every
 * crumb that goes somewhere is pressable, and the one that would go nowhere
 * says so instead of pretending.
 *
 * `CascaderValue` renders the same full path. It is naming a selection rather
 * than a level, so there the leaf is the whole point.
 */
function CascaderBreadcrumb({
  className,
  maxSegments = 3,
  collapse = "middle",
  interactive = true,
  ...props
}: CascaderBreadcrumbProps) {
  const { goToDepth, mode, labels } = useCascaderActions()
  const { path, index } = useCascaderState()

  // The WHOLE path, current level included. An entry the index cannot resolve
  // drops out on its own rather than rendering a crumb with no label.
  const nodes = path
    .map((value) => index.byValue.get(value))
    .filter(Boolean) as CascaderNode[]
  const segments = collapseCascaderPath(nodes, { maxSegments, collapse })
  // Which segment names the level on screen. `collapseCascaderPath` never
  // collapses the last node away, so this is always the final segment - but it
  // is derived rather than assumed, so a `collapse` mode that changes that
  // cannot silently mark an ancestor as the current page.
  const currentValue = nodes.length ? nodes[nodes.length - 1].value : null

  // See `CascaderBack`: the hide check must not short-circuit past `useRender`.
  const hidden = mode !== "drill" || nodes.length === 0

  const goTo = (node: CascaderNode) => {
    const depth = path.indexOf(node.value)
    if (depth < 0) return
    // Through `goToDepth`, not a bare `setPath`: the depth jump is what
    // reports `reason: "breadcrumb"` to `onPathChange`, clears the query and
    // drops any pending navigation - a crumb press must not read as an
    // external write.
    goToDepth(depth + 1)
  }

  const defaultProps = {
    "data-slot": "cascader-breadcrumb",
    // From `labels`, like every other string the primitive renders. This one
    // was the last hardcoded English left in the panel.
    "aria-label": labels.breadcrumbLabel,
    className: cn(
      "text-muted-foreground flex min-w-0 shrink-0 items-center gap-0.5 pt-1.5 pb-0.5 text-xs",
      // It sits with the list now, so it lines up with the ROWS rather than
      // with the header: each style's list padding plus that style's own row
      // inset. `p-1` + `pl-2` in vega, mira and rhea, `p-1` + `pl-1.5` in nova,
      // `p-1` + `pl-3` in maia, none + `pl-2` in lyra, `p-1.5` + `pl-3` in luma
      // and sera. Keep them in step with `registry/styles/style-*.css`.
      "px-2",
      className
    ),
    children: segments.map((segment, i) => (
      <React.Fragment
        key={segment.type === "node" ? segment.node.value : `gap-${i}`}
      >
        {i > 0 ? <PathChevron /> : null}
        {segment.type === "ellipsis" ? (
          <span
            data-slot="cascader-breadcrumb-ellipsis"
            title={segment.hidden
              .map((n) => n.label)
              .join(` ${labels.pathSeparator} `)}
            className="shrink-0"
          >
            &hellip;
          </span>
        ) : interactive && segment.node.value !== currentValue ? (
          <button
            type="button"
            data-slot="cascader-breadcrumb-item"
            onClick={() => goTo(segment.node)}
            className="hover:text-foreground focus-visible:ring-ring/50 max-w-32 truncate rounded-sm outline-hidden transition-colors focus-visible:ring-2"
          >
            {segment.node.label}
          </button>
        ) : (
          <span
            data-slot="cascader-breadcrumb-item"
            // The level on screen. A span rather than a button because it goes
            // nowhere, and `aria-current="page"` so a screen reader is told
            // which crumb that is instead of hearing a flat list.
            {...(segment.node.value === currentValue
              ? { "aria-current": "page" as const }
              : null)}
            className={cn(
              "max-w-32 truncate",
              segment.node.value === currentValue &&
                "text-foreground font-medium"
            )}
          >
            {segment.node.label}
          </span>
        )}
      </React.Fragment>
    )),
  }

  const element = useRender({
    defaultTagName: "nav",
    render: props.render,
    props: mergeProps<"nav">(defaultProps, props),
  })

  return hidden ? null : element
}

/* -------------------------------------------------------------------------- */
/*                                    Input                                   */
/* -------------------------------------------------------------------------- */

export interface CascaderInputProps extends ComboboxPrimitive.Input.Props {
  /** Renders the back control inline, before the field. Defaults to true. */
  showBack?: boolean
}

/** Base UI hands its input handlers an event carrying the veto hook. */
type CascaderInputKeyEvent = Parameters<
  NonNullable<ComboboxPrimitive.Input.Props["onKeyDown"]>
>[0]

/**
 * Search field.
 *
 * This must render inside the positioner. Base UI only skips refilling the
 * input from the committed selection when the input lives inside the popup, and
 * that refill would otherwise fight every level swap.
 *
 * Backspace on an empty query pops a level, which makes the keyboard path out
 * of a level symmetric with typing into it.
 */
function CascaderInput({
  className,
  showBack = true,
  placeholder,
  onKeyDown,
  "aria-describedby": ariaDescribedBy,
  ...props
}: CascaderInputProps) {
  const {
    labels,
    popLevel,
    mode,
    getHighlighted,
    isBranch,
    navigate,
    index,
    toggleExpanded,
    inline,
    invalid,
    baseId,
  } = useCascaderActions()
  // Subscribed here rather than read in the handler: it is a context, and a
  // context can only be read from a render.
  const direction = useDirection()
  const { currentParent, query, path, renderedItems, treeRows } =
    useCascaderState()

  const resolvedPlaceholder =
    placeholder ?? resolveCascaderSearchLabel(labels, currentParent?.label)

  /**
   * Whether a back control is actually on screen, which is not the same
   * question as `showBack`: `CascaderBack` renders nothing at the root or
   * outside drill mode, and the field keeps its own leading padding there. When
   * the button IS there, that padding stacks with the row's `gap-1` and opens a
   * 10px hole between the two.
   */
  const backVisible = showBack && mode === "drill" && path.length > 0

  const hintId = `${baseId}-hint`
  // The list Base UI would have named itself, had it named anything while
  // inline. Columns mode moves the real listbox to the deepest panel.
  const listId = `${baseId}-column-${mode === "columns" ? path.length : 0}`

  /**
   * The direction the HINT is worded for. The keydown handler re-reads
   * `isCascaderRtl` per keystroke, but the hint is text on screen and has to
   * be right BEFORE the first key is pressed, so the same check runs once
   * against the mounted DOM. Measured on the hint span itself: it sits beside
   * the field, so every `dir` attribute and computed direction that governs
   * the field governs it too, and it needs no second ref merged into Base
   * UI's input.
   *
   * SSR renders the "ltr" default and corrects on hydration: two of the three
   * direction sources are the mounted DOM, which the server does not have.
   * `direction` is the only reactive dependency - the `dir` attribute and the
   * stylesheet are declarations, not state, so there is nothing to resubscribe
   * to.
   */
  const hintRef = React.useRef<HTMLSpanElement>(null)
  const [hintDir, setHintDir] = React.useState<"ltr" | "rtl">("ltr")
  React.useLayoutEffect(() => {
    const hint = hintRef.current
    if (!hint) return
    setHintDir(isCascaderRtl(hint, direction) ? "rtl" : "ltr")
  }, [direction])

  /**
   * Moves the highlight to `targetIndex` in `treeRows`.
   *
   * Base UI exposes no imperative highlight setter - `actionsRef` is
   * `{ unmount }` and nothing else - so a move is expressed as the arrow
   * presses that would produce it. That is sound because `useListNavigation`
   * mutates its index ref and fires `onItemHighlighted` SYNCHRONOUSLY inside
   * each keydown, so the loop can read the result of one press before issuing
   * the next rather than waiting on a render.
   *
   * Every press has to close the gap. A row Base UI skips (disabled) or a wrap
   * at either end ends the move instead of spinning the loop.
   */
  const moveHighlightTo = (field: HTMLInputElement, targetIndex: number) => {
    const rowIndex = () => {
      const highlighted = getHighlighted()
      if (!highlighted) return -1
      return treeRows.findIndex((row) => row.node.value === highlighted.value)
    }

    let current = rowIndex()
    for (let step = 0; step < treeRows.length; step += 1) {
      if (current === -1 || current === targetIndex) return
      const key = current > targetIndex ? "ArrowUp" : "ArrowDown"
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      )
      const next = rowIndex()
      const progressed =
        key === "ArrowUp"
          ? next < current && next >= targetIndex
          : next > current && next <= targetIndex
      if (next === -1 || !progressed) return
      current = next
    }
  }

  /**
   * The tree pattern's two level keys. Base UI leaves both alone: list
   * navigation is vertical-only, and the chip handler no-ops without
   * `Combobox.Chips`.
   *
   * `forwardKey` and `backKey` are supplied rather than hardcoded, because in
   * RTL they swap: the APG tree pattern is defined in terms of "toward the
   * children", not in terms of a physical arrow.
   */
  const handleTreeKeyDown = (
    event: CascaderInputKeyEvent,
    field: HTMLInputElement,
    caretAtStart: boolean,
    caretAtEnd: boolean,
    forwardKey: "ArrowLeft" | "ArrowRight",
    backKey: "ArrowLeft" | "ArrowRight"
  ) => {
    const forward = event.key === forwardKey
    if (!forward && event.key !== backKey) return
    if (forward ? !caretAtEnd : !caretAtStart) return

    const highlighted = getHighlighted()
    if (!highlighted) return
    const rowIndex = treeRows.findIndex(
      (row) => row.node.value === highlighted.value
    )
    if (rowIndex < 0) return
    const row = treeRows[rowIndex]

    if (forward) {
      if (!row.branch) return
      event.preventDefault()
      if (!row.expanded) {
        // `navigate`, not `toggleExpanded`: in tree mode it is the form that
        // waits for an unloaded branch's children before opening it, so the
        // keyboard path in behaves exactly as the expander does.
        navigate(row.node)
        return
      }
      // `flattenCascaderTree` emits children immediately after their parent, so
      // the first child of an expanded branch is the next visible row. The
      // depth check covers an async branch that is expanded but still empty.
      const child = treeRows[rowIndex + 1]
      if (child && child.depth === row.depth + 1) {
        moveHighlightTo(field, rowIndex + 1)
      }
      return
    }

    if (row.branch && row.expanded) {
      event.preventDefault()
      toggleExpanded(row.node.value)
      return
    }

    const parentValue = index.parentOf.get(row.node.value)
    if (!parentValue) return
    const parentIndex = treeRows.findIndex(
      (entry) => entry.node.value === parentValue
    )
    if (parentIndex < 0) return
    event.preventDefault()
    moveHighlightTo(field, parentIndex)
  }

  const handleKeyDown = (event: CascaderInputKeyEvent) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    const field = event.currentTarget
    const caretAtStart = field.selectionStart === 0 && field.selectionEnd === 0
    const caretAtEnd =
      field.selectionStart === query.length &&
      field.selectionEnd === query.length

    /**
     * ArrowDown at the END of the list hands real focus to the pinned footer.
     *
     * This is what makes the footer part of the cascader's own keyboard model
     * rather than a Tab-only island: arrows are how a combobox is navigated,
     * and before this the last row wrapped straight back to the first, so the
     * commands under the list were never met by the key everyone actually
     * presses. Tab still works and still skips the scroll area; this is the
     * primary path, that is the secondary one.
     *
     * An EMPTY list hands off immediately - a query that matches nothing is
     * exactly the moment "Create ..." is the thing on screen worth reaching.
     * The footer's own handler owns the way back up (ArrowUp on its first
     * command returns here, with the highlight untouched).
     *
     * Counted from state, not the DOM, so a windowed list answers correctly
     * when the last row is not mounted.
     */
    if (event.key === "ArrowDown" && !event.altKey) {
      const rowCount = mode === "tree" ? treeRows.length : renderedItems.length
      const lastValue =
        mode === "tree"
          ? treeRows[rowCount - 1]?.node.value
          : renderedItems[rowCount - 1]?.value
      const highlighted = getHighlighted()
      const atEnd =
        rowCount === 0 ||
        (highlighted != null && highlighted.value === lastValue)
      if (atEnd) {
        const panel = field.closest<HTMLElement>('[data-slot="cascader-panel"]')
        const stop = panel ? getCascaderFooterStops(panel)[0] : undefined
        if (stop) {
          event.preventDefault()
          // Base UI's handler is deliberately NOT vetoed. Its wrap is two
          // presses - the first CLEARS the highlight, the second lands on the
          // first row - and this keystroke is its first press, so the row the
          // arrows just left loses `data-highlighted` in the same keystroke
          // focus moves to the footer. Vetoing it shipped two active rows at
          // once: the stale-highlighted last row and the focused command. It
          // also completes the ring for free: back in the field the highlight
          // is empty, so ArrowDown continues at the FIRST row and ArrowUp
          // resumes at the LAST, both from Base UI's own empty-highlight
          // behaviour rather than anything imperative.
          stop.focus()
          return
        }
      }
    }

    /**
     * The level keys are LOGICAL, not physical.
     *
     * "Deeper" is the direction the text runs, so in RTL it is ArrowLeft that
     * opens a branch and ArrowRight that goes back - the mirror image of LTR,
     * and what every other RTL-aware list navigation does. The caret-edge
     * guards do not mirror with them: `selectionStart === 0` is the logical
     * start of the value in both directions, and the back key is the one that
     * moves toward it.
     */
    const rtl = isCascaderRtl(field, direction)
    const forwardKey = rtl ? "ArrowLeft" : "ArrowRight"
    const backKey = rtl ? "ArrowRight" : "ArrowLeft"

    // Arrow keys must not steal caret movement from the text field, so they
    // only navigate levels when the caret is already at the relevant edge.
    if (mode === "tree") {
      handleTreeKeyDown(
        event,
        field,
        caretAtStart,
        caretAtEnd,
        forwardKey,
        backKey
      )
      return
    }

    if (event.key === forwardKey && caretAtEnd) {
      const highlighted = getHighlighted()
      if (highlighted && isBranch(highlighted)) {
        event.preventDefault()
        navigate(highlighted)
        return
      }
    }

    if (
      (event.key === backKey && caretAtStart) ||
      (event.key === "Backspace" && query.length === 0)
    ) {
      if (path.length > 0) {
        event.preventDefault()
        popLevel()
      }
    }
  }

  return (
    <div
      data-slot="cascader-input-row"
      className={cn(
        "flex shrink-0 items-center gap-1",
        // Each style sets its own height for the combobox search field in
        // `.cn-combobox-content` (`*:data-[slot=input-group]:h-*`). That rule
        // only reaches a DIRECT child of the popup, and this row is nested
        // inside the panel, so the ladder is mirrored here instead of
        // hardcoding one height for all eight styles.
        "h-8"
      )}
    >
      {showBack ? <CascaderBack /> : null}
      <ComboboxPrimitive.Input
        data-slot="cascader-input"
        placeholder={resolvedPlaceholder}
        onKeyDown={handleKeyDown}
        // The level keys are the whole point of a cascader and nothing on
        // screen says they exist.
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(" ")}
        // Conditional spreads only: an explicit `undefined` would delete Base
        // UI's own value rather than leave it in place.
        {...(mode === "tree" ? { "aria-haspopup": "tree" as const } : null)}
        // Base UI omits BOTH `aria-expanded` and `aria-controls` while inline,
        // which leaves a `role="combobox"` with neither of its required
        // attributes. An embedded panel is permanently expanded, so both are
        // supplied here.
        {...(inline
          ? { "aria-expanded": true, "aria-controls": listId }
          : null)}
        // The embedded (`inline`) case has no trigger to carry the invalid
        // state, so the field itself does. Conditional spread for the usual
        // reason: `mergeProps` iterates own keys.
        {...(invalid ? { "aria-invalid": true, "data-invalid": "" } : null)}
        className={cn(
          "placeholder:text-muted-foreground h-full w-full min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          backVisible && "ps-0",
          className
        )}
        {...props}
      />
      <span id={hintId} ref={hintRef} className="sr-only">
        {/* `hintDir`, not `direction`: the context alone misses an RTL app
            that declares itself with a `dir` attribute instead of mounting
            `DirectionProvider`, and the handler these words describe checks
            all three sources. */}
        {labels.keyboardHint(mode, hintDir)}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Value                                   */
/* -------------------------------------------------------------------------- */

export interface CascaderValueProps extends Omit<
  useRender.ComponentProps<"span">,
  "children"
> {
  /** `path` shows the full trail, `leaf` only the node, `count` only a total. */
  display?: CascaderValueDisplay
  maxSegments?: number
  collapse?: CascaderCollapse
  separator?: React.ReactNode
  /** Renders the selected node's icon before the trail. */
  showIcon?: boolean
  placeholder?: React.ReactNode
  /** Replaces the whole rendering. Receives the resolved selection and path. */
  children?: (selected: CascaderNode[], path: CascaderNode[]) => React.ReactNode
}

/**
 * Trigger display.
 *
 * The default is the collapsed selection path (`Person > ... > Record ID`)
 * rather than a bare leaf label, because in a nested picker the leaf alone is
 * frequently ambiguous.
 */
function CascaderValue({
  className,
  display = "path",
  maxSegments = 3,
  collapse = "middle",
  separator,
  showIcon = true,
  placeholder,
  children,
  ...props
}: CascaderValueProps) {
  const { labels, multiple, resolveNode } = useCascaderActions()
  const { index, selectedValues } = useCascaderState()

  // `resolveNode`, not `index.byValue`: a selection whose node is not in
  // `items` - async children not fetched yet, or an item removed after being
  // chosen - must still render a label rather than an empty trigger.
  const selected = selectedValues.map(resolveNode)

  const resolvedPath =
    selectedValues.length === 1 ? getCascaderPath(index, selectedValues[0]) : []
  // An unresolvable value has no ancestor chain; fall back to the node itself
  // so `display="path"` degrades to a leaf instead of rendering nothing.
  const path =
    resolvedPath.length > 0
      ? resolvedPath
      : selected.length === 1
        ? selected
        : []

  let content: React.ReactNode

  if (children) {
    content = children(selected, path)
  } else if (selectedValues.length === 0) {
    content = (
      <span className="text-muted-foreground truncate">{placeholder}</span>
    )
  } else if (display === "count" || (multiple && selectedValues.length > 1)) {
    content = labels.selectedCount(selectedValues.length)
  } else {
    const leaf = path[path.length - 1] ?? selected[0]
    const segments =
      display === "leaf"
        ? [{ type: "node" as const, node: leaf }]
        : collapseCascaderPath(path, { maxSegments, collapse })

    content = (
      <>
        {showIcon && leaf?.icon ? (
          <span
            data-slot="cascader-value-icon"
            className="text-muted-foreground flex shrink-0 items-center"
          >
            {leaf.icon}
          </span>
        ) : null}
        {segments.map((segment, i) => (
          <React.Fragment
            key={segment.type === "node" ? segment.node.value : `gap-${i}`}
          >
            {i > 0 ? (separator ?? <PathChevron />) : null}
            {segment.type === "ellipsis" ? (
              <span
                data-slot="cascader-value-ellipsis"
                title={segment.hidden
                  .map((n) => n.label)
                  .join(` ${labels.pathSeparator} `)}
                className="text-muted-foreground shrink-0"
              >
                &hellip;
              </span>
            ) : (
              <span
                className={cn(
                  "truncate",
                  // Only the leaf carries full emphasis; ancestors are context.
                  i < segments.length - 1 && "text-muted-foreground"
                )}
              >
                {segment.node?.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </>
    )
  }

  const defaultProps = {
    "data-slot": "cascader-value",
    className: cn("flex min-w-0 items-center gap-1 truncate", className),
    children: content,
  }

  return useRender({
    defaultTagName: "span",
    render: props.render,
    props: mergeProps<"span">(defaultProps, props),
  })
}

export {
  CascaderNav,
  CascaderBack,
  CascaderBreadcrumb,
  CascaderInput,
  CascaderValue,
}