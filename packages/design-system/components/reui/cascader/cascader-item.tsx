// @ts-nocheck
import * as React from "react"
import {
  useCascaderActions,
  useCascaderRender,
  useCascaderState,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import {
  getCascaderCount,
  getCascaderMoreParent,
  getCascaderPath,
  isCascaderMoreNode,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type {
  CascaderLoadState,
  CascaderNode,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Spinner } from "@pi-dash/design-system/components/ui/spinner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading02Icon, MinusSignIcon, Tick02Icon, RefreshIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

/** Base UI extends its synthetic events with a handler-veto escape hatch. */
type VetoableEvent = { preventBaseUIHandler?: () => void }

/**
 * A row press.
 *
 * Base UI hands option rows an event carrying the veto hook, but an
 * `as="button"` row lives outside Base UI's listbox and gets a plain React
 * event, so the hook is optional. Widening the element to `HTMLElement` lets
 * the same handler serve the option `<div>`, the button row and the trailing
 * chevron `<span>` without a cast at any of them.
 */
export type CascaderRowEvent = React.MouseEvent<HTMLElement> & VetoableEvent

/**
 * Each style's own inline inset, republished as a variable the row can do
 * arithmetic with.
 *
 * `.cn-combobox-item` sets it as a PHYSICAL `pl-*` and pairs it with a flat,
 * physical `pr-8` gutter for the absolutely positioned check, in all eight
 * style sheets. Those files are shared with the shadcn combobox and are not
 * ours to rewrite, so the numbers are mirrored here instead: `pl-1.5` in nova,
 * `pl-2` in vega, lyra and rhea, `px-2` in mira, `pl-3` in maia, luma and sera.
 * Keep them in step with `registry/styles/style-*.css`.
 *
 * Everything inline below is expressed against this ONE value in LOGICAL
 * properties, which is what makes a row's two insets equal by construction, in
 * every style, and what replaced the physical LTR/RTL padding mirror this file
 * used to carry. It is a variable rather than eight pairs of utilities because
 * the check indicator is a child element and has to land on the same number.
 */
const ROW_INSET_CLASS =
  "[--cascader-row-inset:8px]"

/**
 * A row with no check to make room for: the trailing affordance ends exactly
 * where the label starts, on the other edge.
 *
 * `!` throughout: a consumer installing these files does not necessarily import
 * the style sheets into `layer(base)`, and outside a layer the component class
 * would win on document order.
 */
const ROW_FLUSH_CLASS =
  "ps-[var(--cascader-row-inset,8px)]! pe-[var(--cascader-row-inset,8px)]!"

/**
 * The same start inset, plus room for the check: a 1rem indicator sitting one
 * inset in from the edge, cleared by one more inset before the text starts.
 *
 * That arithmetic is why the flat `pr-8` was wrong in five of the eight styles:
 * 4px of slack in nova, 8px short in maia, luma and sera, and in mira a gutter
 * that does not exist at all, which is why mira's check overlapped its own
 * label. It was right, by coincidence, in vega, lyra and rhea - the three whose
 * own start padding is 8px.
 */
const ROW_GUTTER_CLASS =
  "ps-[var(--cascader-row-inset,8px)]! pe-[calc(var(--cascader-row-inset,8px)*2_+_16px)]!"

/**
 * The check's own inset, matched to the row's.
 *
 * `.cn-combobox-item-indicator` pins it with a PHYSICAL `right-2` in all eight
 * sheets: it neither mirrors under `dir="rtl"` nor tracks the style's own start
 * padding. `end-*` is the logical form of the same thing. `right-auto` has to
 * come with it because an absolutely positioned box with a width, a `left` and
 * a `right` is over-constrained, and RTL is the direction in which CSS resolves
 * that by dropping `left`.
 */
const INDICATOR_INSET_CLASS =
  "end-[var(--cascader-row-inset,8px)]! rtl:right-auto!"

const ROW_CLASS = `cn-combobox-item relative flex w-full cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${ROW_INSET_CLASS}`

/**
 * The eight-style inset table on its own, for anything that is row-shaped but
 * is not a row: the footer's group headings.
 *
 * Exported rather than restated because there is exactly one correct set of
 * numbers per style, and a second copy of them is a second thing to keep in
 * step with `registry/styles/style-*.css`.
 */
const CASCADER_ACTION_INSET_CLASS = `${ROW_INSET_CLASS} ${ROW_FLUSH_CLASS}`

/**
 * A footer COMMAND's look: a combobox row, minus everything that makes a row a
 * row.
 *
 * `.cn-combobox-item` gives it the height, padding, radius and text size the
 * list already uses in all eight styles, so the footer cannot drift from the
 * rows above it. What it does not give is hover or keyboard-focus painting,
 * because a real combobox item is painted from `data-highlighted` - which Base
 * UI sets, and which never arrives on a plain button. Both are stated here,
 * and the keyboard state deliberately paints the SAME way the list does:
 * `focus-visible:bg-accent`, no ring. A command reached by ArrowDown from the
 * list must read as the same kind of row the arrows were just walking, and a
 * ring where every row above used a fill made the footer look like a different
 * widget bolted on. `focus-visible` rather than `focus`, so a pointer press
 * does not leave a command painted as if it were still hovered.
 *
 * The disabled treatment keys off `aria-disabled`, NOT `:disabled`, and that is
 * not a style preference. A footer command expresses its disabled state with
 * `aria-disabled` so that it stays FOCUSABLE - a natively disabled button is
 * not a tab stop, and a footer whose only row is disabled then has no tab stop
 * at all, which is a footer a keyboard user cannot even find. See
 * `CascaderAction` in `cascader-footer.tsx`.
 *
 * The check gutter is given back (`ROW_FLUSH_CLASS`): an action is never
 * selected, so reserving 16px for a mark that cannot appear would only push
 * its label away from the edge the rows above it end at.
 */
export const CASCADER_ACTION_CLASS = `${ROW_CLASS} ${ROW_FLUSH_CLASS} hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground cursor-pointer gap-2 transition-colors aria-disabled:pointer-events-none aria-disabled:opacity-50`

/**
 * The box around the pointer affordances that are NOT the row: the tree
 * expander, the drill chevron, and the empty slot a tree LEAF reserves so its
 * label lands on the same column as a sibling branch's.
 *
 * 20px around a 16px icon, with the 2px of slack on the outer side cancelled
 * by a negative margin at the call site - so the ICON lands exactly where a
 * bare `size-4` span put it, and the only thing this adds is a box that can be
 * painted. 20px rather than 24px because the tightest style's row is barely
 * taller than one line of `text-sm`, and a 24px child would set the row height
 * instead of fitting inside it.
 */
const AFFORDANCE_BOX_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded-sm"

/**
 * What makes an affordance read as pressable while the row under it is
 * already highlighted.
 *
 * It cannot be `hover:bg-accent`: the ROW's background is `bg-accent` under
 * the pointer, so an accent chip on an accent row is invisible - which is
 * exactly why the arrow read as inert. `bg-background` inverts against the row
 * in both themes and the shadow lifts it off.
 *
 * `text-foreground!` needs the `!` for the usual reason: `.cn-combobox-item`
 * carries `data-highlighted:**:text-accent-foreground`, a DESCENDANT selector
 * that repaints this icon the moment the row is highlighted.
 *
 * Applied only where the affordance does something the row does not. A
 * non-selectable branch drills from anywhere on the row, so lighting a chip up
 * inside it would advertise two presses where there is one.
 */
const AFFORDANCE_HOVER_CLASS =
  // `**:` alongside the plain pin, for the reason spelled out under
  // `CHECKBOX_MARK_CLASS`: the glyph's `currentColor` resolves against the
  // PATH's colour, and the row's descendant rule reaches the path.
  "transition-[background-color,box-shadow,color] hover:bg-background hover:text-foreground! hover:**:text-foreground! hover:shadow-xs"

/**
 * The selection MARK's colour, pinned so nothing can repaint it.
 *
 * Every one of the eight style sheets gives `.cn-combobox-item` a DESCENDANT
 * rule - `not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground`
 * - which repaints every icon inside a highlighted row. A check mark is STATE,
 * not decoration: it must read identically whether the pointer is over the row,
 * the keyboard highlight is on it, both, or neither, in light and in dark.
 *
 * Two constants, because the two marks sit on different grounds:
 *
 * - `CHECKBOX_MARK_CLASS` is for the tick and the dash INSIDE the box. That box
 *   is `bg-primary` in every state, so its mark has exactly one correct colour.
 *   Inheriting `text-primary-foreground` from the box is not enough - a
 *   declaration made directly on the icon by the descendant rule beats an
 *   inherited value, which is precisely the failure this guards.
 * - `INDICATOR_MARK_CLASS` is for the bare single-select check, which sits on
 *   the row's own background.
 *
 * ## Why each one pins the colour TWICE
 *
 * `text-*!` on the `<svg>` alone is not enough, and this took an embarrassing
 * number of attempts to see, because the svg measures CORRECT while the glyph
 * paints black.
 *
 * An icon set draws with `fill="currentColor"` (remix, phosphor) or
 * `stroke="currentColor"` (lucide, tabler), and either way that presentation
 * attribute is INHERITED by the `<path>` inside. `currentColor` in the path
 * resolves against the PATH's own computed `color` - not the svg's. The style
 * sheets' rule is `**:`, a descendant selector, so it reaches the path and sets
 * `color: var(--accent-foreground)` there. The svg stays white, the path turns
 * dark, and the mark disappears into a `bg-primary` box.
 *
 * So the pin has to land on the descendants as well. `**:text-*!` is what makes
 * `currentColor` resolve to the right colour wherever the glyph is actually
 * painted, for every icon set, whether it fills or strokes.
 *
 * Both halves are load-bearing, and `cascader-behavior.test.tsx` asserts both
 * are still on all three marks so a refactor cannot quietly drop either. A
 * consumer overriding these should override the token, not the importance.
 */
const CHECKBOX_MARK_CLASS =
  "text-primary-foreground! **:text-primary-foreground!"
const INDICATOR_MARK_CLASS = "text-foreground! **:text-foreground!"

/**
 * How long the pointer rests on a branch row before `expandTrigger="hover"`
 * drills into it. Long enough that a pointer crossing the column on its way
 * somewhere else opens nothing, short enough to read as immediate.
 */
const CASCADER_HOVER_EXPAND_DELAY = 150

export interface CascaderItemProps extends Omit<
  ComboboxPrimitive.Item.Props,
  "value" | "children" | "className" | "style" | "onClick" | "onMouseUp"
> {
  /**
   * Base UI also accepts a state callback for `className` and `style`. The row
   * merges both itself, so only the plain forms are accepted here - a callback
   * would have been dropped on the floor rather than applied.
   */
  className?: string
  style?: React.CSSProperties
  onClick?: (event: CascaderRowEvent) => void
  onMouseUp?: (event: CascaderRowEvent) => void
  node: CascaderNode
  /**
   * Explicit render index.
   *
   * Required while the cascader is virtualized, and DELIBERATELY IGNORED while
   * it is not: an index outside virtualized mode makes the row self-register
   * and take the composite list over, which breaks `aria-activedescendant`.
   * Pass it freely - the row decides whether it is safe to use.
   */
  index?: number
  /** Indentation depth. Drives `--cascader-indent` in tree mode. */
  depth?: number
  /** Renders the ancestor chain under the label, for deep-search results. */
  showPath?: boolean
  /**
   * `option` renders a real `Combobox.Item`. `button` renders a plain button
   * with identical markup, for rows outside Base UI's listbox - the ancestor
   * columns in columns mode, where only the deepest column is keyboard-owned.
   */
  as?: "option" | "button"
  /** Tree mode: this row is an expanded branch. */
  expanded?: boolean
  /** Indent each depth by this many pixels. Tree mode only. */
  indent?: number
  /**
   * Whether the node has children. Defaults to the cascader's own answer.
   *
   * `CascaderItems` and the columns trail pass all three of these because they
   * already hold the level and the selection, and passing them is what keeps a
   * memoised row from having to subscribe to anything that changes while the
   * user types. Omit them and the row falls back to the context, which is
   * exactly as correct, just less cheap.
   */
  branch?: boolean
  /** Whether the node may be committed. Defaults to the cascader's own answer. */
  selectable?: boolean
  /** Whether the node is currently selected. Defaults to the cascader's answer. */
  selected?: boolean
  /**
   * Whether the node has some but not all of its loaded subtree selected.
   * `cascade` only. Defaults to the cascader's own answer.
   */
  indeterminate?: boolean
  /**
   * Selected nodes below this one, at any depth. Drives the trailing count.
   *
   * Unlike the four above there is no reason to pass this one for performance:
   * the cascader answers it with a single map lookup into one memoised pass
   * over the selection. Pass it to say something different from the truth.
   */
  selectedCount?: number
  /**
   * Paging row only: a request for this level is in flight.
   *
   * Handed down as a prop for the same reason `branch` and `selected` are - the
   * row is memoised, and the load state lives on the keystroke-volatile state
   * context that a row must never subscribe to.
   */
  loading?: boolean
  /** Paging row only: this level's last request failed. */
  error?: boolean
  /**
   * Branch row only: this node's OWN children are being fetched.
   *
   * Swaps the row's trailing chevron (or, in tree mode, its expander) for a
   * spinner in the same box - no skeleton, no reflow, and the chevron returns
   * the moment the children render. Handed down as a prop for the same reason
   * `loading` is: the row is memoised and must not read the volatile state
   * context. `getCascaderMoreProps` resolves it from a level's load states.
   */
  childrenLoading?: boolean
  /**
   * Branch row only: the last attempt to fetch this node's OWN children failed.
   *
   * Turns the trailing chevron (or the tree expander) into a retry affordance
   * in the same box. The press path is unchanged - it goes through `navigate`,
   * which refires the failed level rather than moving - so a row that could not
   * open says so where the user pressed instead of taking them to an error
   * screen one level down.
   */
  childrenError?: boolean
  children?: React.ReactNode
}

/**
 * One row.
 *
 * Branch presses navigate instead of selecting. The veto happens here, on the
 * row, via `preventBaseUIHandler()` on both `onClick` (which also covers Enter,
 * because Base UI synthesizes a click) and `onMouseUp` (drag-select). The root
 * keeps a `details.cancel()` guard as a safety net for anything that slips past.
 */
const CascaderItem = React.memo(function CascaderItem({
  node,
  index,
  depth,
  showPath = false,
  as = "option",
  expanded,
  indent = 16,
  branch: branchProp,
  selectable: selectableProp,
  selected: selectedProp,
  indeterminate: indeterminateProp,
  selectedCount: selectedCountProp,
  loading,
  error,
  childrenLoading = false,
  childrenError = false,
  className,
  children,
  onClick,
  onMouseUp,
  style,
  ...props
}: CascaderItemProps) {
  // The ACTIONS context only. A row must never subscribe to the state context:
  // that one republishes on every keystroke, which would make the `React.memo`
  // wrapper around this component worthless.
  const {
    index: treeIndex,
    mode,
    labels,
    isBranch,
    isSelectable,
    isSelected,
    isIndeterminate,
    selectedDescendantCount,
    multiple,
    branchesSelectable,
    indicator: indicatorEnabled,
    expandTrigger = "click",
    navigate,
    navigateAt,
    toggleExpanded,
    commit,
    virtualized,
    loadMore,
    retryLevel,
  } = useCascaderActions()
  // Render props come from their own always-current context, never from the
  // memoised one, or an inline closure would go stale after the first render.
  const { renderItem, renderLabel } = useCascaderRender()

  const branch = branchProp ?? isBranch(node)
  const selectable = selectableProp ?? isSelectable(node)
  const selected = selectedProp ?? isSelected(node)
  // A selected node is never also partially selected: the two are the same
  // question answered at different granularities, and a row showing both would
  // be a dash inside a filled box.
  const indeterminate =
    !selected && (indeterminateProp ?? isIndeterminate(node))
  const count = branch ? getCascaderCount(treeIndex, node) : 0
  const nodeDepth = depth ?? treeIndex.depthOf.get(node.value) ?? 0

  /**
   * The trailing number says one of two things.
   *
   * How many children a branch has is the useful answer until something inside
   * it is selected; after that, how many of them are selected is the more
   * useful one, and it takes the slot rather than being crammed in beside the
   * total. The accent colour is what says the number changed meaning.
   *
   * O(1): the cascader walks up from each selection ONCE per selection change
   * and publishes the result as a map. A row must never walk its own subtree -
   * that is `rows x descendants`, paid again on every keystroke.
   */
  const selectedDescendants = branch
    ? (selectedCountProp ?? selectedDescendantCount(node))
    : 0
  /**
   * Only in `multiple` mode. With a single selection the trigger path, the
   * breadcrumb and the check on the leaf already say where it is, so replacing
   * a branch's real child total ("24") with a permanent "1" would trade a
   * useful number for one the user can already see three other ways.
   */
  const showsSelectedCount = multiple && selectedDescendants > 0
  const trailingCount = showsSelectedCount ? selectedDescendants : count
  /**
   * The count is shown whenever there is one, selected or not.
   *
   * It used to be suppressed on a selected selectable branch, on the theory
   * that one trailing slot should carry one meaning. That was the wrong trade:
   * "how many things are in here" and "is this one picked" are different facts
   * and a user checking a branch does not stop caring how big it is - the
   * number vanishing under the checkbox read as data loss.
   *
   * They do not have to share a slot any more. Since Wave 7 every row reserves
   * TWO trailing columns: the inline affordance box (count + chevron) and the
   * inline-end check gutter that `ROW_GUTTER_CLASS` clears. Tree mode goes
   * further and moves the checkbox to the head of the row (see
   * `leadingCheckbox`), which leaves the count alone on the trailing edge.
   */
  const showCount = trailingCount > 0

  /**
   * Where a multi-select tree puts its checkbox: at the HEAD of the row, after
   * the expander, rather than in the trailing indicator gutter.
   *
   * A trailing checkbox works in a flat list because every box lands on one
   * column. In a tree it does the opposite of what it should: the labels are
   * staggered by depth and the boxes are not, so the eye has to travel the full
   * width of the row to pair a name with its state, and a deep child's box sits
   * directly under its parent's with nothing to say they are different levels.
   * Leading it puts the box on the same stagger as the label it belongs to,
   * which is what every file tree and permission tree does.
   *
   * A per-LIST answer, not per-row: it decides where EVERY row's box goes, so
   * it may not depend on whether this particular node is selectable. A row that
   * cannot be selected reserves the same width instead, or the labels below it
   * would step back out again.
   */
  const leadingCheckbox = mode === "tree" && multiple

  /**
   * Whether this row draws a selection MARK at all, and so whether it reserves
   * the inline-end gutter one needs.
   *
   * `indicator={false}` on the root turns the built-in check off for a picker
   * that marks selection some other way - a tinted row, a filled leading tile -
   * and the gutter is given back with it, because 24px held for a mark that
   * cannot appear is 24px the trailing count and chevron are pushed in by.
   *
   * `|| multiple` is the whole scope of the opt-out. A checkbox is the
   * selection CONTROL, not a decoration: removing it would leave multi-select
   * with no way to see or toggle a row's state, and no `data-selected`
   * treatment a consumer writes replaces a control. So the prop is a no-op in
   * `multiple` mode, in every one of the three navigation modes, and the root
   * says so once in development rather than failing quietly here.
   */
  const showsIndicator = indicatorEnabled || multiple

  const veto = React.useCallback((event: VetoableEvent) => {
    event.preventBaseUIHandler?.()
  }, [])

  const handleClick = React.useCallback(
    (event: CascaderRowEvent) => {
      onClick?.(event)
      if (node.disabled) return
      if (branch && !selectable) {
        veto(event)
        navigate(node)
      }
    },
    [onClick, node, branch, selectable, veto, navigate]
  )

  const handleMouseUp = React.useCallback(
    (event: CascaderRowEvent) => {
      onMouseUp?.(event)
      if (node.disabled) return
      if (branch && !selectable) veto(event)
    },
    [onMouseUp, node, branch, selectable, veto]
  )

  /**
   * The tree expander's own press.
   *
   * Tree mode used to have no expand target at all once branches were
   * selectable: `handleClick` only vetoes when `branch && !selectable`, so with
   * `selectable="any"` the press that used to expand went straight through to
   * a commit - and with `cascade` on, one press silently selected the whole
   * subtree while the row stayed collapsed. The expander is now its own target,
   * exactly as the trailing chevron already is for a selectable branch in
   * drill and columns mode: row press selects, expander press expands.
   *
   * `stopPropagation` before the veto, so Base UI's row handler never runs at
   * all rather than running and being overruled. The expander stays
   * `aria-hidden` and takes no role: `role="option"` is `childrenPresentational`
   * and a nested interactive role fails axe's `nested-interactive` check, so
   * this is a pointer affordance only. ArrowRight / ArrowLeft remain the
   * keyboard path in and out.
   *
   * Routed through `navigate` rather than straight to `toggleExpanded`, which
   * is what makes an unloaded branch fetch BEFORE it opens: in tree mode
   * `navigate` either toggles immediately or holds the row closed with a
   * spinner in this box until the children land. `toggleExpanded` remains the
   * unconditional form and is still what collapses a branch.
   */
  const handleExpanderClick = React.useCallback(
    (event: CascaderRowEvent) => {
      event.stopPropagation()
      veto(event)
      if (node.disabled) return
      if (expanded) toggleExpanded(node.value)
      else navigate(node)
    },
    [veto, node, expanded, toggleExpanded, navigate]
  )

  const handleExpanderMouseUp = React.useCallback(
    (event: CascaderRowEvent) => {
      // Drag-select mouseup reaches the row too, and Base UI treats it as a
      // commit. The expander is not a selection surface in either direction.
      event.stopPropagation()
      veto(event)
    },
    [veto]
  )

  /** The drill chevron's press, for a branch that would otherwise commit. */
  const handleChevronClick = React.useCallback(
    (event: CascaderRowEvent) => {
      event.stopPropagation()
      veto(event)
      if (node.disabled) return
      // A trail row's chevron moves the way the trail row itself does.
      // `navigate` falls through to `pushLevel`, which APPENDS - right in the
      // deepest column, but from an ancestor column it duplicated the level
      // and corrupted the path. `navigateAt` rebuilds the trail from this
      // row's own depth, exactly as `handleButtonClick` below already does
      // for a whole-row press on the same rows.
      if (as === "button") navigateAt(node, depth ?? 0)
      else navigate(node)
    },
    [veto, node, as, navigateAt, depth, navigate]
  )

  const handleChevronMouseUp = React.useCallback(
    (event: CascaderRowEvent) => veto(event),
    [veto]
  )

  /**
   * Keeps focus in the search field when a trail row is pressed.
   *
   * Base UI prevents the default on mousedown for real option rows, which is
   * the whole reason a click on a row does not move focus out of the input. A
   * trail row is a plain `<button>` outside Base UI, so without the same
   * prevention a real browser focused it on click - a `tabindex="-1"` element
   * where the input's key interception and the panel's Tab handler hear
   * nothing, so every key after the click was dead. Applied to the row and to
   * its chevron, so neither press can steal the field's focus.
   */
  const handleButtonMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
    },
    []
  )

  // Button rows are outside Base UI, so they route their own press: branches
  // navigate, selectable leaves commit.
  const handleButtonClick = React.useCallback(
    (event: CascaderRowEvent) => {
      onClick?.(event)
      if (node.disabled) return
      if (branch && !selectable) {
        // Button rows only exist in the columns trail, where `depth` is the
        // column's own depth - so navigating replaces the trail from here.
        navigateAt(node, depth ?? 0)
        return
      }
      if (selectable) commit(node)
    },
    [onClick, node, branch, selectable, navigateAt, depth, commit]
  )

  /**
   * The paging row's press. Never a selection, whatever mode or `selectable`
   * setting is in force - it is vetoed through the same
   * `preventBaseUIHandler()` hook branch rows use, and the root keeps a
   * `details.cancel()` guard behind it.
   */
  const handleMoreClick = React.useCallback(
    (event: CascaderRowEvent) => {
      onClick?.(event)
      veto(event)
      const parent = getCascaderMoreParent(node)
      if (parent == null) return
      if (error) retryLevel(parent)
      else if (!loading) loadMore(parent)
    },
    [onClick, veto, node, error, loading, retryLevel, loadMore]
  )

  /**
   * `expandTrigger="hover"`: resting the pointer on a BRANCH row in the ACTIVE
   * column drills into it after a short delay, so a columns picker can be
   * walked without a click per level. Columns mode only, and only the deepest
   * column - the trail behind is already open, and in drill and tree mode the
   * rows under the pointer are replaced or reflowed by a navigation, which
   * hover must never do uninvited.
   *
   * Hover NAVIGATES and never commits: selection stays on the click and the
   * keyboard, so a pointer crossing the panel cannot change the value.
   */
  const hoverNavigates =
    expandTrigger === "hover" &&
    mode === "columns" &&
    as === "option" &&
    branch &&
    !node.disabled
  const hoverTimerRef = React.useRef<number | null>(null)

  const cancelHoverNavigate = React.useCallback(() => {
    if (hoverTimerRef.current == null) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const handleHoverPointerEnter = React.useCallback(() => {
    cancelHoverNavigate()
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      navigate(node)
    }, CASCADER_HOVER_EXPAND_DELAY)
  }, [cancelHoverNavigate, navigate, node])

  // The row survives its own navigation - drilling in demotes this column to
  // the trail WITHOUT unmounting it - so a pending timer has to die the moment
  // the row stops qualifying, or it would fire `navigate` a second time from a
  // column that is no longer active. Unmount is the other exit, same cleanup.
  React.useEffect(() => {
    if (!hoverNavigates) cancelHoverNavigate()
  }, [hoverNavigates, cancelHoverNavigate])
  React.useEffect(() => cancelHoverNavigate, [cancelHoverNavigate])

  /* ------------------------------- paging row ------------------------------ */

  if (isCascaderMoreNode(node)) {
    // `node.count` is the level's loaded child count, stamped when the pseudo
    // node was created: a level that already has rows is fetching MORE, one
    // that has none is fetching its first page.
    const text = error
      ? labels.error
      : loading
        ? node.count
          ? labels.loadingMore
          : labels.loading
        : labels.loadMore

    const moreStyle =
      mode === "tree" && nodeDepth > 0
        ? ({
            ...style,
            "--cascader-indent": `${nodeDepth * indent}px`,
          } as React.CSSProperties)
        : style

    const moreShared = {
      "data-slot": "cascader-item",
      "data-more": "",
      "data-state": error ? "error" : loading ? "loading" : "idle",
      "data-depth": nodeDepth,
      style: moreStyle,
      className: cn(
        ROW_CLASS,
        // No check indicator is ever rendered here, so the gutter every style
        // reserves for one is given back - in both directions at once, because
        // the padding is logical.
        ROW_FLUSH_CLASS,
        "text-muted-foreground justify-center gap-1.5 text-xs",
        !error && !loading && "hover:text-foreground",
        // Same sum as a real row; see the note on `shared.className`.
        mode === "tree" &&
          "ps-[calc(var(--cascader-row-inset,8px)_+_var(--cascader-indent,0px))]!",
        className
      ),
    }

    const moreBody = children ?? (
      <>
        {loading ? (
          <HugeiconsIcon icon={Loading02Icon} strokeWidth={2} className="size-3.5 animate-spin" aria-hidden />
        ) : null}
        <span>{text}</span>
        {/* The retry affordance is TEXT, not a button. A focusable element
            inside a `role="option"` row is a `nested-interactive` violation,
            and the whole row is the target anyway. */}
        {error ? (
          <span className="text-foreground font-medium">{labels.retry}</span>
        ) : null}
      </>
    )

    if (as === "button") {
      const buttonProps = { ...(props as React.ComponentProps<"button">) }
      delete buttonProps["aria-setsize"]
      delete buttonProps["aria-posinset"]
      delete buttonProps["aria-level"]

      return (
        <button
          type="button"
          {...moreShared}
          tabIndex={-1}
          onClick={handleMoreClick}
          {...buttonProps}
        >
          {moreBody}
        </button>
      )
    }

    return (
      <ComboboxPrimitive.Item
        {...moreShared}
        value={node}
        // Same gate as every other row: an explicit index is legal only while
        // the list is windowed.
        {...(virtualized && index != null ? { index } : null)}
        // Conditional spread, never an explicit `undefined`: `mergeProps`
        // iterates own keys, so passing one would delete Base UI's own role.
        {...(mode === "tree"
          ? { role: "treeitem" as const, "aria-level": nodeDepth + 1 }
          : null)}
        onClick={handleMoreClick}
        onMouseUp={veto}
        {...props}
      >
        {moreBody}
      </ComboboxPrimitive.Item>
    )
  }

  const itemState = {
    branch,
    selected,
    disabled: !!node.disabled,
    depth: nodeDepth,
    count,
    path: showPath ? getCascaderPath(treeIndex, node.value).slice(0, -1) : [],
  }

  const custom = renderItem?.(node, itemState)
  const customLabel = renderLabel?.(node, itemState)

  /**
   * The part of the row's accessible name that the visible markup cannot say.
   *
   * Without it a branch announces "Person 24" - a label with a naked number
   * after it and no hint that pressing it opens anything. Trail rows in columns
   * mode need the selected state too: they are plain buttons outside Base UI's
   * listbox, so nothing gives them `aria-selected`.
   */
  const srDetails = [
    branch ? labels.itemCount(count) : null,
    // The accent number is a different fact from the total, so it is spoken as
    // one rather than left to be inferred from a colour.
    showsSelectedCount ? labels.selectedCount(selectedDescendants) : null,
    branch && mode !== "tree" ? labels.branchAffordance : null,
    as === "button" && selected ? labels.selectedState : null,
    // Option rows say this with `aria-checked="mixed"`. A trail row is a
    // `role="button"`, which allows neither `aria-checked` nor
    // `aria-selected`, so for those it has to be said in words.
    as === "button" && indeterminate ? labels.partiallySelectedState : null,
  ]
    .filter(Boolean)
    .map((detail) => `, ${detail}`)
    .join("")

  /**
   * The checkbox, on its own. Extracted because tree mode renders it INLINE at
   * the head of the row rather than through the trailing indicator slot.
   *
   * It never needs `Combobox.ItemIndicator` to know its state: both variants
   * read `data-selected` / `data-indeterminate` off the ROW with `in-data-*`,
   * which is also what lets the same markup work on the `as="button"` trail
   * rows that live outside Base UI entirely.
   */
  const checkbox = (
    <span
      data-slot="cascader-item-checkbox"
      // `in-data-[indeterminate]` reads the row, exactly as
      // `in-data-[selected]` does, so the box fills for a partial selection
      // without the row having to thread a second prop down here.
      className="border-input in-data-[selected]:bg-primary in-data-[selected]:border-primary in-data-[selected]:text-primary-foreground in-data-[indeterminate]:bg-primary in-data-[indeterminate]:border-primary in-data-[indeterminate]:text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
    >
      {/* See `CHECKBOX_MARK_CLASS`: the colour is declared ON THE ICON, with
          `!`, because the row's own highlight rule is a descendant selector. */}
      {indeterminate ? (
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} data-slot="cascader-item-dash" className={cn(CHECKBOX_MARK_CLASS, "size-3")} />
      ) : (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} data-slot="cascader-item-tick" className={cn(
                              CHECKBOX_MARK_CLASS,
                              "size-3 opacity-0 in-data-[selected]:opacity-100"
                            )} />
      )}
    </span>
  )

  const indicator = (
    <>
      {multiple ? (
        checkbox
      ) : (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} data-slot="cascader-item-check" className={cn(
                              "pointer-events-none",
                              INDICATOR_MARK_CLASS
                            )} />
      )}
    </>
  )

  const body = custom ?? children ?? (
    <>
      {/* Tree mode expands in place, so the branch marker leads the row. */}
      {mode === "tree" && branch ? (
        <span
          data-slot="cascader-item-expander"
          // Pure affordance: the row itself carries `aria-expanded`, so a
          // second announcement of the same state is noise.
          aria-hidden="true"
          data-state={
            childrenError ? "error" : childrenLoading ? "loading" : "idle"
          }
          onClick={handleExpanderClick}
          onMouseUp={handleExpanderMouseUp}
          className={cn(
            "-ms-0.5",
            childrenError ? "text-destructive" : "text-muted-foreground",
            AFFORDANCE_BOX_CLASS,
            AFFORDANCE_HOVER_CLASS,
            // A branch whose children are already on the way should not also
            // look pressable.
            childrenLoading && "pointer-events-none"
          )}
        >
          {childrenLoading ? (
            // IN PLACE, in the same 16px box the chevron occupied. No skeleton
            // row appears below, nothing reflows, and the chevron comes back
            // when the children render.
            <Spinner aria-hidden="true" className="size-4" />
          ) : childrenError ? (
            // Same box again. The branch stayed put when the fetch failed, so
            // the retry belongs where the press was, not on a level the user
            // never reached.
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4" />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className={cn(
                                              "size-4 transition-transform",
                                              // Collapsed: the chevron points INTO the level, so it mirrors.
                                              // Expanded: it points DOWN, which is the same direction in both
                                              // writing modes - so the mirror has to come off, or `scaleX(-1)`
                                              // composed with `rotate(90deg)` lands it pointing up. The old
                                              // `rtl:rotate-90` alongside `rotate-90` was a no-op that only
                                              // looked like it handled this.
                                              expanded ? "rotate-90" : "rtl:-scale-x-100"
                                            )} />
          )}
        </span>
      ) : mode === "tree" ? (
        // A LEAF's expander slot, reserved and empty.
        //
        // Without it a leaf's label started where a sibling branch's EXPANDER
        // started, so at one depth the two label columns were 28px apart and
        // the tree read as if the leaves belonged to the level above. Same box,
        // same negative margin, no glyph: the hierarchy is carried by the
        // indent and by the one row type that can actually open, and a second
        // marker per leaf would only add noise beside the checkbox.
        <span
          data-slot="cascader-item-expander-spacer"
          aria-hidden="true"
          className={cn("-ms-0.5", AFFORDANCE_BOX_CLASS)}
        />
      ) : null}

      {/* Tree + multi-select: the box leads the row rather than trailing it.
          See `leadingCheckbox`. A row that cannot be selected still reserves
          the width, so one depth keeps one label column. */}
      {leadingCheckbox ? (
        selectable ? (
          checkbox
        ) : (
          <span
            data-slot="cascader-item-checkbox-spacer"
            aria-hidden="true"
            className="size-4 shrink-0"
          />
        )
      ) : null}

      {node.icon ? (
        <span
          data-slot="cascader-item-icon"
          className="text-muted-foreground flex shrink-0 items-center justify-center"
        >
          {node.icon}
        </span>
      ) : null}

      {/* `.cn-combobox-item-text` is `flex gap-2` in all eight sheets, sized for
          a row whose pieces sit SIDE BY SIDE. Turned to a column it keeps that
          8px gap, which lands between a label and its `description` as a
          paragraph break rather than a subtitle. Overridden here, on the
          cascader's own element, rather than in the shared style layer. */}
      <span className="min-w-0 flex-1 flex-col items-start gap-0.5">
        {customLabel ?? (
          <>
            <span className="w-full truncate text-start">{node.label}</span>
            {node.description ? (
              <span
                data-slot="cascader-item-description"
                className="text-muted-foreground w-full truncate text-start text-xs"
              >
                {node.description}
              </span>
            ) : null}
          </>
        )}
        {showPath ? <CascaderItemPath node={node} /> : null}
      </span>

      {/* What the row's own name cannot carry: the count is a bare number next
          to the label, and nothing else says a branch opens something. */}
      {srDetails ? (
        <span data-slot="cascader-item-details" className="sr-only">
          {srDetails}
        </span>
      ) : null}

      {/* Tree mode expands in place, so it has no drill-in chevron. */}
      {branch && mode !== "tree" ? (
        <span
          data-slot="cascader-item-trailing"
          // A pointer-only affordance, and nothing more. `role="option"` is
          // childrenPresentational, so the old `role="button" tabIndex={-1}`
          // was pruned from the accessibility tree anyway while still failing
          // axe's `nested-interactive` check - and it could never take focus,
          // because focus stays in the input. The keyboard path in is
          // ArrowRight, which every mode already has.
          aria-hidden="true"
          className="text-muted-foreground ms-auto flex shrink-0 items-center gap-1 text-xs tabular-nums"
        >
          {showCount ? (
            <span
              data-slot="cascader-item-count"
              // The marker a consumer (and a test) reads to tell the two
              // numbers apart without matching on a colour class.
              {...(showsSelectedCount ? { "data-selected-count": "" } : null)}
              // `!` for the same reason the tick needs it: the row's
              // `data-highlighted:**:text-accent-foreground` would otherwise
              // repaint the accent number grey the moment the pointer lands.
              className={cn(showsSelectedCount && "text-primary!")}
            >
              {trailingCount}
            </span>
          ) : null}
          {/* The chevron, and ONLY the chevron, is the drill target. It used to
              share one hit area with the count, which made a number pressable
              and gave the hover chip a width that changed with the digits. */}
          <span
            data-slot="cascader-item-chevron"
            data-state={
              childrenError ? "error" : childrenLoading ? "loading" : "idle"
            }
            onClick={selectable ? handleChevronClick : undefined}
            onMouseUp={selectable ? handleChevronMouseUp : undefined}
            // Only the trail rows need the guard here: inside a real option
            // Base UI already prevents the mousedown default itself.
            onMouseDown={as === "button" ? handleButtonMouseDown : undefined}
            className={cn(
              // Cancels the box's own outer slack, so the icon sits on the
              // same column as a non-selectable branch's does.
              "-me-0.5",
              AFFORDANCE_BOX_CLASS,
              selectable && AFFORDANCE_HOVER_CLASS,
              childrenError && "text-destructive",
              childrenLoading && "pointer-events-none"
            )}
          >
            {childrenLoading ? (
              <Spinner aria-hidden="true" className="size-4" />
            ) : childrenError ? (
              // The level never opened, so the retry lives on the row that
              // failed to open it. Pressing the row (or this box, on a
              // selectable branch) refires the request through `navigate`.
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4" />
            ) : (
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 rtl:-scale-x-100" />
            )}
          </span>
        </span>
      ) : null}

      {branch && mode === "tree" && showCount ? (
        <span
          data-slot="cascader-item-count"
          {...(showsSelectedCount ? { "data-selected-count": "" } : null)}
          // The count is spoken by the sr-only details span, as "24 items"
          // rather than as a stray "24" glued to the label.
          aria-hidden="true"
          className={cn(
            "text-muted-foreground ms-auto shrink-0 text-xs tabular-nums",
            showsSelectedCount && "text-primary!"
          )}
        >
          {trailingCount}
        </span>
      ) : null}

      {/* The TRAILING indicator, which two rows do not have: a multi-select
          tree's box already led the row, and `indicator={false}` opted out of
          the built-in mark entirely. See `showsIndicator`. */}
      {selectable && !leadingCheckbox && showsIndicator ? (
        as === "button" ? (
          // Outside Base UI there is no ItemIndicator, so the marker is
          // rendered directly and driven by `data-selected` on the row.
          (multiple || selected) && (
            <span
              data-slot="cascader-item-indicator"
              className={cn(
                "",
                INDICATOR_INSET_CLASS
              )}
            >
              {indicator}
            </span>
          )
        ) : (
          <ComboboxPrimitive.ItemIndicator
            // Kept mounted for a partial selection too: the row is not
            // selected, so Base UI would otherwise unmount the box the dash
            // lives in.
            keepMounted={multiple || indeterminate}
            render={
              <span
                data-slot="cascader-item-indicator"
                className={cn(
                  "",
                  INDICATOR_INSET_CLASS
                )}
              />
            }
          >
            {indicator}
          </ComboboxPrimitive.ItemIndicator>
        )
      ) : null}
    </>
  )

  const rowStyle =
    mode === "tree" && nodeDepth > 0
      ? ({
          ...style,
          "--cascader-indent": `${nodeDepth * indent}px`,
        } as React.CSSProperties)
      : style

  const shared = {
    "data-slot": "cascader-item",
    "data-branch": branch || undefined,
    "data-selected": selected || undefined,
    "data-indeterminate": indeterminate || undefined,
    "data-depth": nodeDepth,
    "data-expanded": expanded || undefined,
    // No `aria-level` here. `role="option"` allows only `aria-selected`,
    // `aria-checked`, `aria-posinset` and `aria-setsize` on top of the globals,
    // and the same goes for the `role="button"` trail rows. Only tree mode has
    // a role that takes a level, and it adds one below.
    style: rowStyle,
    className: cn(
      ROW_CLASS,
      /**
       * Every style reserves an inline-end gutter for the absolutely
       * positioned check, and whether this row gives it back is a question
       * about the CASCADER, not about this row.
       *
       * It used to be `branch && !selectable`, which is a per-row answer, and
       * in a level where a predicate accepted one branch and refused the next
       * that put two neighbouring chevrons on two different insets - 24px and
       * 6px in nova, measured - so counts and arrows visibly jumped as the eye
       * ran down the list. `branchesSelectable` is the per-LIST form of the
       * same question: if branches can be committed here at all, every branch
       * row reserves the gutter and the two trailing columns stay straight.
       * A cascader with the default `selectable="leaf"` is unaffected: no
       * branch can be committed, so every branch still ends flush.
       *
       * One `pe-*` is emitted either way, so nothing here depends on
       * class-merge order.
       *
       * A multi-select tree reserves nothing: its box leads the row, so the
       * gutter would be 24px of dead space on the inline end of every row -
       * width the labels want back more than any style wants a straight edge.
       *
       * `indicator={false}` says the same thing about EVERY row in the list -
       * see `showsIndicator`. That is the half of the opt-out worth having:
       * dropping the check without dropping the gutter would leave the count
       * and the chevron parked one gutter in from an edge nothing sits on.
       */
      leadingCheckbox || !showsIndicator || (branch && !branchesSelectable)
        ? ROW_FLUSH_CLASS
        : ROW_GUTTER_CLASS,
      /**
       * The indent is ADDED to the style's own inset, never substituted for it.
       *
       * `ps-(--cascader-indent)` replaced it, which made the first step into
       * the tree a different size in every style and, in the roomy ones, almost
       * no step at all: depth 0 sat at 12px in maia, luma and sera and depth 1
       * at 16px, so a child was 4px in from its parent. Summing them makes one
       * level exactly `indent` px in all eight, and keeps depth 0 flush with
       * every other row in the panel.
       *
       * `_-_` rather than spaces: Tailwind's arbitrary-value parser splits on
       * whitespace, and `calc()` needs the operator spaced to parse at all.
       */
      mode === "tree" &&
        "ps-[calc(var(--cascader-row-inset,8px)_+_var(--cascader-indent,0px))]!",
      className
    ),
  }

  if (as === "button") {
    // The remaining props are Base UI `Combobox.Item` props, typed for the
    // `<div>` it renders. A button row is outside Base UI's listbox entirely,
    // so the pass-through is narrowed to what a button accepts.
    const buttonProps = { ...(props as React.ComponentProps<"button">) }
    // `role="button"` allows only `aria-expanded` and `aria-pressed`, so the
    // listbox metadata a caller may have handed down is dropped rather than
    // forwarded into an invalid combination.
    delete buttonProps["aria-setsize"]
    delete buttonProps["aria-posinset"]
    delete buttonProps["aria-level"]

    return (
      <button
        type="button"
        {...shared}
        // Focus lives in the search input for every mode, and the columns trail
        // is reached with ArrowLeft rather than Tab. A tab stop per trail row
        // would put dozens of them between the input and the page.
        tabIndex={-1}
        disabled={node.disabled}
        aria-disabled={node.disabled || undefined}
        onClick={handleButtonClick}
        // See `handleButtonMouseDown`: a click on a trail row must not move
        // focus out of the search field.
        onMouseDown={handleButtonMouseDown}
        {...buttonProps}
      >
        {body}
      </button>
    )
  }

  return (
    <ComboboxPrimitive.Item
      {...shared}
      value={node}
      // THE one gate for the explicit index, for the whole primitive.
      //
      // Base UI wants an index only while it is virtualized. Supply one
      // otherwise and `useCompositeListItem` skips registration, the enclosing
      // `CompositeList` truncates `elementsRef` to zero, and the first arrow
      // key leaves `aria-activedescendant` pointing at nothing. This shipped
      // once already; the gate is why it cannot ship again.
      {...(virtualized && index != null ? { index } : null)}
      disabled={node.disabled}
      // Conditional spread, never `role={... : undefined}`. Base UI's
      // `mergeProps` iterates own keys, so an explicit `undefined` would delete
      // its `role="option"` - and `useButton` runs last and would refill the
      // hole with `role="button"`, which is worse than the attribute we set out
      // to remove. Same reasoning for `aria-level` and `aria-expanded`, neither
      // of which `role="option"` allows.
      {...(mode === "tree"
        ? {
            role: "treeitem" as const,
            "aria-level": nodeDepth + 1,
            ...(branch ? { "aria-expanded": !!expanded } : null),
          }
        : branch
          ? { "aria-haspopup": "listbox" as const }
          : null)}
      // `aria-checked` is one of the four attributes `role="option"` allows on
      // top of the globals, and `role="treeitem"` takes it too, so this is the
      // one place partial selection can be stated rather than implied. Only
      // ever set when it is `mixed`: a plain selected row already says so with
      // `aria-selected`, and two selection attributes on one row is noise.
      {...(indeterminate ? { "aria-checked": "mixed" as const } : null)}
      // Conditional spread for the usual `mergeProps` reason; when present,
      // Base UI merges these with its own pointer handlers so both run.
      {...(hoverNavigates
        ? {
            onPointerEnter: handleHoverPointerEnter,
            onPointerLeave: cancelHoverNavigate,
          }
        : null)}
      onClick={handleClick}
      onMouseUp={handleMouseUp}
      {...props}
    >
      {body}
    </ComboboxPrimitive.Item>
  )
})

/**
 * Ancestor chain shown under a deep-search result. Without it a match like
 * "Name" is ambiguous across branches.
 */
function CascaderItemPath({ node }: { node: CascaderNode }) {
  const { index, labels } = useCascaderActions()
  const ancestors = getCascaderPath(index, node.value).slice(0, -1)
  if (!ancestors.length) return null

  return (
    <span
      data-slot="cascader-item-path"
      className="text-muted-foreground flex w-full items-center gap-0.5 truncate text-start text-xs"
    >
      {ancestors.map((ancestor, i) => (
        <React.Fragment key={ancestor.value}>
          {i > 0 ? (
            <span aria-hidden="true">{labels.pathSeparator}</span>
          ) : null}
          <span className="truncate">{ancestor.label}</span>
        </React.Fragment>
      ))}
    </span>
  )
}

/**
 * Every load-derived prop a row needs, resolved from the level load states.
 *
 * Two rows read from the same map. A PAGING row reports the state of the level
 * it belongs to (`loading` / `error`); a BRANCH row reports the state of the
 * level it OWNS (`childrenLoading` / `childrenError`), which is what swaps its
 * chevron for a spinner, and then for a retry, in place. They are mutually
 * exclusive - a node is one or the other - so one call answers both.
 *
 * Exported because every renderer that lays rows out itself - the windowed
 * list, the windowed column, a hand-written list - has to hand them down: the
 * row is memoised and must not read the volatile state context.
 *
 * Returns an object for every node rather than `null` for a non-paging one, so
 * the branch case is covered by the same spread the paging case already used
 * at all four call sites.
 */
export function getCascaderMoreProps(
  node: CascaderNode,
  loadStates: ReadonlyMap<string, CascaderLoadState>
): {
  loading: boolean
  error: boolean
  childrenLoading: boolean
  childrenError: boolean
} {
  const parent = getCascaderMoreParent(node)
  if (parent == null) {
    const own = loadStates.get(node.value)
    return {
      loading: false,
      error: false,
      childrenLoading: !!own?.loading,
      childrenError: !!own?.error,
    }
  }
  const state = loadStates.get(parent)
  return {
    loading: !!state?.loading,
    error: !!state?.error,
    childrenLoading: false,
    childrenError: false,
  }
}

export interface CascaderItemsProps {
  /** Replaces the default row for every item. */
  children?: (node: CascaderNode, index: number) => React.ReactNode
}

/**
 * Renders whatever the active view is: the current level in drill mode, the
 * deepest column in columns mode, or the flattened visible rows in tree mode.
 *
 * Lives here rather than inside `CascaderList` so `cascader.tsx` never has to
 * import a row component, which would create an import cycle with the context.
 *
 * Note that `index` is deliberately NOT passed. Base UI only wants an explicit
 * index in virtualized mode; supplying one in the normal DOM-ordered case makes
 * each row self-register into `listRef` and take over from the composite list,
 * which leaves `aria-activedescendant` pointing at nothing on the first arrow
 * key. The virtualized list passes it, because there it is required.
 */
function CascaderItems({ children }: CascaderItemsProps) {
  const { mode, isBranch, isSelectable, isSelected, isIndeterminate } =
    useCascaderActions()
  const { renderedItems, deepResults, treeRows, loadStates } =
    useCascaderState()
  const showPath = deepResults !== null

  // This component subscribes to the volatile state, so it is the right place
  // to answer the three per-row questions once and hand the answers down as
  // props. Every one of them is a plain boolean, so a row whose answers did not
  // change is skipped by `React.memo` even though the level list around it was
  // rebuilt from scratch.
  if (mode === "tree") {
    return (
      <>
        {treeRows.map((row, i) =>
          children ? (
            <React.Fragment key={row.node.value}>
              {children(row.node, i)}
            </React.Fragment>
          ) : (
            <CascaderItem
              key={row.node.value}
              node={row.node}
              depth={row.depth}
              expanded={row.expanded}
              // `row.branch` is already computed by `flattenCascaderTree`.
              branch={row.branch}
              selectable={isSelectable(row.node)}
              selected={isSelected(row.node)}
              indeterminate={isIndeterminate(row.node)}
              {...getCascaderMoreProps(row.node, loadStates)}
              aria-setsize={row.setSize}
              aria-posinset={row.posInSet}
            />
          )
        )}
      </>
    )
  }

  return (
    <>
      {renderedItems.map((node, i) =>
        children ? (
          <React.Fragment key={node.value}>{children(node, i)}</React.Fragment>
        ) : (
          <CascaderItem
            key={node.value}
            node={node}
            showPath={showPath}
            branch={isBranch(node)}
            selectable={isSelectable(node)}
            selected={isSelected(node)}
            indeterminate={isIndeterminate(node)}
            {...getCascaderMoreProps(node, loadStates)}
            aria-setsize={renderedItems.length}
            aria-posinset={i + 1}
          />
        )
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Group / Label / Separator                         */
/* -------------------------------------------------------------------------- */

/**
 * Whether a `CascaderLabel` has a group to name.
 *
 * Base UI's `Combobox.GroupLabel` publishes its own id back to the group's
 * context and THROWS when there is no group - the same trap the menu family
 * carries. A heading is useful in places that are not a group (the footer
 * flyout is the one in this primitive), so the label reads this flag and picks
 * its element instead of taking the panel down with it.
 */
const CascaderGroupContext = React.createContext(false)

/**
 * A heading over a run of rows.
 *
 * `.cn-combobox-label` is the whole reason to reuse the hook rather than write
 * the type out: sera's heading is uppercase and tracked where every other
 * style's is not, so a hand-written `text-muted-foreground text-xs` would be
 * wrong in one style out of eight and nobody would catch it. What the hook does
 * NOT get right here is the inset - it pairs its type with a flat `px-*` sized
 * for a list whose rows are also flat, and a cascader row is inset from
 * `--cascader-row-inset`. That part is restated, in logical properties, for the
 * same reason the rows do it.
 */
const CASCADER_LABEL_CLASS = `cn-combobox-label ${CASCADER_ACTION_INSET_CLASS} block truncate`

/**
 * A rule between two runs.
 *
 * `.cn-combobox-separator` cancels its container's padding with a negative
 * margin, but it hardcodes each style's LIST padding - which is the wrong
 * number in a footer, and 4px too much in lyra, whose list has no padding at
 * all. The margin comes from `--cascader-list-pad` instead, which every
 * container that can hold a separator publishes, so the rule reaches the panel
 * edge by construction rather than by three numbers happening to agree. The
 * rest of the hook - colour, thickness, per-style block margin - is kept.
 */
const CASCADER_SEPARATOR_CLASS =
  "cn-combobox-separator mx-[calc(var(--cascader-list-pad,4px)*-1)]! shrink-0"

export interface CascaderGroupProps extends Omit<
  ComboboxPrimitive.Group.Props,
  "className"
> {
  /** Base UI also accepts a state callback here; the group has no state. */
  className?: string
}

/**
 * A run of related rows, named by the `CascaderLabel` inside it.
 *
 * The reason to reach for this over a bare label is the wiring: the group is
 * `role="group"` and Base UI points its `aria-labelledby` at whatever label it
 * contains, so a screen reader announces "Basic, group" ahead of the rows. A
 * heading on its own inside a listbox names nothing and is dropped from the
 * accessibility tree entirely - it looks right and reads as if it were not
 * there.
 *
 * Grouping is composition, not data: there is deliberately no `group` field on
 * `CascaderNode`. `CascaderItems` renders one flat run per level so its indices
 * line up with Base UI's `listRef` and with the virtualizer's, and a grouping
 * pass inside it would have to renumber both. Compose `CascaderGroup` around
 * your own `CascaderItem` runs when a level needs headings.
 */
function CascaderGroup({ className, ...props }: CascaderGroupProps) {
  return (
    <CascaderGroupContext.Provider value={true}>
      <ComboboxPrimitive.Group
        data-slot="cascader-group"
        className={cn("flex flex-col", className)}
        {...props}
      />
    </CascaderGroupContext.Provider>
  )
}

export interface CascaderLabelProps extends Omit<
  ComboboxPrimitive.GroupLabel.Props,
  "className" | "style"
> {
  /**
   * Base UI also accepts a state callback for `className` and `style`. The
   * label merges both itself, and outside a group it is not a Base UI part at
   * all, so only the plain forms are accepted - a callback would have been
   * dropped on the floor rather than applied.
   */
  className?: string
  style?: React.CSSProperties
}

/** Inside a group: the real thing, with the id association Base UI wires up. */
function CascaderGroupLabel({ className, ...props }: CascaderLabelProps) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="cascader-label"
      className={cn(CASCADER_LABEL_CLASS, className)}
      {...props}
    />
  )
}

/**
 * Outside a group: the same heading, as a plain element.
 *
 * A separate component rather than a branch inside one, so `useRender` is
 * called on exactly one of the two paths and the hook count cannot change when
 * a label is moved into or out of a group.
 */
function CascaderPlainLabel({ className, ...props }: CascaderLabelProps) {
  const defaultProps = {
    "data-slot": "cascader-label",
    className: cn(CASCADER_LABEL_CLASS, className),
  }

  return useRender({
    defaultTagName: "div",
    render: props.render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

/**
 * A heading.
 *
 * Inside `CascaderGroup` it is the group's accessible name. Outside one it is
 * still drawn, because the footer flyout is a menu rather than a listbox and a
 * heading there is read in document order like any other text. Inside a LIST
 * with no group around it, it is decoration only - which is the reason to wrap
 * the run.
 */
function CascaderLabel(props: CascaderLabelProps) {
  const grouped = React.useContext(CascaderGroupContext)
  return grouped ? (
    <CascaderGroupLabel {...props} />
  ) : (
    <CascaderPlainLabel {...props} />
  )
}

export interface CascaderSeparatorProps extends Omit<
  ComboboxPrimitive.Separator.Props,
  "className"
> {
  /** Base UI also accepts a state callback here; only the orientation varies. */
  className?: string
}

/**
 * A rule between two runs of rows.
 *
 * Decorative on purpose. Base UI's separator is `role="separator"`, which a
 * `listbox` may not own - `aria-required-children` fails on it, and a run of
 * rows that needs to be separated for a screen reader needs a `CascaderGroup`,
 * not a line. So the role is dropped and the semantics live on the group. A
 * consumer who wants the role back can pass `role="separator"`: their props are
 * spread last and win.
 */
function CascaderSeparator({ className, ...props }: CascaderSeparatorProps) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="cascader-separator"
      role="presentation"
      aria-hidden="true"
      className={cn(CASCADER_SEPARATOR_CLASS, className)}
      {...props}
    />
  )
}

export {
  CascaderGroup,
  CascaderItem,
  CascaderItems,
  CascaderLabel,
  CascaderSeparator,
}