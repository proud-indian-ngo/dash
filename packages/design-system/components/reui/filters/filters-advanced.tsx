// @ts-nocheck
"use client"

import * as React from "react"
import { FilterFieldPicker } from "@pi-dash/design-system/components/reui/filters/filters-builder"
import {
  FilterMoveToMenuItems,
  FilterOperatorPopover,
  FilterRuleMenuItems,
  FilterValuePopover,
  useFilterRuleDisplay,
} from "@pi-dash/design-system/components/reui/filters/filters-chip"
import {
  filterControlSizes,
  filterReadOnlyProps,
  isFilterLocked,
  useFilterActions,
  useFilterChipAutoOpen,
  useFilterChipFocused,
  useFilterFocusEmpty,
  useFilterFocusStore,
  FilterReorderProvider,
  useFilterReorderable,
  useFilterRowPending,
  useFilterRowStateStore,
  useFilterRender,
  useFilterSegmentFocus,
  useFilterState,
  type FilterActionsContextValue,
} from "@pi-dash/design-system/components/reui/filters/filters-context"
import {
  FILTER_ROW_SELECTOR,
  useFilterRowDrag,
} from "@pi-dash/design-system/components/reui/filters/filters-dnd"
import { filterIssueLabel } from "@pi-dash/design-system/components/reui/filters/filters-i18n"
import {
  FILTER_FIELD_PICKER_CLASS,
  FILTER_MENU_CLASS,
  FILTER_MENU_LABEL_CLASS,
  filterCombinatorSlot,
  getFilterField,
  isFilterFieldPickable,
  joinFilterPath,
} from "@pi-dash/design-system/components/reui/filters/filters-lib"
import {
  getFilterArity,
  getFilterOperator,
  operatorTakesValue,
} from "@pi-dash/design-system/components/reui/filters/filters-operators"
import {
  collectFilterIssues,
  createFilterRule,
  isFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query"
import type {
  FilterCombinator,
  FilterField,
  FilterEmptyStateContext,
  FilterGroupNode,
  FilterQuery,
  FilterIssue,
  FilterNode,
  FilterOperator,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu"
import { Input } from "@pi-dash/design-system/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowDown01Icon, Cancel01Icon, Copy01Icon, Delete02Icon, DragDropVerticalIcon, FilterMailIcon, FolderAddIcon, MoreVerticalIcon, PlusSignIcon, RefreshIcon, UngroupItemsIcon } from "@hugeicons/core-free-icons"

/* -------------------------------------------------------------------------- */
/*                                  Columns                                   */
/* -------------------------------------------------------------------------- */

/**
 * The cells that DESCRIBE a condition, in reading order.
 *
 * A GROUP declares none of them. Its header used to borrow `field` for a
 * headline sentence, and the headline is gone: the combinator pill beside the
 * card already says "and" or "or", so the sentence said the same thing at ten
 * times the width. What a group has left is chrome and actions, which is the
 * other band.
 */
const CONTENT_COLUMNS = ["combinator", "field", "operator", "value"] as const

/**
 * The cells that ACT on a row, in reading order.
 *
 * `drag` leads because it is drawn first and because it is the only one of the
 * four that is chrome rather than an action: it arms a gesture, it does not
 * perform one. `add` is a GROUP's footer, which sits below its children in the
 * document and therefore after them here. `remove` is now drawn by exactly one
 * row - the broken-schema row, whose whole purpose is to be removed - because a
 * group's delete moved into the group's own menu.
 */
const ACTION_COLUMNS = ["drag", "menu", "add", "remove"] as const

/**
 * Every column a row may draw, in two bands.
 *
 * Vertical navigation is by COLUMN NAME, never by position. Rows are ragged by
 * design - the first row of a group has no combinator control, an
 * `arity: "none"` rule has no value cell, a GROUP header has a menu and no
 * operator - so walking a positional index down the builder drifts one column
 * per ragged row and lands the user somewhere they did not aim.
 *
 * The two BANDS are what stop the fallback from being merely "nearest index".
 * A group header draws no content cell at all, so ArrowDown from a value cell
 * has to land somewhere else, and pure index distance would hand it the group's
 * footer button. Searching the source cell's own band first keeps a content cell
 * on content and an action cell on actions.
 */
type FilterColumn =
  | (typeof CONTENT_COLUMNS)[number]
  | (typeof ACTION_COLUMNS)[number]

/**
 * The nearest column in `band` that `available` actually has.
 *
 * Backward wins a tie, because leftward is towards what a row IS and rightward
 * is towards what can be done to it. An arrow key that meant to keep reading
 * should not arrive on a delete button.
 */
function nearestColumn(
  band: readonly FilterColumn[],
  from: FilterColumn,
  available: Map<string | null, HTMLElement>
): HTMLElement | undefined {
  const at = band.indexOf(from)
  if (at === -1) return undefined
  for (let step = 0; step < band.length; step++) {
    const before = step === 0 ? undefined : available.get(band[at - step] ?? "")
    if (before) return before
    const after = available.get(band[at + step] ?? "")
    if (after) return after
  }
  return undefined
}

/**
 * Marks a focusable cell control. Read by the builder's keyboard handler.
 *
 * A plain data attribute rather than `data-slot`. Every cell control is handed
 * to a Base UI trigger through `render`, which stamps its own `data-slot` on
 * whatever it renders, so marking a cell with a slot would be two owners
 * writing one attribute.
 */
const CELL_ATTRIBUTE = "data-filter-cell"

/**
 * Marks a cell the user TYPES into, rather than one they press.
 *
 * The builder is a grid with one tab stop, so it claims the arrow keys, Home,
 * End and Delete for navigation. Every one of those keys means something else
 * inside a text box, and the inline value cell is a real text box: without this
 * flag, ArrowLeft walked out of the field mid-word and Backspace deleted the
 * whole condition instead of a character.
 *
 * An attribute rather than a `tagName` test, because it is a CONTRACT: a
 * consumer who composes their own typing cell into a row opts in the same way
 * the shipped one does, and the walker keeps one rule to follow.
 */
const CELL_INPUT_ATTRIBUTE = "data-filter-cell-input"

/**
 * Marks a row: one rule, or one group's header. Both navigate identically.
 *
 * Re-exported from the drag layer rather than declared twice. The keyboard
 * walker and the pointer hit test have to agree on what a row IS, and two
 * copies of one selector agree only until somebody edits one of them.
 */
const ROW_SELECTOR = FILTER_ROW_SELECTOR

/**
 * Hands every row's handle its pointer wiring.
 *
 * A context rather than a prop threaded through `FilterAdvancedNode`, because
 * the handle lives inside the row chrome, which a rule row and a group header
 * both render at whatever depth they happen to sit, and the panel that owns the
 * body element is the only thing that can measure a drop.
 */


const FilterDragContext = React.createContext<ReturnType<
  typeof useFilterRowDrag
> | null>(null)

/**
 * What each node is missing, by id.
 *
 * A context for the same reason the drag props are one: the panel is the only
 * place that can see the whole query at once, and the rows that have to draw the
 * result sit at arbitrary depth. Passing it down through `position` would put a
 * fresh object on every row on every keystroke.
 *
 * An empty map by default rather than null, so a consumer who mounts a row
 * outside the shipped panel gets "nothing is wrong" instead of a throw.
 */
const FilterIssueContext = React.createContext<
  ReadonlyMap<string, FilterIssue>
>(new Map())

function cellProps(column: FilterColumn, active: FilterColumn | null) {
  return {
    "data-filter-cell": column,
    // One tab stop for the whole builder: Tab reaches it, and the arrow keys
    // move within it. Without this a builder of six rows is thirty tab presses
    // deep before the footer.
    tabIndex: active === column ? 0 : -1,
  }
}

/**
 * What an INVALID cell wears, or nothing at all.
 *
 * One helper rather than four inline ternaries, because an invalid cell has to
 * say the same thing three ways and each of them is easy to forget: a machine
 * state (`aria-invalid`) so assistive technology announces it, a styling hook
 * (`data-invalid`) so the ring is a class and not an inline style, and the
 * sentence itself twice over - `aria-description` for a screen reader,
 * `title` for the pointer, because a cell this narrow shows neither.
 *
 * A conditional spread, the shape `filterReadOnlyProps` already uses:
 * `aria-invalid="false"` on every healthy cell is noise in the tree.
 */
function issueProps(
  issue: FilterIssue | undefined,
  column: FilterIssue["column"],
  message: string
) {
  if (!issue || issue.column !== column) return null
  return {
    "aria-invalid": true,
    "data-invalid": "",
    "aria-description": message,
    // NO `title`. The sentence is on the row's own hint icon now, in a real
    // tooltip, and a native one would fire under the same pointer a beat later
    // saying the same thing - as well as clobbering the truncation `title` the
    // operator and value cells set for their own reasons.
  } as const
}

/**
 * Sera's letterform, normalized.
 *
 * The same kind of clause the chip already carries for borders: sera sets its
 * buttons uppercase with wide tracking, which costs roughly a third of a fixed
 * grid cell, so at widths where every other style shows "migration" in full
 * sera showed "MIGRATI...". These cells show the user's own committed value and
 * the word joining their conditions, and legibility of data outranks one
 * style's letterform on a control this narrow.
 *
 * ONE literal, shared, because the combinator pill needs it for the same reason
 * and its track is the tightest in the panel: "AND" with sera's tracking does
 * not fit a column measured for "and".
 */
const SERA_TEXT_CLASS = ""

/** The shape every wide cell control shares. */
const CELL_CLASS = cn(
  "w-full min-w-0 justify-between gap-1.5 font-normal",
  // BOTH disclosure carets, pinned to chrome weight in one place.
  //
  // They were drawn at two different weights fifteen pixels apart on one row:
  // the operator cell's chevron inherited the `text-muted-foreground` beside it
  // and the field cell's inherited the button's own foreground, so the same
  // glyph in the same size in adjacent cells read as two different things. A
  // caret is chrome in both, and chrome has one weight.
  //
  // `>svg` is the caret and only the caret. A field's own type icon sits inside
  // a nested span, where it keeps full strength because it is content: it
  // identifies the attribute the way the label beside it does.
  "[&>svg]:text-muted-foreground",
  // WHAT A CELL GIVES UP FIRST when there is not enough room for all of it.
  //
  // A cell spends about 44px on padding, a type icon and a caret before it
  // draws a single character, so a nested row in a narrow panel spent
  // everything it had on decoration and rendered its label at zero. Below the
  // threshold the caret goes, then the type icon: a caret says a list opens
  // here, which the cell being a button already says, and an icon says what
  // KIND of attribute this is, which the name says better. The name is what
  // cannot be reconstructed from anything else on the row.
  //
  // Container queries rather than a viewport breakpoint, because the question
  // is how wide THIS cell is - the same panel holds a 300px cell at the top
  // level and a 40px one three groups down.
  "@max-[7rem]/cell:gap-0 @max-[7rem]/cell:[&>svg]:hidden",
  "@max-[5rem]/cell:[&_span>svg]:hidden",
  SERA_TEXT_CLASS
)

/**
 * What an invalid cell looks like.
 *
 * A ring rather than a border, for the reason the drop indicator is a
 * pseudo-element: a border changes the box, so a cell turning invalid as the
 * user picks an operator would nudge every cell beside it by a pixel.
 */
const CELL_INVALID_CLASS =
  "data-invalid:ring-destructive/40 data-invalid:ring-1"

/**
 * Width of the leading combinator column, shared by rule rows and groups.
 *
 * 4rem because that is what the widest thing in it MEASURES, and the widest
 * thing is now the static word rather than the control. Measured intrinsic
 * widths at `default`: "Where" 51.44px in every style, and the pill 40.52px in
 * nova and 36.72px in sera now that it carries no glyph - down from the 58.72px
 * that put this track at 4rem in the first place. The track does not shrink
 * with it: it is sized for the longest of the three things in the column, and
 * that is "Where".
 *
 * It is a cost, and the cost is why it is not larger: this column is half of
 * what one level of nesting spends, so every 8px here is 8px off the content
 * of every row below it. Past that the words truncate, and the pill says so in
 * its name - no fixed track fits every language, and a column wide enough for
 * the longest translation would be a quarter of the panel drawn empty in the
 * other twenty.
 */
const COMBINATOR_CLASS = cn(
  "w-16 shrink-0 items-center justify-center",
  // A gap of its own on the trailing edge, on TOP of the band's `gap-1.5`.
  // This column is a different kind of thing from the three beside it - it is
  // the sentence's connective, not one of its cells - and at one shared gap the
  // pill read as a fourth control butted against the attribute. The extra 6px
  // is what separates "Where / And / Or" from the condition it introduces.
  "me-1.5"
)

/**
 * The two static words in that column, drawn as text rather than as a control.
 *
 * CENTRED, on both axes, and the horizontal half is the one that needed saying.
 * The column holds three things at three widths - "Where", "And", and a pill
 * carrying "And" - and left-aligning the two words put them at the column's
 * leading edge while the pill's own `justify-center` put its word in the
 * middle. Down a five-row group that read as a ragged left margin with one word
 * stepping in and out of it. One column, one axis.
 *
 * The pill holds ONE child for the same reason. `justify-center` centres
 * everything it is given, so a word beside a glyph centres the pair and leaves
 * the word itself 10px to the left of the two below it - measured at -9.00 to
 * -10.01px on every pill in the panel, in all eight styles, which is the ragged
 * column this class exists to have fixed rather than moved.
 *
 * `w-full` and not `flex-1`, because `truncate` needs a block box to draw an
 * ellipsis in: as a bare flex child the span is an anonymous item and
 * `text-overflow` has nothing to apply to.
 */
const COMBINATOR_TEXT_CLASS = cn(
  "text-muted-foreground w-full truncate px-1 text-center text-sm",
  SERA_TEXT_CLASS
)

/**
 * A row is TWO BANDS, and the split is what the layout is about.
 *
 * The CONTENT band - attribute, condition, value - is packed against the
 * leading edge and sized to itself. The ACTION band - the grip and the kebab -
 * is pinned to the trailing edge. Whatever room is left over sits between them,
 * which is what makes the two bands read as two bands rather than as one row of
 * five equal columns.
 *
 * IT REPLACED A FIXED FIVE-TRACK GRID, and the thing that had to survive the
 * replacement is the reason that grid existed: the trailing pair of every row
 * at every depth shares one vertical axis, measured at 0.00px of spread from a
 * 1104px panel down to 240px, at all eight styles, at depth three. A grid held
 * that by giving the last track `auto` and flooring the content tracks at zero.
 * Flex holds it the same way and for the same reason: the content band may
 * SHRINK to nothing (`min-w-0` on the band and on every cell in it), so a row
 * is never wider than the box it is in, and the action band never shrinks, so
 * it is always exactly where the box ends.
 *
 * What changed is what a cell asks for BEFORE anything is tight. A track of
 * `minmax(0,1.1fr)` asks for a share of the row, so three cells always spanned
 * the whole panel however little they had to say, and a two-character operator
 * was drawn in 200px. A cell now asks for its own default width and no more.
 */
const ROW_BAND_CLASS = "flex min-w-0 items-center gap-1.5"

/**
 * The content band's own box: it takes the slack so the action band cannot.
 *
 * `flex-1` rather than `ms-auto` on the band after it, because the slack has to
 * belong to something that can also give it back. When a row is squeezed the
 * band shrinks past its cells' preferred widths and they truncate; when it is
 * roomy the band holds the empty space and the action band stays at the edge.
 */
const CONTENT_BAND_CLASS = "flex min-w-0 flex-1 items-center gap-1.5"

/**
 * What every cell sits in, and why it is a FLEX box rather than a plain one.
 *
 * A shadcn `Button` is `inline-flex`, so a block wrapper around one builds an
 * inline formatting context, and an inline formatting context is at least as
 * tall as the strut of its own font. Measured at `size="sm"` in nova: the
 * buttons resolve to exactly 28px and every wrapper came out 28.141px, so the
 * grid track was 28.141, the stretched value cell was 28.141, and the inline
 * text box - the one control that honestly follows the row - was 0.141px taller
 * than every button beside it. A row whose value is a popover trigger stayed at
 * 28. Two row heights, off by a seventh of a pixel, from a line box nobody
 * asked for.
 *
 * Flex has no inline formatting context, so the wrapper is exactly its child
 * and the track is exactly the rung the size ladder resolved. Nothing here
 * names a height: the number still comes from the style's own `cn-button-size`.
 *
 * It is also the CONTAINER the cell inside it measures itself against, which is
 * what lets a cell shed its decoration when its own track gets tight rather
 * than when the window does. The name is scoped (`/cell`) so a consumer's own
 * container around the panel cannot be the one answering.
 */
const CELL_BOX_CLASS = "@container/cell flex min-w-0 shrink grow-0"

/**
 * THE DEFAULT WIDTH OF EACH CONTENT CELL, and the one place a consumer changes
 * it.
 *
 * A custom property with an INLINE FALLBACK rather than a declaration on the
 * panel, and the difference is the whole usefulness of the hook. Declared on
 * the panel, the panel's own value would beat anything an ANCESTOR set - which
 * is exactly where a consumer sets it in popover mode, since `className` there
 * lands on the popover content and not on the panel. As a fallback there is no
 * declaration to beat: the nearest ancestor that names the property wins, and
 * with nothing named anywhere the cell takes the number written here.
 *
 * So all four of these work, and they are the documented hooks:
 *
 *   <Filters variant="advanced" className="[--filter-field-width:14rem]" />
 *   <FiltersAdvancedPanel className="[--filter-operator-width:7rem]" />
 *   <Card className="[--filter-value-width:16rem]"><Filters … /></Card>
 *   [data-slot="filters-advanced"] { --filter-field-width: 14rem }
 *
 * The three numbers are what the shipped English MEASURES at the `default`
 * rung. An attribute path with one level of nesting ("Account > Owner") wants
 * about 10.5rem including its type icon and caret; the longest shipped operator
 * ("is greater than or equal to") wants more than any sane column, so 9rem is
 * where it starts truncating and the `title` carries the rest; a value cell
 * shows a committed value, which is the one cell whose content the primitive
 * cannot bound at all, so it gets the widest of the three.
 *
 * Each is a BASIS, never a `min-width`: a cell does not grow past its default
 * and gives all of it up before the row overflows. See `ROW_BAND_CLASS` for why
 * the shrink half is not optional.
 */
const FIELD_CELL_CLASS = "basis-[var(--filter-field-width,11rem)]"
const OPERATOR_CELL_CLASS = "basis-[var(--filter-operator-width,9rem)]"
const VALUE_CELL_CLASS = "basis-[var(--filter-value-width,12rem)]"

/**
 * The trailing band: the grip, the kebab, and the space after them.
 *
 * `pe-1` is the whole of the "give the last control some room" fix, and it is
 * on the BAND rather than on the panel's gutter on purpose. The gutter is
 * shared with the footer and the body, and a group card is deliberately
 * `pe-0` so that a row three levels down still ends on the panel's own content
 * edge - so padding added to the gutter would move the top-level kebab and
 * leave every nested one where it was, which is the staggered column the whole
 * layout exists to avoid. Every row at every depth draws this band, so four
 * pixels here move all of them together and the column stays one column.
 *
 * The same four are written twice more, both times so that something lands ON
 * that column instead of on the box four pixels past it: the footer's
 * `pe-[calc(var(--filter-panel-pad)+4px)]`, and the insertion rule's `end-1`
 * in `DROP_SLOT_INDICATOR`. Change this one and both change in the same pass;
 * they are named here so a reader finds all three from any one of them.
 */
const ACTION_BAND_CLASS = cn(
  "text-muted-foreground flex shrink-0 items-center gap-0.5 pe-1"
)

/**
 * What the grip and the kebab wear on hover and while their menu is open.
 *
 * A BORDER and nothing else. There used to be a fill here as well, and that was
 * removed because it made these two the only controls in the bar not answering
 * to the style's own button variants. The boundary is the half worth keeping:
 * at rest the pair is a column of bare dots with no box, so there is nothing to
 * aim at and nothing to say the open one is open. An inset ring draws that box
 * without a fill, and without changing the colour the variant chose.
 *
 * A RING and not a border, for the reason the group card uses one: a ring is
 * painted rather than laid out, so a control gaining its boundary under the
 * pointer moves nothing beside it.
 *
 * THE OPEN STATE IS TWO ATTRIBUTES, ONE STRING. Radix's menu trigger sets
 * `data-state="open"`; Base UI's sets neither that nor `aria-expanded` and says
 * so through `data-popup-open` instead. A single selector would be live in one
 * twin and dead in the other, silently, in a file the parity suite keeps
 * byte-identical - so both are listed, only one can ever match, and the string
 * is the same on both sides.
 */
const ACTION_CONTROL_CLASS = cn(
  "hover:inset-ring hover:inset-ring-border",
  // Base UI.
  "data-popup-open:inset-ring data-popup-open:inset-ring-border",
  // Radix.
  "data-[state=open]:inset-ring data-[state=open]:inset-ring-border"
)

/**
 * The panel's padding, as ONE number every strip reads.
 *
 * A variable rather than a literal because the two modes want different
 * answers and the strips must not be able to disagree. In POPOVER mode the
 * popover content is `p-0`, so this is the popup's own inner padding and it
 * has to be there. INLINE there is no popup: the builder is sitting in
 * whatever the page wrapped it in, and a panel that pads itself as well is a
 * second inset nobody asked for, which is why inline resolves it to zero and
 * the box around it owns the spacing outright.
 *
 * Published on the panel, so it inherits to every strip and a consumer can
 * override it on either mode without hunting for three classes that have to
 * agree.
 */
/**
 * The gap between sibling rows, and one third of a measurement written three
 * times.
 *
 * The other two are `FILTER_ROW_SEAM_PX`, which must stay HALF of this because
 * rows grow by the seam to tile across the gap for hit testing, and the
 * footer's `-mt-*`, which cancels exactly this so its append zone starts at the
 * body's bottom edge. Change one and the other two change in the same pass;
 * they are named here so a reader finds all three from any one of them.
 */
const FILTER_ROW_GAP_CLASS = "gap-3"
const FILTER_ROW_GAP_CANCEL_CLASS = "-mt-3"
/**
 * Half of it, which is where a drop slot's edge sits.
 *
 * The slot names a BOUNDARY between two rows, and the boundary is the middle of
 * the gap. Written next to the gap it halves so the two cannot drift; this is
 * the same coupling `FILTER_ROW_SEAM_PX` has on the hit-testing side.
 */
const FILTER_ROW_HALF_GAP_CLASS = {
  // 6px of gap less HALF the rule's own 2px, so its CENTRE lands on the
  // boundary rather than its leading edge.
  before: "data-[drop-edge=before]:after:mb-[5px]",
  after: "data-[drop-edge=after]:after:mt-[5px]",
} as const

const PANEL_PAD_VAR = "--filter-panel-pad"
const PANEL_PAD_POPOVER = "0.75rem"
const PANEL_PAD_INLINE = "0px"

/**
 * The panel's ONE horizontal rhythm: header, body and footer share a gutter.
 *
 * Named once because the alignment contract below depends on all three agreeing.
 * A row's trailing controls sit at the content right edge, and the content right
 * edge is this padding - so the moment the footer disagrees with the body, the
 * kebab column and the Clear button stop lining up.
 */
const PANEL_GUTTER_CLASS = "px-(--filter-panel-pad)"

/**
 * The panel's own box, in one place.
 *
 * NO BORDER, NO BACKGROUND AND NO RADIUS: a surface is a decision the page
 * makes, so a page that wants one wraps the builder in a `Card` or a `Frame`
 * the ordinary way. What is here is the half that is not a surface: a column,
 * a floor of zero so the rows inside can shrink, the vertical rhythm between
 * the strips, and the padding variable above - which is real padding in a
 * popover and nothing at all inline.
 */
const PANEL_CLASS =
  "flex w-full min-w-0 flex-col gap-2 py-(--filter-panel-pad)"

/**
 * Why a group card wears a RING and not a border.
 *
 * This is the whole answer to the staggered trailing controls. A row's kebab is
 * the last thing in its own box, so it lands on the card's content right edge,
 * and a real border pushes that edge inward by a pixel at EVERY level: depth one
 * was one pixel short of the panel's own rows, depth three was three, and the
 * column of kebabs sloped away from the right edge the further down the panel
 * you read. The padding did the same thing an order of magnitude louder.
 *
 * An inset ring is painted, not laid out. It costs zero pixels of box, so a card
 * nested three deep still ends exactly where the panel's content ends, and the
 * trailing pair of every row at every depth shares one axis by construction
 * rather than by a stack of compensating negative margins. What indentation
 * costs is spent entirely on the LEADING edge, which is the edge that carries
 * the meaning.
 */
const GROUP_CARD_CLASS = cn(
  "bg-muted/40 min-w-0 flex-1 rounded-md",
  "inset-ring inset-ring-border",
  // `ps-*` and no `pe-*`, for the reason above: containment is drawn on the
  // left, and the right edge belongs to the column of kebabs.
  "ps-2 pe-0",
  "data-invalid:inset-ring-destructive/50",
  // The DESTINATION of a drop into this group: a SOLID accent ring around the
  // whole card, plus a wash.
  //
  // Solid, and that is a deliberate split from the insertion slot beside it.
  // While the slot was a six-pixel sliver the two could both be dashed and stay
  // distinct by SIZE - a small block versus a whole card. The slot is now the
  // size of a row, so a dashed row-sized block and a dashed card-sized outline
  // are the same picture at two scales, which is exactly the confusion the
  // original note warned about. They are told apart by STYLE instead, and the
  // pairing is the honest way round: dashed is the OUTLINE OF SOMETHING NOT
  // THERE YET (the row about to land), solid is a boundary around something
  // that exists (the group being entered).
  //
  // An OUTLINE and not a border, for the reason the resting state is a ring:
  // an outline is painted outside the box and costs no layout at all, so a
  // card lighting up mid-gesture moves nothing under the pointer.
  "data-drop-into:bg-muted/60",
  "data-drop-into:outline-1 data-drop-into:outline-solid",
  "data-drop-into:outline-border data-drop-into:-outline-offset-2"
)

/**
 * THE CONTAINER a row measures its own room against.
 *
 * Declared twice, under one name: on the panel body, and on every group's list
 * of children. The nearest one wins, so each row asks the question that actually
 * decides its layout - how wide is the list I am IN - rather than how wide the
 * window is. The same panel holds a 650px list at the top level and a 260px one
 * three groups down, and a viewport breakpoint cannot tell those apart.
 *
 * Named `/track` rather than reusing `/cell`, which is the container INSIDE a
 * cell: two scopes, two questions, and a shared name would make the inner one
 * answer for the outer.
 */
const TRACK_CONTAINER_CLASS = "@container/track"

/**
 * When a group stops putting its combinator BESIDE the card.
 *
 * Nesting costs horizontal space twice per level: the combinator gutter beside
 * the card, and the card's own leading padding. The gutter is the expensive half
 * at four rems plus a gap, and it is the one that COMPOUNDS - a condition three
 * groups down has three of them to its left before its own row starts.
 *
 * This used to be a DEPTH budget, a constant that said "past level two the
 * combinator moves into the header". Depth was a proxy for the real question and
 * it was wrong in both directions: at 1104px a group at depth three has room to
 * spare and was paying a header band for nothing, and at 380px a group at depth
 * ONE has already spent more than it has. Measured on the deep fixture at a 380px
 * panel, the depth-three row painted zero pixels of field, zero of operator and
 * zero of value - three blank 22px pills - and below 380px the row overflowed its
 * box entirely, fanning the column of kebabs out by up to 119px, which is the
 * exact defect the whole redesign was handed.
 *
 * So it asks the question directly. The combinator ALWAYS sits outside the card,
 * which is where it reads best; the container query decides whether "outside"
 * means beside it or on the line above it. Above the threshold nothing changes
 * at all. Below it the group's row wraps, the gutter costs zero horizontal
 * pixels, and the level is back down to the six pixels of the card's padding.
 *
 * 26rem is what a row MEASURES, not a round number. A row's fixed costs are the
 * 4rem combinator track, four 6px gaps and the trailing grip-and-kebab pair at
 * about 46px, so 134px is gone before a cell draws anything; three cells showing
 * six characters each need roughly 200px more. A group whose own list is narrower
 * than 26rem would hand its children less than that, so it stops charging them
 * for the gutter.
 *
 * It also answers what happens at EXTREME depth, which no constant could. Each
 * level shrinks the next list by 76px until one of them falls under the
 * threshold, and every level after that costs 6px, so the indentation converges
 * instead of running off the side. What deep nesting costs from there is
 * vertical - one short line per level - which is the direction a panel can
 * scroll.
 */
const GROUP_COMBINATOR_WRAP_CLASS = "@max-[26rem]/track:w-full"

/**
 * The combinator itself, when its wrapper has been handed a whole line.
 *
 * Pinned to the same 4rem the gutter track is, so the pill is the same control
 * at every width instead of a full-bleed outlined bar that reads like a primary
 * action. `cn` merges it over the control's own `w-full`, and the wrapper's
 * `flex` leaves it on the leading edge, directly above the card it joins.
 */
const GROUP_COMBINATOR_WRAPPED_CLASS = "@max-[26rem]/track:w-16"

/**
 * How a row shows where a dragged node would land.
 *
 * THREE states, drawn three different ways, because they are three different
 * promises:
 *
 *  - `data-drop-edge` is an insertion BETWEEN rows. It is the destination SLOT
 *    itself: a dashed pad filling the eight pixels of gap the insert would
 *    open, drawn where the row is going rather than as a rule between the two
 *    it is going between. A faint dashed outline on the neighbour says which
 *    row it lands beside.
 *  - `data-drop-into` is a group, and that is painted on the CARD (see
 *    `GROUP_CARD_CLASS`), not here. A whole card outlined and a pad opening
 *    between two rows are the two different answers the gesture can give, and
 *    they have to look different or "inside this group" and "after this group"
 *    are one picture. The two are told apart by SHAPE - a boundary around
 *    something that exists, versus a small block where nothing is yet - rather
 *    than by colour, so the distinction survives a consumer's theme.
 *
 *    WHICH IS WHY A GROUP'S OWN ROW TAKES `DROP_SLOT_INDICATOR` INSTEAD. A
 *    group's row element wraps its whole card plus the combinator gutter, so
 *    the "which row does it land beside" outline drew a dashed rectangle around
 *    the same 128px box that "into this group" outlines - same idiom, 1px of
 *    stroke and 0.2 of alpha apart, swapping in three pixels of pointer travel.
 *    Two answers, one picture, which is exactly what the paragraph above says
 *    must not happen. Beside a group is now the pad alone; the card's own
 *    resting ring is what says which card it is beside.
 *  - `data-drop-noop` is the release that would change nothing. It is drawn on
 *    the SOURCE row, in a neutral dash rather than the accent one, because the
 *    honest thing to say is "it stays here" and saying it in the accent colour
 *    would read as a landing.
 *
 * DASHED THROUGHOUT, which is the language the event calendar and the gantt
 * already speak: `EVENT_CALENDAR_GHOST.move` and the gantt's own drag ghost are
 * both `border-dashed` over a faint wash, and both reserve the SOLID accent for
 * something that is really there. A solid primary border on a drop target read
 * as a selection, which is the wrong tense.
 *
 * All of it is pseudo-elements and outlines: a real border would push every row
 * below it by two pixels on every pointer move, which is a whole column of text
 * jittering under the pointer for the length of the gesture.
 */
const DROP_SLOT_INDICATOR = cn(
  // The SOURCE, while it is in flight. Faded rather than hidden: it keeps its
  // space, so nothing below it moves for the length of the gesture, and the
  // fade is what says this copy is not the live one - the carry following the
  // pointer is.
  //
  // THREE FIFTHS, and the number is a contrast measurement rather than a
  // taste. It was 35 with a `blur-[1px]` over it, and the two COMPOUNDED: a
  // row's own text composites to #a9a9a9 at that alpha, 2.35:1 on the light
  // panel, under even the 3:1 line for a mark that is not text - and the blur
  // then took the stroke definition off what little was left, at 12px. The one
  // list a user reads to choose a destination had a row in it they could not
  // read. At 60 the same text is #6c6c6c and 5.25:1 in light, #9a9a9a and
  // 7.0:1 in dark: still plainly not the live copy, and still a row. Light is
  // the side that constrains this, dark was most of a point better at both
  // numbers and would have hidden the defect on its own.
  //
  // Higher than the 50 `sortable` and `kanban` put on a dragged item, because
  // those dim a card or a chip - a block with a line of text on it - and this
  // is three cells of 12px text with a pair of controls after them. What no
  // alpha worth the name can fix is the muted secondary text, 4.74:1 at rest
  // and 2.30:1 here; that is the other half of why the blur had to go.
  //
  // AND NO BLUR. It was the only CSS filter on a drag source in the registry -
  // the calendar fades its chip and stops, the gantt fades a resize and hides
  // a move outright - and it was a third thing saying what the fade, the carry
  // on the pointer and the grabbing cursor already say between them. A
  // `filter` also makes its element a containing block for fixed descendants
  // and a stacking context of its own, which is the hazard `createCarry` in
  // `filters-dnd` warns about and would scope the insertion rule's own `z-10`
  // to the row wearing it. Both are latent today; neither is worth carrying
  // for a third copy of one fact.
  "relative rounded-md",
  "data-dragging:opacity-60",
  // THE INSERTION LINE: a rule ACROSS the list at the boundary the row lands on.
  //
  // It was a dashed box the size of a row, which answered "what" as well as
  // "where" and cost more than the second answer was worth: with no space
  // opened for it, a row-sized box has to overlay a real row, so the picture
  // was always two rows in one place. A separator has nothing to overlay - it
  // lives in the gap, which is empty by definition - so the list stays legible
  // for the whole gesture and the only thing added is the one fact the user is
  // choosing.
  //
  // PRIMARY, and this is the one place the accent belongs. A 2px rule is a
  // small mark; neutral, it reads as one of the panel's own dividers rather
  // than as something live. Nothing else on screen during a drag is accented -
  // the carry is a plain copy and the source is faded - so there is no
  // competition for what the colour means.
  //
  // ITS TWO ENDS ARE THE DESTINATION LIST'S TWO ENDS. A row's own box IS the
  // box of the list it belongs to - the body at the top level, a group's
  // `TRACK_CONTAINER_CLASS` at every depth below it, since indentation is the
  // CARD's own padding and the track sits inside it with none of its own - so
  // `start-0` is that list's leading edge by construction: at depth zero and
  // at depth three, and on both sides of the 26rem breakpoint where the
  // combinator gutter drops onto a line of its own.
  //
  // `end-1` AND NOT `end-0`, which is the whole of the "the line sits a little
  // to the right" fix. Those four pixels are `ACTION_BAND_CLASS`'s `pe-1`:
  // every row at every depth spends them after its kebab, so a list's content
  // edge is four pixels PAST the column of kebabs, and a rule drawn to it
  // overhung the one vertical axis this layout is built around while starting
  // flush on the other. Ending on the kebab column is the same alignment the
  // footer buys with its own `pe-[calc(var(--filter-panel-pad)+4px)]` - see
  // `FOOTER_DROP_CLASS`, whose rule has to land on these exact two edges.
  //
  // LOGICAL and not `inset-x-*`: the leading edge is the combinator's and the
  // trailing edge is the kebab's, and in RTL the two swap sides.
  "data-drop-edge:after:absolute",
  "data-drop-edge:after:start-0 data-drop-edge:after:end-1",
  "data-drop-edge:after:h-0.5 data-drop-edge:after:rounded-full",
  "data-drop-edge:after:bg-primary",
  // Above whatever it crosses, so a row's own border never cuts through it.
  "data-drop-edge:after:z-10",
  // CENTRED IN THE GAP. The line names the boundary between two rows, and the
  // middle of the gap is where that boundary is; offset by half the gap less
  // half the rule's own height so it sits on the axis rather than beside it.
  "data-[drop-edge=before]:after:bottom-full",
  FILTER_ROW_HALF_GAP_CLASS.before,
  "data-[drop-edge=after]:after:top-full",
  FILTER_ROW_HALF_GAP_CLASS.after,
  // NOTHING on the source but the fade it already wears.
  //
  // It used to take a neutral dashed outline whenever the release would change
  // nothing, which drew a box around a row that has no box at rest - and during
  // the one gesture where a second dashed rectangle is most confusing, since
  // the slot is dashed too. "It stays here" is already said by there being no
  // slot drawn anywhere, and the carry says it again with its own invalid ring.
)

/**
 * A CONDITION row draws exactly what a group's row draws: the slot, and nothing
 * else.
 *
 * It used to add a faint dashed outline around itself, to answer "beside what"
 * while the pad answered "where". That was worth it while the pad was a
 * sliver. Now that the slot is row-sized and row-wide, the outline is a SECOND
 * dashed rectangle of nearly the same dimensions, a few pixels from the first,
 * saying something the first already says - and two dashed shapes stacked is
 * the whole of what made the gesture look noisy. One shape, one answer.
 */
const DROP_INDICATOR = DROP_SLOT_INDICATOR

/**
 * How the panel's own footer says "append to the top level".
 *
 * The same RULE the rows draw, at the top of the strip, because that is where a
 * row appended to the root lands. Not the card language: the root list has no
 * card to outline, and outlining the strip would put a dashed box around the
 * two Add buttons and say the row is going inside one of them.
 *
 * `data-drop-into` rather than `data-drop-edge`, because an explicit zone is
 * reported as a DESTINATION rather than as an insertion beside something - see
 * `paint` in `filters-dnd`.
 *
 * ITS TWO ENDS ARE THE ROWS' TWO ENDS, spelled with the strip's own padding.
 * An absolutely positioned pseudo-element resolves `inset` against its
 * container's PADDING box, so `inset-x-0` here drew the panel's full width:
 * twelve pixels past every rule above it on each side in popover mode, three
 * lines that have to share two edges and did not. There is no way to say
 * "the content box" in one utility, so the two paddings the strip already
 * wears are restated - the gutter on the leading edge, the gutter plus the
 * action band's four pixels on the trailing one, which is exactly where a
 * row's rule now ends (see `DROP_SLOT_INDICATOR`). Written against the
 * VARIABLE and not as literals, so they stay right in both modes rather than
 * becoming stray inset the moment the inline panel drops its gutter to zero -
 * which is what the `inset-x-4` this comment used to claim would have been.
 */
const FOOTER_DROP_CLASS = cn(
  "data-drop-into:after:absolute",
  "data-drop-into:after:start-(--filter-panel-pad)",
  "data-drop-into:after:end-[calc(var(--filter-panel-pad)+4px)]",
  "data-drop-into:after:top-0 data-drop-into:after:h-0.5",
  "data-drop-into:after:rounded-full data-drop-into:after:bg-primary"
)

/**
 * The cells a row owns ITSELF.
 *
 * A group's row element contains its children's rows, so a bare
 * `querySelectorAll` inside it would return the whole subtree's cells and make
 * ArrowRight from a group header walk into its first condition.
 */
function ownCells(row: HTMLElement): HTMLElement[] {
  return Array.from(
    row.querySelectorAll<HTMLElement>(`[${CELL_ATTRIBUTE}]`)
  ).filter((cell) => cell.closest<HTMLElement>(ROW_SELECTOR) === row)
}

/* -------------------------------------------------------------------------- */
/*                                Shared cells                                */
/* -------------------------------------------------------------------------- */

interface RowPosition {
  /** Position among the parent group's own children. */
  index: number
  /** The parent group's id, for insert, move and combinator writes. */
  parentId: string
  /** The parent group's combinator, passed DOWN rather than subscribed to. */
  combinator: FilterCombinator
  /** Nesting level, 1 at the root. Carried into the accessible name. */
  depth: number
}

/**
 * The leading and/or slot.
 *
 * SQL-standard rather than per-row mixing: one group is joined by ONE operator,
 * so the first row reads "Where", the second is the control, and every later row
 * echoes the word as static text. Three editable "and"s down a column would
 * imply three independent choices, and a query that mixed them would need
 * precedence rules this model deliberately does not have. Mixing is what a
 * nested group is FOR.
 *
 * Which makes the two static slots a design problem rather than a detail: they
 * sit in the same column as a real control, and a word that looks pressable and
 * is not is worse than no affordance at all. They are drawn as plain muted text
 * with no box at all, and the one that acts is the one wearing an outline - the
 * only box in the column, under a pointer and a focus ring that the two words
 * never take.
 */
function CombinatorCell({
  index,
  parentId,
  combinator,
  active,
  onFocus,
  className,
}: {
  index: number
  parentId: string
  combinator: FilterCombinator
  active: FilterColumn | null
  onFocus: (column: FilterColumn) => () => void
  /** Only a group passes one, to hold its width when its wrapper wraps. */
  className?: string
}) {
  const actions = useFilterActions()
  const sizes = filterControlSizes(actions)
  const slot = filterCombinatorSlot(index)
  const word = combinator === "and" ? actions.labels.and : actions.labels.or

  if (slot === "where") {
    return (
      <span className={cn(COMBINATOR_TEXT_CLASS, className)}>
        {actions.labels.where}
      </span>
    )
  }

  if (slot === "echo") {
    return <span className={cn(COMBINATOR_TEXT_CLASS, className)}>{word}</span>
  }

  const name = actions.labels.combinatorLabel(word)

  return (
    <Button
      variant="outline"
      size={sizes.button}
      // The WORD is in the name, not just the action. The track is fixed and no
      // fixed track fits every language, so a locale whose word overflows draws
      // "a..." - and a name of "Change combinator" alone would leave a pointer
      // user unable to find out which of the two words it says. The `title` is
      // the same sentence for the same reason the cells beside it carry one.
      aria-label={name}
      title={name}
      disabled={actions.disabled}
      {...filterReadOnlyProps(actions)}
      // NO GLYPH, and no chevron either. A caret would promise a list that a
      // two-value toggle does not have, and the swap glyph that stood in for one
      // cost more than it said: `justify-center` centres the word and the glyph
      // TOGETHER, so the word sat 10px left of the two static words below it in
      // the same column - the ragged column `COMBINATOR_TEXT_CLASS` is written
      // to prevent. With one child the word centres on the column's own axis at
      // 0.00px, at every style and every width.
      //
      // What the glyph said is said twice over without it: the pill is the only
      // OUTLINED thing in the column, which is what marks it as the one that
      // acts, and `aria-label` and `title` both spell out the word plus the
      // action for anyone the outline does not reach. It also buys back 20px of
      // a 64px track, which is 20px more of a long translation drawn rather
      // than truncated.
      className={cn(
        "group/combinator relative w-full min-w-0 justify-center px-1.5 font-normal",
        SERA_TEXT_CLASS,
        className
      )}
      {...cellProps("combinator", active)}
      onFocus={onFocus("combinator")}
      onClick={() => actions.toggleCombinator(parentId)}
    >
      <span className="truncate">{word}</span>
      {/*
        The swap glyph, ABSOLUTELY POSITIONED, which is the whole reason it can
        exist again.

        It was removed once and the reason still stands: `justify-center`
        centres everything it is given, so a word beside a glyph centres the
        PAIR and leaves the word about 10px left of the two static words below
        it in the same column - a ragged column down a five-row group. An
        absolute box is painted rather than laid out, so the word still centres
        on the column's own axis at 0.00px and the glyph says what the outline
        alone had to imply: this one is a toggle, and pressing it swaps.

        Hover and focus only. At rest the column stays the three quiet words it
        was, and the affordance appears exactly when a pointer or a keyboard is
        addressing it. It is `aria-hidden` because the name already says
        "change combinator" in words.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute end-1 opacity-0 transition-opacity",
          "group-hover/combinator:opacity-60",
          "group-focus-visible/combinator:opacity-60",
          "[&_svg]:size-3"
        )}
      >
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={2}
        />
      </span>
    </Button>
  )
}

/**
 * The drag handle, shared by a rule row and a group header.
 *
 * It survived the cull of the trailing cluster - three icons per row and four
 * per group header, which is what made the builder read as overloaded - and it
 * survived on merit rather than habit. The handle is what ARMS the gesture: the
 * row cannot, because arming the row turns every text selection inside it into a
 * drag. And the handle is the only thing a screen reader can be told about, so
 * it is a real button with a name, which is why Alt+arrow reordering hangs off
 * this element rather than off a `draggable` attribute no keyboard can reach.
 *
 * What DID change is that it now reads as chrome. Muted at rest and full
 * strength under the pointer or a focus ring, it sits beside the one remaining
 * action rather than competing with it, and it is the same width at every depth
 * so the kebab after it lines up with the kebab in the panel's own header.
 */
/**
 * Whether dragging this node could change the tree at all.
 *
 * The grip is drawn only when the answer is yes, because a handle that cannot
 * accomplish anything is an affordance that lies: it invites a gesture, accepts
 * the press, and puts the row back exactly where it was.
 *
 * The predicate is small because the geometry collapses. Every drop destination
 * that is not the panel's own footer zone lives INSIDE some row's element, and
 * the drop layer discards any destination inside the row being dragged. So:
 *
 *  - A node whose parent is NOT the root always has somewhere to go, because
 *    the root's footer zone is never inside it. It can always move out to the
 *    top level, even when it is the only child of the only group.
 *  - At the root with two or more children, some sibling slot is always a real
 *    move, whichever child is being dragged.
 *  - The sole child of the root is the one case with nowhere: every group zone
 *    and every other row is a descendant of it and therefore excluded, and the
 *    only slots left - the footer's, and its own two edges - all name the
 *    position it already occupies.
 *
 * Deliberately a pure function of the QUERY, and deliberately blind to
 * `disabled` and `readOnly`. A locked bar keeps its grip, disabled and
 * announced, because "you may not move this" and "there is nowhere to move it"
 * are different sentences and a reader is owed the right one.
 *
 * ONE capability is lost with the grip, on that single row only: Alt+drag
 * copies in place, which is not a no-op. `Duplicate` in the row's own menu is
 * the same edit and is always there.
 */
function canFilterNodeMove(
  query: FilterQuery<unknown>,
  position: { parentId: string }
) {
  if (position.parentId !== query.id) return true
  return query.rules.length > 1
}

/**
 * The error, as a QUIET mark the pointer can ask about.
 *
 * A ring around the offending cell was the whole treatment, and it is a shout:
 * two destructive pixels plus destructive text on a row the user may be halfway
 * through. It also had nothing to say without a hover, and what it said came
 * through the native `title` - an OS tooltip with a second's delay, no styling
 * and no icon.
 *
 * So the ring stays but goes quiet (one pixel, no repainted text) and the
 * sentence moves into a real tooltip hung off a small icon in the row's own
 * action band. One icon per ROW rather than one per cell: a row carries at most
 * one issue, and a glyph that moves between cells depending on which half is
 * unfinished is a glyph whose position means nothing.
 *
 * `aria-describedby` is NOT how the sentence reaches a screen reader - the cell
 * already carries it as `aria-description`, which is read with the cell that is
 * actually wrong. This icon is `aria-hidden` for exactly that reason: it is the
 * pointer's route to a sentence the keyboard already has, and announcing it
 * twice is how a row starts saying everything two ways.
 */
function RowIssueHint({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  if (!message) return null
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              data-slot="filter-row-issue"
              // Focusable so a pointer-less user who arrows onto the row can
              // still summon it, but OUT of the tab order: the sentence is
              // already on the invalid cell, so this must not become a second
              // stop between the value and the kebab.
              tabIndex={-1}
              aria-hidden="true"
              className={cn(
                "text-destructive flex shrink-0 items-center justify-center [&_svg]:size-3.5",
                className
              )}
            >
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2}
              />
            </span>
          }
        />
        <TooltipContent side="top">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function RowHandle({
  nodeId,
  active,
  onFocus,
}: {
  nodeId: string
  active: FilterColumn | null
  onFocus: (column: FilterColumn) => () => void
}) {
  const actions = useFilterActions()
  const sizes = filterControlSizes(actions)
  const dragProps = React.useContext(FilterDragContext)
  const locked = isFilterLocked(actions)

  return (
    <Button
      variant="ghost"
      size={sizes.icon}
      aria-label={actions.labels.reorder}
      // The handle's activation is the DRAG, which no click performs, so
      // without these a screen reader finds a "Reorder" button that appears
      // broken: pressing it does nothing and nothing on it says Alt+Arrow
      // exists. `aria-keyshortcuts` names the keys in the machine-readable
      // form and the description says it in the user's own language.
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      aria-description={actions.labels.reorderHint}
      disabled={actions.disabled}
      {...filterReadOnlyProps(actions)}
      // `touch-none` so a finger on the handle never becomes a page scroll
      // the gesture then has to fight. It is scoped to the handle, so the panel
      // around it still scrolls under a finger exactly as before.
      //
      // Muted at rest, not hidden. A grip that appears on hover is a grip a
      // touch user never finds, and this is the only pointer route into
      // reordering.
      //
      // The muting is INHERITED from the trailing cluster rather than set here,
      // and that is the point: the grip used to be `text-muted-foreground/60`
      // beside a kebab wearing the full foreground, so a pair that is one piece
      // of chrome read as one loud dot and one quiet one. Both now take the
      // cluster's weight, and only hover and focus lift either of them.
      className={cn(
        "focus-visible:text-foreground cursor-grab touch-none",
        "active:cursor-grabbing",
        ACTION_CONTROL_CLASS
      )}
      {...cellProps("drag", active)}
      onFocus={onFocus("drag")}
      // A drag has nothing to read, so the gesture is simply not armed while
      // locked - unlike the cells around it, which stay operable enough to be
      // walked. The engine refuses it a second time from its own `disabled`
      // option, and `moveNodeTo` a third at the boundary.
      {...(locked ? null : dragProps?.(nodeId))}
    >
      <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2}
      />
    </Button>
  )
}

/**
 * Which cell of a row owns the builder's single tab stop.
 *
 * The fallback matters as much as the hit: an operator change can take the value
 * column away from under a focus that was pointing at it, and a builder with no
 * tabbable cell at all is one the keyboard cannot re-enter.
 */
function useActiveColumn(
  nodeId: string,
  columns: FilterColumn[],
  isFirstRow: boolean
): FilterColumn | null {
  const focused = useFilterChipFocused(nodeId)
  const segment = useFilterSegmentFocus(nodeId)
  const noFocus = useFilterFocusEmpty()

  if (focused) {
    return segment && columns.includes(segment as FilterColumn)
      ? (segment as FilterColumn)
      : columns[0]
  }
  return noFocus && isFirstRow ? columns[0] : null
}

/** The issue on one node, if the panel found one. */
function useFilterIssue(nodeId: string): FilterIssue | undefined {
  return React.useContext(FilterIssueContext).get(nodeId)
}

/* -------------------------------------------------------------------------- */
/*                              Inline free text                              */
/* -------------------------------------------------------------------------- */

/**
 * Whether a value is FREE TEXT, and therefore typed in the row itself.
 *
 * The builder's rows are wide, permanent and already a form, so a value the user
 * has to type belongs in the row: opening a popover to reach one text box is a
 * click and a surface for nothing. The CHIP row keeps its popover for every
 * value, deliberately and on the owner's instruction, which is why this test
 * lives here and not in the shared display hook - the two chromes are supposed
 * to disagree about this one thing.
 *
 * The test mirrors `resolveFilterEditor` rather than guessing, so a value that
 * qualifies here is exactly a value the built-in text editor would have drawn:
 *
 *  - a field with its own `editor` owns its surface, whatever it is;
 *  - an option-backed field opens a list, and a list is not typing;
 *  - `range` needs two boxes and `none` needs none, so only `one` is inline;
 *  - a custom display (`renderValue`, `valueText`, or the root's `renderValue`)
 *    draws avatars, dots or a formatted token, and an input showing the raw
 *    string underneath it would contradict what the row shows everywhere else.
 *
 * NUMBER is included, and the parse failure that used to exclude it is handled
 * rather than avoided. "1e", "-" and "" all reach `Number()` mid-keystroke, so a
 * blur could have written `NaN` into the query or silently cleared a value for
 * someone who just clicked away while typing. The cell now REJECTS AND REVERTS:
 * an empty box clears the value, which is a state the panel already reports, and
 * anything that will not parse snaps back to the last committed number. The snap
 * is the feedback - a draft left sitting uncommitted would look accepted - and
 * it is the same motion Escape already makes, so the cell has one rule for
 * "that did not take" rather than two.
 *
 * This is deliberately not a validation message yet. A reason code for it would
 * be a sixth `FilterIssueReason`, and the consumer-validator work will want to
 * raise exactly that, so it is added there once rather than here twice.
 *
 * THE STEPPED FLOW reaches this cell through the same handoff the popovers
 * honour. Choosing a condition parks "the value is next" in the focus store,
 * and where a popover surface answers that by opening, the cell below answers
 * it by taking the caret. That is what removes a popup from the sequence rather
 * than merely moving it: on a text or number row there is no value popup left
 * to anchor wrongly or to crossfade with the menu it replaced.
 */
function usesInlineTextEditor<V, O>(
  field: FilterField<V, O>,
  operator: FilterOperator | undefined,
  hasCustomDisplay: boolean
): boolean {
  if (field.editor) return false
  if (field.options || field.loadOptions) return false
  if (field.renderValue || field.valueText || hasCustomDisplay) return false
  const type = field.type ?? "text"
  if (type !== "text" && type !== "number") return false
  return getFilterArity(operator) === "one"
}

/**
 * The value cell as a real text box.
 *
 * COMMIT IS BLUR AND ENTER, and nothing else. The alternatives were both worse:
 *
 *  - Committing per keystroke makes the ROOT the source of truth for every
 *    character. A controlled consumer re-renders its whole page per letter, and
 *    `onQueryChange` becomes a change log of every prefix the user ever typed -
 *    which is what a saved-view autosave or an analytics pipe would faithfully
 *    persist.
 *  - Debouncing only moves that: it still emits mid-word states, just fewer of
 *    them, and it adds a window in which the cell on screen and the query in the
 *    consumer's hands disagree with no event to say so.
 *
 * So the draft is LOCAL and the query hears about it once. Escape reverts to the
 * committed value, which is the same contract the popover editor's cancel has,
 * and the sync below keeps an external change (a reset, a loaded view) winning
 * over a stale draft.
 */
function FilterInlineValueCell<V, O>({
  rule,
  field,
  issue,
  issueText,
  active,
  onFocus,
}: {
  rule: FilterRule<V>
  field: FilterField<V, O>
  issue: FilterIssue | undefined
  issueText: string
  active: FilterColumn | null
  onFocus: (column: FilterColumn) => () => void
}) {
  const actions = useFilterActions<V, O>()
  const focusStore = useFilterFocusStore()
  const locked = isFilterLocked(actions)
  const numeric = (field.type ?? "text") === "number"
  // The same handoff the value POPOVER honours, answered the way an inline
  // control can answer it. "Open the value editor" and "put the caret in the
  // value box" are one instruction to two different surfaces, so the stepped
  // flow needs no second signal and this row needs no popup: choosing a
  // condition on a text or number row lands the user in the box they were
  // about to type into.
  const autoOpen = useFilterChipAutoOpen(rule.id) === "value"
  const inputRef = React.useRef<HTMLInputElement>(null)

  const committed =
    rule.value === undefined || rule.value === null ? "" : String(rule.value)
  const [draft, setDraft] = React.useState(committed)
  // The committed value this draft was last seeded from. STATE and not a ref,
  // deliberately: the sync below runs during render, and a ref written while
  // rendering is both what the lint rule forbids and what breaks under the
  // React Compiler's memoization.
  const [seed, setSeed] = React.useState(committed)

  // Adjusting state during render, which is React's own answer to "reset a
  // control when a prop changes" and is why there is no effect here: an effect
  // would paint the stale text for one frame first. It fires ONLY when the
  // committed value actually changes, so typing - which changes the draft and
  // not the value - can never be clobbered by it, and committing re-runs it
  // with the string it just wrote.
  if (seed !== committed) {
    setSeed(committed)
    setDraft(committed)
  }

  // CONSUMED as it is honoured, exactly as the two popovers consume theirs and
  // for the identical reason: a flag left standing is spent by whichever row
  // renders next, and a box that takes the caret because a DIFFERENT row was
  // stepped through is worse than one that takes nothing. Consumed even when
  // the bar refuses, so a read-only row cannot leave one armed behind it.
  React.useEffect(() => {
    if (!autoOpen) return
    if (!locked) {
      const input = inputRef.current
      input?.focus()
      // SELECTED, not merely focused. The condition step may have coerced a
      // value across from the previous arity, so the box can arrive holding
      // text the user is about to replace rather than extend.
      input?.select()
    }
    focusStore.set({ id: rule.id, segment: "value", autoOpen: false })
  }, [autoOpen, locked, focusStore, rule.id])

  const commit = () => {
    if (draft === seed) return

    if (numeric) {
      const text = draft.trim()
      // Empty clears, rather than writing 0. A number field with no value is
      // exactly the `missing-value` the panel already reports, so clearing lands
      // in a state the chrome can describe; `0` would be a filter the user never
      // asked for and one that silently matches rows.
      if (text === "") {
        actions.updateRule(rule.id, { value: undefined as V })
        return
      }
      const parsed = Number(text)
      // Revert, do not write. `Number("1e")` and `Number("-")` are both NaN, and
      // a NaN in the query compares false against every row while looking like a
      // filter that is doing something.
      if (!Number.isFinite(parsed)) {
        setDraft(seed)
        return
      }
      actions.updateRule(rule.id, { value: parsed as V })
      return
    }

    actions.updateRule(rule.id, { value: draft as V })
  }

  return (
    /*
      A FRAGMENT, not a wrapper. The error is painted over the box's trailing
      edge, and the positioning context is the CELL itself - which already
      exists and already carries the column's basis. An extra div here would
      insert a layer between the cell and its control, and the cell's width
      contract is measured on the element directly around it.

      The input keeps its own `h-full` and its own borders: it IS the shadcn
      control, at whatever height the style resolved for the buttons beside it.
      Padding is added only when there is something to make room for, so an
      untouched field is the same box it always was. Any richer editor - a date
      picker, a slider - renders in the same cell and gets the same mark.
    */
    <>
    <Input
      ref={inputRef}
      // The FIELD is the name, not the value. Every other cell in the row is a
      // button whose name says what it holds, because pressing it is how you
      // find out more; this one is a box, and the question a box has to answer
      // before it is typed into is what it is for.
      aria-label={field.label}
      placeholder={field.placeholder ?? actions.labels.valuePlaceholder}
      // The RIGHT KEYPAD on a phone, and nothing more. `type="number"` would
      // bring spinners that no other cell in the row has and a browser-level
      // parse that silently drops what it dislikes; `inputMode` changes the keys
      // offered and leaves this file the only thing deciding what a number is.
      inputMode={numeric ? "decimal" : undefined}
      value={draft}
      // `h-full` and no size class of its own. `cn-input` carries ONE height per
      // style with no size variants, so at `size="sm"` an input beside a `sm`
      // button was a pixel taller in nova and two in sera. The cell stretches to
      // the row (`self-stretch` on the wrapper), the row is as tall as the
      // buttons in it, so the box matches whatever the style resolved for them
      // without this file naming a height.
      className={cn("h-full", issueText && "pe-7", CELL_INVALID_CLASS)}
      // Native `readOnly`, and it is NOT the native `disabled` the contract
      // rules out. Read only is exactly what this attribute means: the box keeps
      // its tab stop, its text stays selectable and copyable, and it refuses to
      // change - which is the whole point of a read-only bar. `aria-disabled`
      // and `data-readonly` still ride along from the shared helper, so the cell
      // announces and styles itself like every other refusing control.
      readOnly={locked}
      disabled={actions.disabled}
      {...filterReadOnlyProps(actions)}
      {...cellProps("value", active)}
      {...{ [CELL_INPUT_ATTRIBUTE]: "" }}
      {...issueProps(issue, "value", issueText)}
      onFocus={onFocus("value")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          // Stopped as well as prevented: the panel may be living in a form, and
          // the builder's own walker is one node up.
          event.preventDefault()
          commit()
          return
        }
        if (event.key === "Escape") {
          // Only when there is something to revert. Otherwise Escape belongs to
          // whatever surface the builder sits in, and a popover that will not
          // close on Escape from a text cell is a trap.
          if (draft === seed) return
          event.preventDefault()
          event.stopPropagation()
          setDraft(seed)
        }
      }}
    />
      <RowIssueHint
        message={issueText}
        // Painted over the box's trailing edge, and `pointer-events-none` so a
        // click anywhere in the field still lands in the input; the glyph takes
        // the pointer back for itself so its tooltip opens.
        className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 [&>*]:pointer-events-auto"
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Rule row                                  */
/* -------------------------------------------------------------------------- */

export interface FilterAdvancedRowProps<V = unknown> {
  rule: FilterRule<V>
  position: RowPosition
}

function FilterAdvancedRowImpl<V, O>({
  rule,
  position,
}: FilterAdvancedRowProps<V>) {
  const actions = useFilterActions<V, O>()
  const render = useFilterRender<V, O>()
  const sizes = filterControlSizes(actions)
  const focusStore = useFilterFocusStore()
  const locked = isFilterLocked(actions)
  const { query } = useFilterState<V>()

  const field = getFilterField(actions.index, rule.path)
  const operators = field ? actions.resolveOperators(field) : []
  const operator = getFilterOperator(operators, rule.operator)
  const takesValue = Boolean(rule.operator) && operatorTakesValue(operator)
  const inlineValue =
    takesValue && field
      ? usesInlineTextEditor(field, operator, Boolean(render.renderValue))
      : false

  const issue = useFilterIssue(rule.id)
  const issueText = issue ? filterIssueLabel(issue, actions.labels) : ""

  const {
    pathText,
    pathLabel,
    pathCollapsed,
    operatorLabel,
    valueLabel,
    valueText,
    valueFullText,
    valueEmpty,
  } = useFilterRuleDisplay<V, O>(rule, field, operator)

  /* ------------------------------ field cell ------------------------------ */

  const fieldAutoOpen = useFilterChipAutoOpen(rule.id) === "field"
  const [pickerOpen, setPickerOpen] = React.useState(false)
  // Controlled so both can REFUSE to open while locked. See the chip's value
  // popover for why refusing beats opening an editor whose every write is a
  // no-op.
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Where the picker is BROWSING. Seeded from the rule's own level so amending
  // a nested attribute opens beside its siblings rather than at the root.
  const [pickerPath, setPickerPath] = React.useState<string[]>(() =>
    rule.path.slice(0, -1)
  )
  const [pickerQuery, setPickerQuery] = React.useState("")

  // A new row arrives with a GUESS at its field, so the one choice that is not
  // yet the user's own is the one that opens itself.
  //
  // CONSUMED as it is honoured, exactly as the chip's value popover consumes
  // its own handoff and for the identical reason. `pickerOpen` is a dependency,
  // so a flag left standing re-fired this effect the moment the popover closed
  // and reopened it in the same frame: Escape, four Escapes, and an outside
  // click all left the picker mounted with focus in its search box, and the
  // only way out of the panel's primary "Add condition" path was to commit a
  // field. A keyboard trap, on the one row a user creates most.
  //
  // Consumed even when the bar refuses to open, which is the same reason read
  // the other way round: a handoff nobody spends stays armed until some later
  // row spends it.
  React.useEffect(() => {
    if (!fieldAutoOpen || pickerOpen) return
    if (!locked) setPickerOpen(true)
    focusStore.set({ id: rule.id, segment: "field", autoOpen: false })
  }, [fieldAutoOpen, pickerOpen, locked, focusStore, rule.id])

  // Re-seed on each open, so a browse that was abandoned last time does not
  // decide where this one starts.
  React.useEffect(() => {
    if (!pickerOpen) return
    setPickerPath(rule.path.slice(0, -1))
    setPickerQuery("")
  }, [pickerOpen, rule.path])

  /* ------------------------------- tab stop ------------------------------- */

  const slot = filterCombinatorSlot(position.index)
  // Only the columns this row actually draws a control in.
  const reorderable = useFilterReorderable()
  const canMove = reorderable && canFilterNodeMove(query, position)
  const rowStateStore = useFilterRowStateStore()
  // Still waiting for its attribute. Until it has one there is no operator to
  // choose from and no value to enter, so neither cell is drawn.
  const pending = useFilterRowPending(rule.id)

  const columns = React.useMemo(() => {
    const list: FilterColumn[] = []
    if (slot === "toggle") list.push("combinator")
    list.push("field")
    if (!pending) {
      list.push("operator")
      if (takesValue) list.push("value")
    }
    // The grip is only a tab stop when it is drawn. A roving column that has no
    // element leaves the arrow keys stepping onto nothing.
    if (canMove) list.push("drag")
    list.push("menu")
    return list
  }, [slot, takesValue, canMove, pending])

  const active = useActiveColumn(
    rule.id,
    columns,
    position.depth === 1 && position.index === 0
  )

  const onCellFocus = React.useCallback(
    (column: FilterColumn) => () =>
      focusStore.set({ id: rule.id, segment: column, autoOpen: false }),
    [focusStore, rule.id]
  )

  /* -------------------------------- render -------------------------------- */

  // Every hook above runs unconditionally; the panel only renders this row for
  // a rule whose field resolves, and the narrowing is what lets the cells below
  // read the field without an assertion.
  if (!field) return null

  return (
    <div
      // A GROUP, not a grid row. The builder nests, and a grid whose rows sit at
      // four different depths is a grid no assistive technology can describe;
      // `role="group"` says what a row honestly is, a set of related controls,
      // and lets the accessible name carry the depth that indentation shows
      // sighted users and shows nobody else.
      role="group"
      aria-label={actions.labels.rowLabel(
        `${pathText} ${operatorLabel}`,
        position.depth
      )}
      data-slot="filter-row"
      data-node-id={rule.id}
      data-parent-id={position.parentId}
      data-index={position.index}
      data-depth={position.depth}
      className={cn("group/row", ROW_BAND_CLASS, DROP_INDICATOR)}
    >
      <div className={cn(COMBINATOR_CLASS, CELL_BOX_CLASS)}>
        <CombinatorCell
          index={position.index}
          parentId={position.parentId}
          combinator={position.combinator}
          active={active}
          onFocus={onCellFocus}
        />
      </div>

      {/*
        THE CONTENT BAND. Everything that describes the condition, packed
        against the leading edge and sized to itself rather than to a share of
        the row. See `CONTENT_BAND_CLASS` and `CELL_WIDTH_VARS`.
      */}
      <div className={CONTENT_BAND_CLASS}>
        <div className={cn(CELL_BOX_CLASS, FIELD_CELL_CLASS)}>
          <Popover
            open={pickerOpen}
            onOpenChange={(next) => {
              if (next && locked) return
              setPickerOpen(next)
            }}
          >
            <PopoverTrigger
              disabled={actions.disabled}
              {...filterReadOnlyProps(actions)}
              render={
                <Button
                  variant="outline"
                  size={sizes.button}
                  // The path is truncated on screen, so the accessible name
                  // carries the whole of it. "Primary loca... > State" is not a
                  // field anyone can identify.
                  aria-label={pathText}
                  // And the same string as a `title`, which is the chip's own
                  // answer to the identical problem. A row two groups deep in the
                  // popover chrome gets about 50px of text, so "Am..." is the
                  // normal case rather than the edge one, and a name only a
                  // screen reader can reach leaves the sighted mouse user with no
                  // way at all to find out which attribute the row filters.
                  //
                  // Unless the path is COLLAPSED, in which case the ellipsis
                  // inside carries a tooltip with this exact sentence and the two
                  // would fire under one pointer.
                  title={pathCollapsed ? undefined : pathText}
                  className={CELL_CLASS}
                  {...cellProps("field", active)}
                  onFocus={onCellFocus("field")}
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {field.icon}
                    <span className="truncate">{pathLabel}</span>
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2}
                  />
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className={cn(
                FILTER_FIELD_PICKER_CLASS,
                actions.fieldPickerClassName
              )}
            >
              <FilterFieldPicker<V, O>
                path={pickerPath}
                onPathChange={setPickerPath}
                query={pickerQuery}
                onQueryChange={setPickerQuery}
                onSelect={(path, defaultOperator) => {
                  setPickerOpen(false)
                  // BUILDING versus AMENDING, and the fork is the whole of the
                  // stepped flow. `pending` is this render's value, read before
                  // the resolve below clears it, so it still answers which of
                  // the two this pick is.
                  //
                  // Building hands off to the condition, the way the chip flow
                  // hands a chip it just created to its own operator menu. It
                  // is written BEFORE the early return for the same reason the
                  // resolve is: picking the guessed attribute is still an
                  // answer, and the next question has to open either way.
                  // Naming `operator` as the segment also retires the field
                  // handoff, because a consumer reads one segment at a time, so
                  // the picker cannot re-open itself behind the menu.
                  //
                  // Amending opens nothing. Re-choosing the attribute on a
                  // finished row is one cell of a form rather than a step of a
                  // wizard, and a menu that appeared every time the user
                  // checked which field the row was on would be chrome nobody
                  // asked for.
                  focusStore.set({
                    id: rule.id,
                    segment: pending ? "operator" : "field",
                    autoOpen: pending,
                  })
                  // The attribute is answered, so the rest of the row appears.
                  // BEFORE the same-path early return below: a row minted on a
                  // guessed field whose user picks that very field has still
                  // answered the question, and leaving it pending would strand
                  // it with one cell and no way to finish.
                  rowStateStore.resolvePending(rule.id)
                  // Re-picking the field it already has is a dismissal, not an
                  // edit: resetting the condition and the value the user just
                  // typed would punish them for checking.
                  if (joinFilterPath(path) === joinFilterPath(rule.path)) return
                  // A field change invalidates both. "Status is Active" cannot
                  // keep either half when the field becomes "Created at".
                  //
                  // On the create path the condition stays UNSET rather than
                  // taking the field's default, so the menu opening next has
                  // nothing selected and every row in it walks on to the value.
                  // A default here would pre-answer the step the flow exists to
                  // ask.
                  actions.updateRule(rule.id, {
                    path,
                    operator: pending ? "" : (defaultOperator ?? ""),
                    value: undefined,
                  })
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {pending ? null : (
        <div className={cn(CELL_BOX_CLASS, OPERATOR_CELL_CLASS)}>
          <FilterOperatorPopover
            rule={rule}
            field={field}
            trigger={
              <Button
                variant="outline"
                size={sizes.button}
                // No `aria-label`: the label IS the name, and it is the one cell
                // whose text is already a complete sentence fragment. The `title`
                // is still worth having, because "is greater than or equal to"
                // does not fit a nested row at any width this popover offers.
                title={operatorLabel}
                className={cn(
                  CELL_CLASS,
                  CELL_INVALID_CLASS,
                  "text-muted-foreground"
                )}
                {...cellProps("operator", active)}
                {...issueProps(issue, "operator", issueText)}
                onFocus={onCellFocus("operator")}
              >
                <span className="truncate">{operatorLabel}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2}
                />
              </Button>
            }
          />
        </div>
        )}

        {/*
          The cell stays even when the operator takes no value, holding nothing.
          Dropping it would shift the trailing buttons into the value column on
          that row alone, and rows at one depth that disagree about their column
          count do not line up.

          It goes ENTIRELY while the row is pending, which is the one case that
          argument does not cover: a row still choosing its attribute has no
          column count to agree with, and reserving two empty tracks beside the
          picker would draw the very controls the staging exists to withhold.

          `self-stretch` is what lets the inline box match the buttons beside it:
          it makes this cell as tall as the row, and the row is as tall as the
          tallest control in it, so `h-full` inside resolves to the style's own
          button height with no number written down anywhere.
        */}
        {pending ? null : (
        <div
          className={cn(
            CELL_BOX_CLASS,
            VALUE_CELL_CLASS,
            // The positioning context for an inline editor's error mark.
            "relative",
            "self-stretch"
          )}
        >
          {takesValue ? (
            inlineValue ? (
              <FilterInlineValueCell<V, O>
                rule={rule}
                field={field}
                issue={issue}
                issueText={issueText}
                active={active}
                onFocus={onCellFocus}
              />
            ) : (
              <FilterValuePopover
                rule={rule}
                field={field}
                operator={operator}
                trigger={
                  <Button
                    variant="outline"
                    size={sizes.button}
                    // The VALUE is the name here, never the attribute: labelling
                    // the cell "Description" would announce the column where a
                    // reader needs to hear what it was set to. Spelled out rather
                    // than left to the contents, because a field's `renderValue`
                    // draws avatars or dots and a name read off those is "plus two".
                    //
                    // Locked, the name grows to the whole list, for the reason on
                    // the chip's copy of this: a cell that cannot open its editor
                    // has to say in its name what opening it would have shown, and
                    // "3 selected" names none of the three. The `title` says it in
                    // every mode, because a cell this narrow truncates anyway.
                    aria-label={locked ? valueFullText : valueText}
                    title={valueFullText}
                    className={cn(
                      CELL_CLASS,
                      CELL_INVALID_CLASS,
                      "h-full",
                      valueEmpty && "text-muted-foreground"
                    )}
                    {...cellProps("value", active)}
                    {...issueProps(issue, "value", issueText)}
                    onFocus={onCellFocus("value")}
                  >
                    {/*
                      FREE OUTPUT. Whatever the field draws goes here - a
                      string, a row of avatars, coloured dots, a date range -
                      and the control around it is the shell that makes it read
                      as a form control at the style's own height.
                    */}
                    <span className="min-w-0 flex-1 truncate text-start">
                      {valueLabel}
                    </span>
                    {/*
                      The error, INSIDE the control that failed. It used to sit
                      out in the action band beside the kebab, which put the
                      message next to the row's chrome rather than next to the
                      thing it is about.
                    */}
                    <RowIssueHint message={issueText} />
                  </Button>
                }
              />
            )
          ) : null}
        </div>
        )}
      </div>

      {/*
        ONE action, and a grip beside it.

        The row used to end in a kebab, a trash and a handle, so every condition
        offered three things to press and the one that mattered was the middle
        one. The trash was pure duplication - the menu it sits beside has always
        carried a destructive Remove - so deleting it cost nothing and bought the
        row back its reading order: attribute, condition, value, and nothing
        else competing with them.

        The WEIGHT is set here, on the cluster, rather than on either control.
        A `ghost` button names no colour, so the kebab resolved to the full
        `--foreground` - the heaviest ink on the row, tied with the field label
        and heavier than the value it sits beside, drawn once per row down a
        column at the panel's right edge. Muting the pair together is what makes
        it read as chrome; each button still lifts to full strength under a
        pointer or a focus ring, so nothing is hidden, only quiet.
      */}
      <div className={ACTION_BAND_CLASS}>
        {canMove ? (
          <RowHandle nodeId={rule.id} active={active} onFocus={onCellFocus} />
        ) : null}
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(next) => {
            if (next && locked) return
            setMenuOpen(next)
          }}
        >
          <DropdownMenuTrigger
            disabled={actions.disabled}
            {...filterReadOnlyProps(actions)}
            render={
              <Button
                variant="ghost"
                size={sizes.icon}
                aria-label={actions.labels.chipMenu(field.label)}
                className={ACTION_CONTROL_CLASS}
                {...cellProps("menu", active)}
                onFocus={onCellFocus("menu")}
              />
            }
          >
            <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={cn(FILTER_MENU_CLASS, actions.menuClassName)}
          >
            {/*
              Grouping is offered HERE and not on a chip: wrapping a condition
              in a new group is the only way to nest one without dragging, and
              therefore the whole keyboard path to `a AND (b OR c)`.
            */}
            <FilterRuleMenuItems ruleId={rule.id} allowGrouping />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/**
 * One rule, as a row.
 *
 * Memoized for the same reason the chip is, and it holds for the same reasons:
 * the actions context is referentially stable, the focus store is subscribed
 * down to selected values, and the query tree shares structure, so editing one
 * row in a builder of twenty re-renders one row.
 */
export const FilterAdvancedRow = React.memo(
  FilterAdvancedRowImpl
) as typeof FilterAdvancedRowImpl

/**
 * A rule whose field the schema no longer has.
 *
 * Dropping it silently would lose a saved view's data on a schema change, and
 * rendering nothing leaves an invisible condition still filtering. It gets a
 * row of its own rather than a branch inside the real one, because every cell
 * in the real row needs a field to resolve anything at all.
 */
function FilterUnknownRow<V>({
  rule,
  position,
}: {
  rule: FilterRule<V>
  position: RowPosition
}) {
  const actions = useFilterActions()
  const sizes = filterControlSizes(actions)
  return (
    <div
      role="group"
      aria-label={actions.labels.rowLabel(
        rule.path.join(actions.labels.pathSeparator),
        position.depth
      )}
      data-slot="filter-row"
      data-node-id={rule.id}
      data-parent-id={position.parentId}
      data-index={position.index}
      data-depth={position.depth}
      data-unknown=""
      // The DROP language too, and it was the one row kind without it. The hit
      // test pushes every `[data-slot="filter-row"]` carrying `data-parent-id`
      // into the surface and this row carries both, so a drag aimed at the gap
      // beside it resolved a real destination while the panel showed nothing.
      // Outline and pseudo-element only, so it changes no box and no height.
      className={cn(ROW_BAND_CLASS, DROP_INDICATOR)}
    >
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
        {rule.path.join(actions.labels.pathSeparator)}
      </span>
      {/* The same trailing band every other row ends in, so the one row that is
          broken still lands on the column of kebabs rather than beside it. */}
      <div className={ACTION_BAND_CLASS}>
        <Button
          variant="ghost"
          size={sizes.icon}
          aria-label={actions.labels.remove}
          className={ACTION_CONTROL_CLASS}
          // Outside the roving scheme: a broken row is an error state, and giving
          // it a real tab stop is what keeps it removable at all.
          data-filter-cell="remove"
          // It had no gate at all, so the one row whose whole purpose is to be
          // removed could be removed from a bar that refuses every other edit.
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={() => actions.removeNode(rule.id)}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2}
          />
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Group                                   */
/* -------------------------------------------------------------------------- */

/**
 * A nested group: an indented card, its conditions, and one way to add another.
 *
 * THREE things were deleted from it, and the deletions are the design:
 *
 *  - the HEADLINE, a full-width button reading "Any of the following are
 *    true...". The combinator pill outside the card already says "or", so the
 *    headline said the same thing at ten times the width, and it was the widest
 *    control in the panel at every depth.
 *  - the header's PILE of icons - add, duplicate, delete, drag - which is what
 *    made the builder read as overloaded in the first place.
 *  - the footer's Delete group, which is now a row in the group's own menu
 *    where every other node-level action already lives.
 *
 * What is left is a card with a thin header that ends in the same grip and kebab
 * a rule row ends in, the conditions, and a footer that adds one. The header is
 * also the drop zone, which is the second reason it stays a strip rather than
 * collapsing into the first row.
 *
 * The group's accessible NAME still spells the combinator out ("All of the
 * following are true..., level 2"), because that sentence was the only thing the
 * headline said that a screen reader could not get from the pill beside it.
 */
function FilterAdvancedGroup<V, O>({
  group,
  position,
}: {
  group: FilterGroupNode<V>
  position: RowPosition
}) {
  const actions = useFilterActions<V, O>()
  const sizes = filterControlSizes(actions)
  const focusStore = useFilterFocusStore()

  const { query } = useFilterState<V>()

  const issue = useFilterIssue(group.id)
  const issueText = issue ? filterIssueLabel(issue, actions.labels) : ""

  const reorderable = useFilterReorderable()
  const canMove = reorderable && canFilterNodeMove(query, position)
  const rowStateStore = useFilterRowStateStore()

  const slot = filterCombinatorSlot(position.index)
  const columns = React.useMemo(() => {
    const list: FilterColumn[] = []
    if (slot === "toggle") list.push("combinator")
    // DOM order, which is what the arrow walker reads and what `columns[0]`
    // has to agree with: the group's own controls are all in its footer now,
    // add first and the trailing pair after it.
    list.push("add")
    if (canMove) list.push("drag")
    list.push("menu")
    return list
  }, [slot, canMove])

  const active = useActiveColumn(
    group.id,
    columns,
    position.depth === 1 && position.index === 0
  )

  const onCellFocus = React.useCallback(
    (column: FilterColumn) => () =>
      focusStore.set({ id: group.id, segment: column, autoOpen: false }),
    [focusStore, group.id]
  )

  const description =
    group.combinator === "and"
      ? actions.labels.groupAll
      : actions.labels.groupAny

  const addInto = () => {
    const id = addFilterRow(actions, group.id)
    if (!id) return
    // Same staging as the panel's own Add filter: attribute first.
    rowStateStore.markPending(id)
    focusStore.set({ id, segment: "field", autoOpen: true })
  }

  return (
    <div
      role="group"
      aria-label={actions.labels.groupLabel(description, position.depth)}
      data-slot="filter-row"
      data-node-id={group.id}
      data-parent-id={position.parentId}
      data-index={position.index}
      data-depth={position.depth}
      // `flex-wrap` is the whole of the narrow-panel fix, and it changes nothing
      // at the widths that already worked: the combinator is 4rem and the card
      // has a zero basis, so they share one line until the combinator is handed
      // a whole one. See `GROUP_COMBINATOR_WRAP_CLASS`.
      //
      // `items-center` and no top padding on the gutter, which is what "centre
      // the combinator with the group" has to mean once a group is taller than
      // a row. It used to be `items-start` plus a six-pixel nudge, so the pill
      // sat level with the card's first CONDITION - a measurement of the first
      // child rather than of the thing the word actually joins. Centring is
      // measured by the flex line, so it is the card's real height at every
      // depth and at every number of children, with nothing to keep in step.
      // When the gutter wraps onto its own line the pill is alone on that line
      // and centres against itself, which is a no-op.
      // `DROP_SLOT_INDICATOR` and not `DROP_INDICATOR`: this element wraps the
      // whole card, so the neighbour outline would draw the same rectangle
      // "into this group" draws. See `DROP_SLOT_INDICATOR`.
      className={cn("flex flex-wrap items-center gap-1.5", DROP_SLOT_INDICATOR)}
    >
      <div
        className={cn(
          COMBINATOR_CLASS,
          CELL_BOX_CLASS,
          GROUP_COMBINATOR_WRAP_CLASS
        )}
      >
        <CombinatorCell
          index={position.index}
          parentId={position.parentId}
          combinator={position.combinator}
          active={active}
          onFocus={onCellFocus}
          className={GROUP_COMBINATOR_WRAPPED_CLASS}
        />
      </div>

      {/*
        `data-slot="filter-group"`, `filter-group-header` and
        `filter-group-footer`: the visual container the advanced chrome
        introduces, stamped so per-style sheets and consumers can target it the
        way every other part is targeted.

        The CARD is what lights up as a drop destination, not the header strip
        the engine measured. Ringing the strip said "beside this line", which is
        the one thing dropping into a group does not mean; the drag layer marks
        both, so this is a plain attribute selector rather than a `:has()`
        re-evaluating on every frame of a gesture.

        `data-invalid` and no `aria-invalid`: the state has to be announced on
        something a user can land on, and that is the footer's add button, which
        carries both plus the sentence - and which is also the control that fixes
        it. A second copy on a wrapper div with no role would be one more thing
        in the accessibility tree saying the same word about nothing focusable.
      */}
      <div
        data-slot="filter-group"
        data-invalid={issue ? "" : undefined}
        className={GROUP_CARD_CLASS}
      >
        {/*
          A STRIP, not a band, and this is where a whole row of chrome went.

          Deleting the headline (it said what the pill outside already says, at
          ten times the width) left the box it lived in: a 38px header holding
          one `ms-auto` div and no text at all, so a group cost 78px of chrome
          around 32px of condition, and a five-level nest drew four empty bands
          stepping diagonally down the panel - 312px of frame for one row.

          The grip and the kebab moved to the FOOTER, which already existed and
          already ends on the same right-hand axis, so the pair still lines up
          with every rule row's pair and the strip has nothing left to hold. It
          survives at eight pixels because it is a DROP TARGET: resolution
          prefers a zone over a row unconditionally, so this cannot grow to
          cover the card without swallowing every between-rows drop inside it.

          EIGHT PIXELS AT EVERY DEPTH, now that the combinator never moves in
          here. It used to become a real band past a depth budget, which drew a
          26px empty strip on every group deep enough to have one.
        */}
        <div
          data-slot="filter-group-header"
          className="flex h-2 items-center"
          // The TOP of the card means the top of the list. It used to append,
          // so the one place a pointer can aim to say "into this group" put the
          // row at the far other end of it, several hundred pixels from where
          // the user was pointing. The footer below carries the append.
          data-drop-parent={group.id}
          data-drop-index={0}
        />

        {/*
          A CONTAINER, because this is the box every child row divides up. See
          `TRACK_CONTAINER_CLASS`: a row three groups down asks how wide THIS
          list is, and this is the element that knows.
        */}
        <div
          className={cn(
            TRACK_CONTAINER_CLASS,
            "flex flex-col",
            FILTER_ROW_GAP_CLASS
          )}
        >
          {group.rules.length === 0 ? (
            <p
              className={cn(
                // 70% foreground rather than the muted token: on the card's tint
                // the muted foreground measured 4.35:1 in light mode, under the
                // 4.5:1 AA line for text this size.
                "text-foreground/70 rounded-md border border-dashed px-2 py-3",
                "text-center text-xs",
                // Already dashed at rest, so the destination state is the same
                // shape at a higher contrast plus the wash the group card gets.
                // See `DROP_INDICATOR` for why dashed is the drop language.
                "data-drop-into:border-primary/60 data-drop-into:bg-primary/5",
                "data-drop-into:text-primary"
              )}
              data-slot="filter-group-empty"
              data-drop-parent={group.id}
              data-drop-index={0}
            >
              {actions.labels.groupPlaceholder}
            </p>
          ) : (
            group.rules.map((node, index) => (
              <FilterAdvancedNode<V, O>
                key={node.id}
                node={node}
                position={{
                  index,
                  parentId: group.id,
                  combinator: group.combinator,
                  depth: position.depth + 1,
                }}
              />
            ))
          )}
        </div>

        {/*
          The group's OWN controls, all of them, on one line: add on the leading
          edge continuing the list above it, and the grip and kebab on the
          trailing edge where every rule row keeps its pair. Delete stays in the
          menu - a destructive control inline in a nested footer is the one
          thing in the panel a pointer crosses on its way somewhere else.

          `flex-nowrap`, because the trailing pair carries the alignment
          contract: wrapped onto a second line it would leave the group's kebab
          off the column every other kebab in the panel sits in, which is the
          defect the whole layout is built around not having.

          And the ADD button gives before the pair does, which is the same trade
          in the other direction. It used to refuse to shrink, so on a card too
          narrow for both it pushed the pair past the card's right edge -
          measured at 1.42px in sera, whose uppercase tracking makes "ADD
          CONDITION" the widest label any style draws, in a 300px panel. A
          pixel and a half is not much of a ragged edge, and the contract says
          one axis rather than nearly one. The label clips; its accessible name
          is the long form and says the whole thing regardless.

          It is also the APPEND zone, the other end of the strip at the top of
          the card, so the two edges of a group mean first and last rather than
          both meaning last.
        */}
        <div
          data-slot="filter-group-footer"
          className="text-muted-foreground flex flex-nowrap items-center gap-2 pt-2 pb-2"
          data-drop-parent={group.id}
          data-drop-index={group.rules.length}
        >
          <Button
            variant="outline"
            size={sizes.button}
            // The visible words are the short form and the name is the long
            // one, which is the way round WCAG's Label in Name asks for: the
            // name CONTAINS the label, so "Add condition" spoken or typed still
            // reaches this button, and a nested footer does not have to carry
            // "to this group" twice on screen.
            aria-label={actions.labels.addToGroup}
            className={cn(
              // `shrink` and not merely `min-w-0`: `shrink-0` is baked into the
              // shadcn button's own base class, so a min-width alone left the
              // box refusing to give and the label pushed the pair out anyway.
              "min-w-0 shrink font-normal",
              "overflow-hidden",
              CELL_INVALID_CLASS
            )}
            disabled={actions.disabled}
            {...filterReadOnlyProps(actions)}
            {...cellProps("add", active)}
            // An EMPTY group is flagged here, on the control that fills it. The
            // issue belongs to the group and the group has no cell of its own
            // any more, so it lands on the one action that answers it.
            {...issueProps(issue, "group", issueText)}
            onFocus={onCellFocus("add")}
            onClick={addInto}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2}
            />
            {actions.labels.addCondition}
          </Button>

          <div className={cn("ms-auto", ACTION_BAND_CLASS)}>
            {canMove ? (
              <RowHandle
                nodeId={group.id}
                active={active}
                onFocus={onCellFocus}
              />
            ) : null}
            <FilterGroupMenu
              group={group}
              active={active}
              onFocus={onCellFocus}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A group's kebab: everything that can be done TO a group.
 *
 * It is the whole reason the header lost its icons and the footer lost its
 * delete. A menu row can afford six words, so "Remove condition group" and
 * "Ungroup conditions" say what they do; the same two as icons said neither, and
 * as buttons they doubled the width of every group header in the panel.
 *
 * Delete is last and destructive, which is where a menu's most dangerous row
 * belongs and where the row menu beside it already puts the same action.
 */
function FilterGroupMenu<V>({
  group,
  active,
  onFocus,
}: {
  group: FilterGroupNode<V>
  active: FilterColumn | null
  onFocus: (column: FilterColumn) => () => void
}) {
  const actions = useFilterActions()
  const sizes = filterControlSizes(actions)
  const locked = isFilterLocked(actions)
  const [open, setOpen] = React.useState(false)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next && locked) return
        setOpen(next)
      }}
    >
      <DropdownMenuTrigger
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
        render={
          <Button
            variant="ghost"
            size={sizes.icon}
            aria-label={actions.labels.groupMenu}
            className={ACTION_CONTROL_CLASS}
            {...cellProps("menu", active)}
            onFocus={onFocus("menu")}
          />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(FILTER_MENU_CLASS, actions.menuClassName)}
      >
        <DropdownMenuItem
          disabled={locked}
          onClick={() => actions.duplicateNode(group.id)}
        >
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>
            {actions.labels.duplicate}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={locked}
          onClick={() => actions.unwrapGroup(group.id)}
        >
          {/* The inverse of the row menu's layers glyph: this one takes a layer
              off the stack, leaving the conditions where they stood. */}
          <HugeiconsIcon icon={UngroupItemsIcon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>
            {actions.labels.ungroup}
          </span>
        </DropdownMenuItem>
        <FilterMoveToMenuItems nodeId={group.id} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={locked}
          onClick={() => actions.removeNode(group.id)}
        >
          {/* No colour of its own: the destructive variant already paints the
              row's svgs, so a class here would only be a second place to keep in
              step with the theme. */}
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>
            {actions.labels.removeGroup}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One child of a group, whichever kind it is. */
function FilterAdvancedNode<V, O>({
  node,
  position,
}: {
  node: FilterNode<V>
  position: RowPosition
}) {
  const actions = useFilterActions<V, O>()

  if (!isFilterRule(node)) {
    return <FilterAdvancedGroup<V, O> group={node} position={position} />
  }
  if (!getFilterField(actions.index, node.path)) {
    return <FilterUnknownRow<V> rule={node} position={position} />
  }
  return <FilterAdvancedRow<V, O> rule={node} position={position} />
}

/* -------------------------------------------------------------------------- */
/*                                   Adding                                   */
/* -------------------------------------------------------------------------- */

/**
 * Appends a condition on the first attribute anyone may actually filter on.
 *
 * At any depth: a schema whose roots are all navigation branches still has to
 * be able to add a row. Returns the new id, or null when the schema offers
 * nothing pickable at all.
 *
 * `isFilterFieldPickable`, the same rule the picker this row opens uses. Seeding
 * a row on a field the picker beside it refuses to commit would leave the user
 * holding a condition they could look at and not re-choose.
 */
function addFilterRow<V, O>(
  actions: FilterActionsContextValue<V, O>,
  parentId?: string
): string | null {
  // Before `nextId` and before `addRule`, exactly where `addGroup` asks the
  // same question and for the same two reasons. A refused add that still minted
  // an id drifted the SSR-seeded sequence away from the server's, and - the
  // worse half - handed both callers an id to move focus onto. The focus store
  // is the builder's ONLY tab stop: every cell asks whether it owns the focused
  // node, and while the store points at a row that was never created the answer
  // is no everywhere, so the whole panel drops out of the tab order. Refusing
  // an edit must never cost a read-only user the keyboard.
  if (isFilterLocked(actions)) return null

  const entry = actions.index.all.find((candidate) =>
    isFilterFieldPickable(candidate.field)
  )
  if (!entry) return null

  const id = actions.nextId()
  actions.addRule(
    createFilterRule<V>({
      id,
      path: entry.path,
      // Deliberately empty, exactly as the chip flow mints it. The row arrives
      // PENDING, so it draws its attribute cell and nothing else, and the
      // condition is asked for only once the attribute has been answered - the
      // same one-question-at-a-time order the chips have always walked.
      //
      // A seeded default answered that question in advance, and the menu that
      // now opens on it would open with its own answer already highlighted,
      // where the most natural click of all - the highlighted row - is a
      // deselect that closes the menu instead of walking on to the value.
      //
      // The field is still a guess, which is why it is the picker that opens
      // itself first.
      operator: "",
    }),
    parentId
  )
  return id
}

/* -------------------------------------------------------------------------- */
/*                                    Panel                                   */
/* -------------------------------------------------------------------------- */

/**
 * The panel draws NO border, NO background and NO radius, and takes no element
 * to be drawn as.
 *
 * A surface is a decision the page makes, not one the primitive can make for
 * it, and the honest way to make it is the ordinary one: put the builder
 * inside a `Card`, a `Frame`, or whatever the page already uses, the same way
 * anything else on that page is wrapped. This used to accept the box as a prop
 * and render THROUGH it, which bought nothing a wrapper does not and cost a
 * composition seam that had to keep the panel's role, name, slot and focus
 * handlers alive across an element the primitive did not own.
 *
 * What is still the primitive's: everything inside. Every row, card and
 * control carries its own chrome, so the builder is usable on a bare page and
 * flush with whatever is behind it.
 */
export interface FiltersAdvancedPanelProps {
  /**
   * Which of the two boxes the panel is sitting in, which is the only thing
   * that decides whether it pads itself.
   *
   * `"popover"` (default) is the popup: its content is `p-0`, so the panel's
   * own padding IS the popup's inner padding and removing it would put the
   * rows against the popover's edge. `"inline"` is a page, where whatever the
   * consumer wrapped the builder in already owns the spacing and a second
   * inset is just an unexplained margin inside their card.
   */
  mode?: "popover" | "inline"
  /**
   * Replaces the empty state for this panel only.
   *
   * Wins over `Filters.renderEmpty`, which is the same precedence a field's own
   * setting has over the root's everywhere else in this primitive. A consumer
   * who mounts the panel directly has no `Filters` prop to reach for, which is
   * why it exists on both.
   */
  renderEmpty?: (context: FilterEmptyStateContext) => React.ReactNode
  /** Whether rows can be reordered. See `FiltersProps.reorderable`. */
  reorderable?: boolean
  className?: string
}

/**
 * The builder itself: nested groups over the same query tree the chips read.
 *
 * A group is a parenthesised list of terms joined by ONE operator, which is what
 * every query language means by a group, so a query built here has a faithful
 * form in each of them and needs no precedence guessed at on the way out. That
 * is the whole reason nesting is a real tree rather than a second flat list with
 * a depth column: a flat model cannot represent `a AND (b OR c)` without
 * inventing precedence rules, and invented precedence is how a filter silently
 * returns the wrong rows.
 *
 * THERE IS NO HEADER AT ALL, and that is the last of three deletions rather
 * than the first. It lost its title (a popover opened from a button reading
 * "Advanced filter" does not need to be told what it is), then its subtitle
 * ("In this view, show records" described the first row's own "Where" a second
 * time), and what was left was a count, a validation summary and a kebab.
 *
 * The COUNT said what the rows say, above rows that are always on screen, and
 * it was already on the trigger for the case where they are not. The KEBAB held
 * two things: the root group's and/or, which is the second row's own toggle,
 * and Clear all, which is a footer button. So the strip was a band of chrome
 * whose every statement was made somewhere else, and deleting it takes about
 * 34px off the top of every builder including the ones three groups deep.
 *
 * The SUMMARY was the one thing in it that had no other home, and it moved to
 * the footer rather than going. It has to live in a strip that exists either
 * way - as its own band it appeared and disappeared with the issue count and
 * jolted every row below it by 22px, which is what put it in the header in the
 * first place - and the footer is now the only strip left that is always drawn.
 *
 * The panel keeps the NAME, on the region itself, because the sentence a
 * sighted user gets from the trigger they pressed has to reach the user who
 * arrowed into a popup from somewhere else.
 */
export function FiltersAdvancedPanel<V, O>({
  mode = "popover",
  renderEmpty,
  reorderable = false,
  className,
}: FiltersAdvancedPanelProps) {
  const actions = useFilterActions<V, O>()
  const panelRender = useFilterRender<V, O>()
  const sizes = filterControlSizes(actions)
  const { query, ruleCount, announcement, announcementSeq } =
    useFilterState<V>()
  const focusStore = useFilterFocusStore()
  const rowStateStore = useFilterRowStateStore()
  // A version counter rather than the Set itself: the store is mutable and
  // stable by identity, so this is what tells the memo below a mark landed.
  const rowStateVersion = React.useSyncExternalStore(
    rowStateStore.subscribe,
    () => rowStateStore.version(),
    () => 0
  )
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const locked = isFilterLocked(actions)

  /* ------------------------------ validation ------------------------------ */

  /**
   * What is unfinished, computed ONCE for the whole panel.
   *
   * Per row would be the obvious place and it is the wrong one: an empty group
   * is a fact about a group and not about any row inside it, and the summary
   * below needs a count nobody can produce from a single row. Memoized on the
   * query, so typing in a value editor re-derives it once per committed change
   * rather than once per keystroke of an uncommitted draft.
   *
   * `arityOf` returns null for a field the schema no longer has, which is what
   * keeps an issue off a row that draws neither an operator nor a value cell -
   * an unknown row is already flagged as broken in its own way, and a marker
   * pointing at a control that is not on screen is a marker nobody can act on.
   */
  const issues = React.useMemo(
    () =>
      collectFilterIssues(
        query,
        (rule) => {
          const field = getFilterField(actions.index, rule.path)
          if (!field) return null
          return getFilterArity(
            getFilterOperator(actions.resolveOperators(field), rule.operator)
          )
        },
        // The field's own check, given the same normalisation the display
        // callbacks get so a validator and a `renderValue` never disagree about
        // what "the value" is. Only reached for a rule the built-in checks have
        // already passed, so `value` here is present and non-blank.
        (rule) => {
          const field = getFilterField(actions.index, rule.path)
          if (!field?.validate) return null
          const operator = getFilterOperator(
            actions.resolveOperators(field),
            rule.operator
          )
          if (!operator) return null
          return field.validate({
            value: rule.value,
            values:
              rule.value === undefined || rule.value === null
                ? []
                : Array.isArray(rule.value)
                  ? (rule.value as unknown[])
                  : [rule.value],
            field,
            operator,
            arity: getFilterArity(operator) ?? "one",
            rule,
            labels: actions.labels,
          })
        }
      ),
    [query, actions]
  )

  /**
   * Every issue, keyed by node. What the tree IS, regardless of what is drawn.
   *
   * The footer summary and the announcement both read this rather than the
   * visible set below, so "how many rows need attention" stays an honest answer
   * about the query and does not shrink because the user has not clicked
   * anything yet.
   */
  const issueMap = React.useMemo(
    () => new Map(issues.map((issue) => [issue.nodeId, issue])),
    [issues]
  )

  /**
   * The issues a row is allowed to DRAW: the ones on a value the user has
   * committed at least once.
   *
   * NOTHING built-in is drawn, `empty-group` included. Every one of the five
   * describes a row or group that is half built, which is the normal state of
   * something somebody is filling in - and an empty group is a container they
   * explicitly created a moment ago. `collectFilterIssues` still reports them
   * all to a consumer compiling the query; this is only about what the panel
   * marks.
   */
  const visibleIssueMap = React.useMemo(() => {
    const visible = new Map<string, FilterIssue>()
    for (const issue of issues) {
      // CUSTOM ONLY. The built-in reasons still exist and are still what
      // `collectFilterIssues` reports to a consumer asking whether a query is
      // runnable - but the builder no longer draws them.
      //
      // They were describing a row as broken for being HALF BUILT, which is the
      // normal state of a row somebody is building: a fresh condition has no
      // value, so every Add filter produced a red row, and an operator picked
      // before its value did the same. Error styling that fires on the happy
      // path teaches people to ignore it. What is worth interrupting for is a
      // rule the PRODUCT says is wrong, and only a field's own `validate` knows
      // that - so a schema with no validators shows no errors at all.
      if (issue.reason !== "custom") continue
      if (rowStateStore.has(issue.nodeId)) visible.set(issue.nodeId, issue)
    }
    return visible
  }, [issues, rowStateStore, rowStateVersion])

  /**
   * Says out loud that a VISIBLE error has just appeared.
   *
   * A mark is something you have to be looking at or land on, and a condition
   * can go invalid without either - so this is the one state change that would
   * otherwise happen in silence.
   *
   * It counts the DRAWN issues and not every issue the tree has, which is the
   * whole correction here. It used to announce `issues.length`, and since the
   * panel stopped drawing the built-in reasons that meant a screen reader was
   * told about problems no sighted user could see: press Add filter, and the
   * live region said "1 row needs attention" about a row that is merely
   * unfinished and shows no mark at all. Announcing what is on screen is the
   * only version of this that two users can agree about.
   *
   * On a RISE only, and only when NOTHING ELSE spoke for the same change. A
   * fall is silent because focus is already in the cell being fixed. And an add
   * announces its own count, so the sequence guard stops the two talking over
   * each other; it is bumped by the mutator itself in the same commit, so this
   * can ask "did this change come with its own sentence" without knowing which
   * of the fourteen mutators ran.
   */
  const announcedIssues = React.useRef({
    count: visibleIssueMap.size,
    seq: announcementSeq,
  })
  React.useEffect(() => {
    const before = announcedIssues.current
    announcedIssues.current = { count: visibleIssueMap.size, seq: announcementSeq }
    if (announcementSeq !== before.seq) return
    if (visibleIssueMap.size <= before.count) return
    actions.announce(actions.labels.issueSummary(visibleIssueMap.size))
  }, [visibleIssueMap, announcementSeq, actions])

  /**
   * Sends focus to the first thing that needs it.
   *
   * The whole point of a panel-level summary: a count with no way to reach what
   * it counts is a count that makes the user hunt, and the row it names may be
   * three groups down and scrolled out of sight. Walked rather than selected
   * with an id, because a node id is consumer-supplied and `CSS.escape` is not
   * something a selector built by hand can skip.
   */
  const focusFirstIssue = React.useCallback(() => {
    const first = issues[0]
    const body = bodyRef.current
    if (!first || !body) return
    const row = Array.from(
      body.querySelectorAll<HTMLElement>(ROW_SELECTOR)
    ).find((candidate) => candidate.dataset.nodeId === first.nodeId)
    if (!row) return
    // A group's issue is drawn on its footer's add button, which is both the
    // control carrying the message and the one that resolves it.
    const column = first.column === "group" ? "add" : first.column
    const target = ownCells(row).find(
      (cell) => cell.getAttribute(CELL_ATTRIBUTE) === column
    )
    target?.focus()
  }, [issues])

  /* ---------------------------- focus recovery ---------------------------- */

  /**
   * Whether the panel, or a menu of its own, held focus a moment ago.
   *
   * Written from the panel's own capture handlers, which see the whole React
   * subtree INCLUDING portaled menus and popovers: a menu item is a React child
   * of the row that opened it, so its focus events bubble here even though its
   * DOM sits at the end of the document.
   *
   * A blur with a `relatedTarget` is focus arriving somewhere real, so the panel
   * has genuinely lost it and nothing below should chase it. A blur with NO
   * relatedTarget - or no blur at all, which is what a browser does when the
   * focused element is simply removed - leaves this true, and that is precisely
   * the state worth repairing.
   */
  const heldFocus = React.useRef(false)
  const addRowRef = React.useRef<HTMLButtonElement>(null)

  /**
   * Puts focus back after a mutation that destroyed the thing holding it.
   *
   * Every route out of a menu had the same ending: measured at 50, 200, 600 and
   * 1200ms after Convert to group, Remove, Remove condition group, Ungroup
   * conditions and Move to group, `document.activeElement` was the BODY, from
   * both the pointer and the keyboard. A menu restores focus to its trigger on
   * close, and each of those actions unmounts the trigger in the same commit, so
   * the restore lands on nothing. "Clear all filters" is the same story without
   * a menu: the button removes itself. Deleting the LAST row was the worst of
   * them, because the panel then renders no body at all and the row-level
   * refocus has nothing to aim at.
   *
   * The roving tab stop is where it aims, so the answer agrees with the one Tab
   * would give: the store already names the surviving node the user was on, and
   * the root's own repair has already emptied it if that node is gone. Then the
   * first cell in the builder, then the footer's add button, which is the last
   * control that always exists.
   *
   * GUARDED FOUR WAYS, because moving focus unasked is its own bug. It runs
   * only after a committed change, only while no step handoff is in flight,
   * only when the panel held focus going into it, and only when focus actually
   * ended up nowhere. A user who clicks the page background loses the third
   * guard; one who clicks another control loses it too, because that blur
   * carries a `relatedTarget`.
   */
  const restoreFocus = React.useCallback(() => {
    // A handoff is mid-air, and it owns focus. Between one step being answered
    // and the next opening, `document.activeElement` IS the body - this
    // callback's own last guard - and every write that arms a handoff also
    // bumps the query or the announcement that runs it. So without this it
    // fires in precisely the window the stepped flow needs, and aims at the
    // cell the store names: the next step's TRIGGER, which sits outside the
    // popup about to open over it, where focusing it reads as an interaction
    // outside and dismisses that popup in the frame it appeared.
    if (focusStore.getSnapshot().autoOpen) return
    if (!heldFocus.current) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const rows = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? []
    )
    const { id, segment } = focusStore.getSnapshot()
    const row = id
      ? rows.find((candidate) => candidate.dataset.nodeId === id)
      : undefined
    const cells = row ? ownCells(row) : []
    const target =
      cells.find((entry) => entry.getAttribute(CELL_ATTRIBUTE) === segment) ??
      cells[0] ??
      (rows[0] ? ownCells(rows[0])[0] : undefined) ??
      addRowRef.current ??
      undefined
    target?.focus()
  }, [focusStore])

  // In the passive effect, not a frame later, and the ordering works out on its
  // own. React removes the control during the commit's mutation phase, so focus
  // is already on the body by the time this runs; a menu's own restore-on-close
  // then aims at an element that is no longer in the document, where `focus()`
  // is a no-op and cannot undo this. The keyboard Delete path queues its own,
  // more specific refocus a frame later, which simply wins.
  //
  // `announcementSeq` as well as `query`, because an action can rebuild the tree
  // without changing its identity - and a mutation that says something is a
  // mutation that may have moved something.
  React.useEffect(() => {
    restoreFocus()
  }, [query, announcementSeq, restoreFocus])

  /* -------------------------------- adding -------------------------------- */

  /**
   * The empty state, resolved once: the panel's own prop, else the root's, else
   * the shipped default below.
   *
   * Built here rather than inline in the body so the context object is assembled
   * where `addRow` and `addGroup` already exist - a replacement gets the SAME
   * two actions the footer calls, focus handoff included, which is the half a
   * consumer cannot reconstruct from outside.
   */
  const addRow = React.useCallback(() => {
    const id = addFilterRow(actions)
    if (!id) return
    // PENDING until the attribute is chosen, which is the first of three
    // questions rather than the only one. The rule carries a guessed field so
    // the tree stays well formed, no condition and no value, and the row draws
    // only its attribute cell: an operator and a value for a field nobody
    // picked are two controls answering a question that has not been asked.
    // Answering it opens the next one.
    rowStateStore.markPending(id)
    focusStore.set({ id, segment: "field", autoOpen: true })
  }, [actions, focusStore, rowStateStore])

  const addGroup = React.useCallback(() => {
    const id = actions.addGroup()
    // An empty id is the boundary saying it refused. Moving focus onto a group
    // that was never created would strand the tab stop.
    if (!id) return
    // Onto the group's own chrome, not into it: the group arrives empty, and
    // dropping focus on a placeholder that holds no control would strand it.
    focusStore.set({ id, segment: "add", autoOpen: false })
  }, [actions, focusStore])

  /* ------------------------------- keyboard ------------------------------- */

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      `[${CELL_ATTRIBUTE}]`
    )
    // A key pressed inside an open popover belongs to that popover. Its content
    // is portaled out, so this is belt and braces rather than the only guard.
    //
    // One key never reaches here at all: a menu button owns ArrowDown, which is
    // how every menu button opens, and Base UI stops that key at the trigger.
    // The row menu therefore opens rather than moving the tab stop down a row,
    // which is the standard behaviour a user already expects from it, and every
    // other cell in the row still navigates.
    if (!cell || event.target !== cell) return

    const body = bodyRef.current
    const row = cell.closest<HTMLElement>(ROW_SELECTOR)
    if (!body || !row) return

    /**
     * A cell the user TYPES into keeps the keys that edit text.
     *
     * Everything the walker claims means something else inside a text box:
     * ArrowLeft is a character, Home and End are the ends of the line, and
     * Backspace is the character behind the caret rather than the whole
     * condition. Only the VERTICAL keys stay, which is the same trade every
     * editable grid makes - a single-line box has nothing above or below the
     * caret to reach, so up and down are free to mean "next row".
     */
    const editing = cell.hasAttribute(CELL_INPUT_ATTRIBUTE)

    // DOM order for the two places that mean "the whole builder": Ctrl+Home,
    // Ctrl+End, and the row that takes a deleted row's place.
    const rows = Array.from(body.querySelectorAll<HTMLElement>(ROW_SELECTOR))
    const cells = ownCells(row)
    const rowIndex = rows.indexOf(row)
    const cellIndex = cells.indexOf(cell)

    const rtl = getComputedStyle(cell).direction === "rtl"
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const backward = rtl ? "ArrowRight" : "ArrowLeft"

    const focus = (target: HTMLElement | undefined) => {
      if (!target) return
      event.preventDefault()
      target.focus()
    }

    const from = cell.getAttribute(CELL_ATTRIBUTE) as FilterColumn
    const band = (CONTENT_COLUMNS as readonly FilterColumn[]).includes(from)
      ? CONTENT_COLUMNS
      : ACTION_COLUMNS

    /**
     * The rows that draw a cell in this BAND, ordered by where that cell sits.
     *
     * Ordering by ROW used to be the same thing and no longer is. A group's row
     * element opens before the rows it holds, so DOM row order was reading order
     * while a group's own controls lived in its header - and the redesign moved
     * them to its footer, which is below every child. Walking rows then sent
     * ArrowDown BACKWARDS up the panel: measured from a depth-three condition,
     * five presses moved +212, -166, +122, -76, +38 pixels, two of the five
     * against the key.
     *
     * Ordering by the CELL fixes it without a traversal and without geometry,
     * because the document already holds the answer: a group's footer cells come
     * after its children's cells, and its combinator comes before them, so each
     * band reads in the order it is painted. The two bands legitimately disagree
     * about where a group sits, which is exactly why the order is per band
     * rather than one list.
     *
     * A row appears once, at its FIRST cell in the band. Rows with no cell in
     * this band are absent rather than skipped-over: a group draws no content
     * cell at all unless its combinator is the toggle, and ArrowDown from a
     * value used to land on that group's footer button, a whole card below the
     * next thing a reader would call the next line.
     */
    const bandRows: HTMLElement[] = []
    const seen = new Set<HTMLElement>()
    for (const entry of body.querySelectorAll<HTMLElement>(
      `[${CELL_ATTRIBUTE}]`
    )) {
      const column = entry.getAttribute(CELL_ATTRIBUTE) as FilterColumn
      if (!(band as readonly FilterColumn[]).includes(column)) continue
      const owner = entry.closest<HTMLElement>(ROW_SELECTOR)
      if (!owner || seen.has(owner)) continue
      seen.add(owner)
      bandRows.push(owner)
    }
    const bandIndex = bandRows.indexOf(row)

    // Same column in the next row of this band, or the nearest one it has.
    const focusRow = (step: number) => {
      const nextRow = bandRows[bandIndex + step]
      if (!nextRow) return
      const cellsThere = ownCells(nextRow)
      const byColumn = new Map(
        cellsThere.map((entry) => [entry.getAttribute(CELL_ATTRIBUTE), entry])
      )
      // The band, then anything at all: the fallback cannot fire for a row this
      // list holds, and it is what keeps a consumer's own cell reachable.
      focus(nearestColumn(band, from, byColumn) ?? cellsThere[0])
    }

    const nodeId = row.dataset.nodeId
    if (!nodeId) return

    // Alt reorders rather than navigates, matching the chip row's Alt+arrow.
    // Within the owning group only: changing depth with an arrow key would make
    // the same gesture mean two things depending on where the row happened to
    // sit. Moving a condition into an EXISTING group is the row menu's "Move
    // to" items (keyboard parity with the drag layer's cross-group drop);
    // wrapping in a NEW one is its Convert action, and the group's own footer
    // add button creates a condition inside.
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      // The action refuses it anyway; this stops the key being swallowed from a
      // builder that is not going to act on it. Plain arrows, Home and End are
      // deliberately NOT gated - walking the rows is how a read-only query is
      // read.
      //
      // `reorderable` gates it for the same reason it gates the grip: a builder
      // that draws no handle must not move rows from the keyboard either, or
      // the capability is off for a pointer and quietly on for everyone else.
      if (locked || !reorderable) return
      event.preventDefault()
      actions.moveNode(nodeId, event.key === "ArrowDown" ? 1 : -1)
      return
    }

    if (event.key === "ArrowDown") return focusRow(1)
    if (event.key === "ArrowUp") return focusRow(-1)
    if (editing) return

    if (event.key === forward) return focus(cells[cellIndex + 1])
    if (event.key === backward) return focus(cells[cellIndex - 1])
    if (event.key === "Home") {
      return focus(event.ctrlKey ? ownCells(rows[0])[0] : cells[0])
    }
    if (event.key === "End") {
      const scope = event.ctrlKey ? ownCells(rows[rows.length - 1]) : cells
      return focus(scope[scope.length - 1])
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      if (locked) return
      event.preventDefault()
      actions.removeNode(nodeId)
      // Focus the row that takes this one's place, or the one above it when the
      // builder ends here, so removing several does not throw focus to the body.
      requestAnimationFrame(() => {
        const remaining = Array.from(
          bodyRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? []
        )
        const target = remaining[Math.min(rowIndex, remaining.length - 1)]
        if (target) ownCells(target)[0]?.focus()
      })
    }
  }

  /* --------------------------------- drag --------------------------------- */

  /**
   * Pointer drag, not HTML5 drag and drop.
   *
   * The native API cannot do two of the three things this builder needs. Its
   * drag image is a browser-owned snapshot that no copy badge can be drawn on,
   * so Alt would be a mode with no visible state until release; and its
   * `dropEffect` is advisory, so "copy" would be a cursor hint the drop had to
   * re-derive anyway. The third thing, dropping INTO a nested target, it can do,
   * but only by hit-testing `event.target` per `dragover` - which fires
   * continuously while the pointer merely rests.
   *
   * `filters-dnd.tsx` measures every target once at activation and then answers
   * from numbers, writing the indicator straight to the DOM. The tree is
   * mutated exactly once, here, on release - and not at all when the resolved
   * target is the node's own slot, which the engine reports as no drop rather
   * than as a move the tree would discard.
   */
  const dragProps = useFilterRowDrag({
    // THE PANEL, reached through the body, because the append target for the
    // top level is in the FOOTER and the footer is the body's sibling. Asking
    // the body for its parent instead of holding a second ref keeps the only
    // thing that matters true by construction - the measured root is whatever
    // element holds both the rows and that zone, including a surface a consumer
    // composed in - and it is null exactly while there is no row to drag.
    root: () => bodyRef.current?.parentElement ?? null,
    disabled: locked,
    onDrop: (nodeId, drop) => {
      if (drop.copy) actions.copyNodeTo(nodeId, drop.parentId, drop.index)
      else actions.moveNodeTo(nodeId, drop.parentId, drop.index)
    },
  })

  /* -------------------------------- render -------------------------------- */

  const panelProps = {
    // The panel's programmatic NAME, which is the half of the deleted title
    // that was doing real work. A `role` is what makes `aria-label` legal on a
    // div, and `group` is what the panel honestly is: the rows inside it are
    // groups too, so the tree reads as a query rather than as a landmark.
    role: "group",
    "aria-label": actions.labels.advancedFilter,
    // WHAT IS IN IT, on entry, for the reader who did not press the trigger.
    // The count was on the default popover trigger and nowhere else, so inline
    // mode told nobody and a consumer's own trigger dropped it; the live region
    // says it on a CHANGE, which is no help to anyone who merely arrives at a
    // saved query. The read-only sentence rides along for the reason the chip
    // row puts it on its toolbar: `aria-readonly` is illegal on `role="group"`,
    // and a description is both legal here and spoken on entry, where the
    // visible line below is a paragraph a reader has to go back for.
    "aria-description": actions.readOnly
      ? `${actions.labels.countAnnouncement(ruleCount)} ${actions.labels.readOnly}`
      : actions.labels.countAnnouncement(ruleCount),
    "data-slot": "filters-advanced",
    "data-readonly": actions.readOnly || undefined,
    // See `heldFocus`. Capture rather than bubble so a control that stops the
    // event still reports, and on the PANEL so portaled menus report too.
    onFocusCapture: () => {
      heldFocus.current = true
    },
    onBlurCapture: (event: React.FocusEvent) => {
      if (event.relatedTarget) heldFocus.current = false
    },
  } as const

  const renderEmptyState = renderEmpty ?? panelRender.renderEmpty
  const emptyState = renderEmptyState
    ? renderEmptyState({
        labels: actions.labels,
        readOnly: Boolean(actions.readOnly),
        mode,
        addFilter: addRow,
        addGroup,
      })
    : null

  const body = (
    <>
      {/*
        VISIBLE, not an ARIA attribute, and not only for screen readers.
        `aria-readonly` is illegal on every role in this panel, and a panel whose
        every control is dimmed owes the person looking at it a reason as much as
        it owes one to the person hearing it. The chip row says the same sentence
        through the toolbar's `aria-description` instead: a one-line strip in a
        page header has nowhere to put a paragraph, and its chips stay fully
        legible without one.
      */}
      {actions.readOnly ? (
        <p
          data-slot="filters-readonly"
          className={cn("text-muted-foreground text-xs", PANEL_GUTTER_CLASS)}
        >
          {actions.labels.readOnly}
        </p>
      ) : null}

      {query.rules.length > 0 ? (
        <div
          ref={bodyRef}
          data-slot="filters-advanced-body"
          // NO `overflow-x`, deliberately. Nothing here is ever wider than its
          // box: a row's content band may shrink to nothing rather than
          // demanding a minimum, and a group stops charging for its gutter
          // before its children run out of room, so the trailing column lands
          // on one axis at every width and at every depth. A scroll container
          // would only be somewhere for a ragged right edge to hide.
          //
          // And a CONTAINER, the outermost of them: the top-level rows measure
          // themselves against this box the way a nested row measures itself
          // against its group's list.
          className={cn(
            TRACK_CONTAINER_CLASS,
            "flex min-w-0 flex-col",
            FILTER_ROW_GAP_CLASS,
            PANEL_GUTTER_CLASS
          )}
          onKeyDown={onKeyDown}
        >
          <FilterReorderProvider value={reorderable}>
          <FilterDragContext.Provider value={reorderable ? dragProps : null}>
            <FilterIssueContext.Provider value={visibleIssueMap}>
              {query.rules.map((node, index) => (
                <FilterAdvancedNode<V, O>
                  key={node.id}
                  node={node}
                  position={{
                    index,
                    parentId: query.id,
                    combinator: query.combinator,
                    depth: 1,
                  }}
                />
              ))}
            </FilterIssueContext.Provider>
          </FilterDragContext.Provider>
          </FilterReorderProvider>
        </div>
      ) : (
        /*
          THE EMPTY STATE, which is a real state and not a missing one.

          With no rules the body renders nothing at all, so the panel used to
          open as a footer floating in a blank popover: two buttons, no
          sentence, and no indication of whether the filter had been cleared or
          had simply failed to load. A builder that is empty most often because
          somebody just pressed Clear all owes them the confirmation.

          Centred and quiet on purpose. It is a message about absence, so it
          gets a muted glyph and two lines rather than an illustration and a
          call to action - the call to action is the footer directly under it,
          and drawing a third button here would be the same press twice.

          The HINT is withheld when the bar is locked: it tells you to add a
          filter, and the two buttons it is pointing at are disabled. The title
          still shows, because "there is nothing here" is true either way.
        */
        // The CALLBACK's presence decides, not its result: a consumer who
        // returns null is asking for a genuinely blank panel, and `??` would
        // hand them the default back instead.
        renderEmptyState ? (
          emptyState
        ) : (
        <div
          data-slot="filters-advanced-empty"
          className={cn(
            "flex flex-col items-center justify-center gap-1 py-8 text-center",
            PANEL_GUTTER_CLASS
          )}
        >
          <span
            aria-hidden="true"
            // `rounded-full` is the one radius literal that is safe in every
            // style: a pill is a pill whether the theme is square (lyra, sera)
            // or very round (maia, luma). Anything else here would have to come
            // from a style variable.
            className="bg-muted text-muted-foreground mb-1 flex size-9 items-center justify-center rounded-full [&_svg]:size-4"
          >
            <HugeiconsIcon icon={FilterMailIcon} strokeWidth={2}
            />
          </span>
          <p className="text-sm font-medium">{actions.labels.builderEmpty}</p>
          {actions.readOnly ? null : (
            <p className="text-muted-foreground text-xs">
              {actions.labels.builderEmptyHint}
            </p>
          )}
        </div>
        )
      )}

      {/*
        `shrink-0` on all three, which is what stops "Clear all filters" from
        being drawn as "ear all filters". A flex item's default is to shrink
        before it wraps, and a button clips its label rather than reflowing it,
        so at the widths sera's padding leaves the last button lost its first
        word. Refusing to shrink turns that into a wrap, which is legible.
      */}
      <div
        data-slot="filters-advanced-footer"
        // THE APPEND TARGET FOR THE TOP LEVEL, which every group had and the
        // root did not. A group's footer carries this same pair (see
        // `filter-group-footer`), so at depth the strip under the last row is a
        // 48px "put it here" while at the root it was 47px of `no-drop` and
        // append-to-root survived only as the 4px seam above it. The one list
        // with no parent group to catch the miss was the one list without it.
        data-drop-parent={query.id}
        data-drop-index={query.rules.length}
        className={cn(
          "relative flex flex-wrap items-center gap-2",
          PANEL_GUTTER_CLASS,
          // FOUR PIXELS MORE than the gutter on the trailing edge, which is
          // exactly what every row's action band spends after its kebab. The
          // gutter cannot carry them - see `PANEL_GUTTER_CLASS` - so the footer
          // spends them the way a row does, and Clear all's box ends where the
          // column of kebabs ends instead of 4px past it. Written against the
          // gutter VARIABLE rather than as a literal, so it stays "gutter plus
          // four" in both modes instead of becoming 16px of stray inset the
          // moment the inline panel drops its padding to zero.
          "pe-[calc(var(--filter-panel-pad)+4px)]",
          FOOTER_DROP_CLASS,
          // The strip's BOX reaches up to the body's bottom edge and pads its
          // content back down, so the append zone TILES with the last row
          // rather than leaving the panel's own gap as a band no target owns.
          // Rows grow by half the gap into it from above (`FILTER_ROW_SEAM_PX`)
          // and a zone is never grown, so without this the two met four pixels
          // apart. Only when there IS a body: with no rows the footer is the
          // panel's first child and this would eat its top padding.
          //
          // `pt-5` and not `pt-2`, which is the visible gap and not the drop
          // geometry. The zone still starts at the body's bottom edge - that
          // is `-mt-2` and it is unchanged - but the row above it already
          // grows 4px down into this strip, so a `pt-2` left the toolbar four
          // pixels under the last condition and it read as part of it. The
          // extra padding pushes the BUTTONS down without moving the target,
          // so "Add filter" is legibly the panel's own row rather than the
          // last filter's tail.
          query.rules.length > 0 &&
            cn(FILTER_ROW_GAP_CANCEL_CLASS, "pt-5")
        )}
      >
        <Button
          // The last resort of `restoreFocus`, and the reason it is a ref: this
          // is the only control in the panel that exists at every query, so
          // deleting the final row - which leaves no body and no cells at all -
          // still has somewhere honest to put focus.
          ref={addRowRef}
          // OUTLINE, both of them, and it is the only pair of buttons in the
          // panel that gets a box. They are what the footer is FOR - the two
          // ways a query grows - and as ghosts they were two grey words below a
          // builder full of outlined cells, which read as a caption rather than
          // as the primary action. Clear all stays a ghost beside them, because
          // an outlined destructive-by-effect control at the same weight as the
          // two constructive ones is a mis-ranked footer.
          variant="outline"
          size={sizes.button}
          className="shrink-0 font-normal"
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={addRow}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2}
          />
          {actions.labels.addCondition}
        </Button>

        <Button
          variant="outline"
          size={sizes.button}
          className="shrink-0 font-normal"
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={addGroup}
        >
          <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2}
          />
          {actions.labels.addConditionGroup}
        </Button>

        {/*
          NO PANEL-LEVEL SUMMARY. There used to be a "N rows need attention"
          button here that moved focus to the first offender, and it went with
          the built-in validation it counted.

          What is left to report is a field's OWN validator saying no, and that
          belongs on the one control that can act on it: the value cell it
          failed in, which draws the message on an icon inside itself. A count
          in the footer would be a second place to learn the same thing, phrased
          as a number, about rows that may be three groups down - and it existed
          because the primitive used to flag every unfinished row, which it no
          longer does.
        */}
        {ruleCount > 0 ? (
          <Button
            variant="ghost"
            size={sizes.button}
            className="text-muted-foreground hover:text-foreground ms-auto shrink-0"
            disabled={actions.disabled}
            {...filterReadOnlyProps(actions)}
            onClick={() => actions.clearQuery()}
          >
            {actions.labels.clearAll}
          </Button>
        ) : null}
      </div>

      {/*
        The `key` is what makes a REPEATED sentence audible, and it is not a
        flourish. `aria-live` fires on a DOM mutation, and React writes nothing
        when the string it renders is the one already there - so pressing "Add
        condition group" three times mutated the region once and announced
        groups two and three to nobody. Measured with a MutationObserver: three
        presses, one mutation. Every constant-string announcement in the file
        has the same shape, and so does any reorder that repeats.

        On a span INSIDE the region rather than on the region itself: replacing
        the live element is how a region stops being registered with some
        assistive technology, while replacing its contents is exactly the change
        the region exists to report.
      */}
      <div aria-live="polite" role="status" className="sr-only">
        <span key={announcementSeq}>{announcement}</span>
      </div>
    </>
  )

  /*
    ONE PLAIN ELEMENT, and no way to swap it out.

    The panel is a `div` with the layout above and nothing else - no border, no
    background, no radius. A page that wants the builder on a card wraps it in
    one, which is the ordinary thing to do and the thing every other component
    on that page already does.

    This used to accept the box as a prop and re-render it as JSX so the
    consumer's element WAS the panel. It worked, and it was a seam that had to
    keep the role, the accessible name, the slot, `data-readonly` and the two
    focus-capture handlers alive across an element the primitive did not own,
    plus a documented rule about which way `className` merged. A wrapper needs
    none of that, so the wrapper is what it is.
  */

  return (
    <div
      {...panelProps}
      // The padding every strip reads, resolved once here. An inline style
      // rather than a pair of classes because it is a VALUE, not a utility:
      // there is one declaration to beat instead of a `py-*` and a `px-*` in
      // three places that all have to keep agreeing.
      style={
        {
          [PANEL_PAD_VAR]:
            mode === "inline" ? PANEL_PAD_INLINE : PANEL_PAD_POPOVER,
        } as React.CSSProperties
      }
      className={cn(PANEL_CLASS, className)}
    >
      {body}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Root                                    */
/* -------------------------------------------------------------------------- */

export interface FiltersAdvancedProps {
  /**
   * Where the builder lives.
   *
   * `"popover"` hangs it off a trigger, which is what a toolbar wants. Inline
   * renders the same panel with no popup at all, for a filter sidebar or a
   * settings page where the builder IS the page. Named after the cascader's own
   * `inline`, which solves the same problem the same way.
   */
  mode?: "popover" | "inline"
  /** Replaces the default trigger. Ignored inline. */
  trigger?: React.ReactNode
  /** Whether rows can be reordered. See `FiltersProps.reorderable`. */
  reorderable?: boolean
  /** Popover placement. */
  align?: "start" | "center" | "end"
  className?: string
}

export function FiltersAdvanced<V, O>({
  mode = "popover",
  trigger,
  reorderable = false,
  align = "start",
  className,
}: FiltersAdvancedProps) {
  const actions = useFilterActions<V, O>()
  const sizes = filterControlSizes(actions)
  const { ruleCount } = useFilterState<V>()
  const [open, setOpen] = React.useState(false)

  if (mode === "inline") {
    return (
      <FiltersAdvancedPanel<V, O>
        mode="inline"
        reorderable={reorderable}
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/*
        `actions.disabled` alone, and READ ONLY DELIBERATELY DOES NOT GATE IT.
        Opening this panel is reading, not writing: the builder it reveals is
        the only place the whole query is legible at once, groups, parentheses
        and all, and every control inside it already refuses to change anything.
        Dimming the one affordance that shows a read-only user what the view is
        filtered by would be locking the door to the library.
      */}
      <PopoverTrigger
        // On the TRIGGER rather than on the button below it, so a consumer's
        // own trigger wears the same state: the default button was the only
        // element carrying it, which left `trigger` looking live on a bar that
        // is switched off. Still `actions.disabled` alone, for the reason
        // above.
        disabled={actions.disabled}
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              variant="outline"
              size={sizes.button}
              // THE COUNT IN THE NAME, not only in the box. `{ruleCount}` on its own is
              // a numeral with no unit: the computed name of this button was "Advanced
              // filter" and the badge contributed nothing an assistive technology could
              // interpret, while a consumer who replaces `trigger` never had the badge
              // at all. Label in Name still holds - the visible words are contained in
              // the name - and the badge itself is hidden, because a bare "4" read out
              // after the label says what it counts to nobody.
              aria-label={
                ruleCount > 0
                  ? `${actions.labels.advancedFilter}, ${actions.labels.countAnnouncement(ruleCount)}`
                  : undefined
              }
            >
              <HugeiconsIcon icon={FilterMailIcon} strokeWidth={2}
              />
              {actions.labels.advancedFilter}
              {ruleCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground rounded-sm px-1.5 text-xs tabular-nums"
                >
                  {ruleCount}
                </span>
              ) : null}
            </Button>
          )
        }
      />
      {/*
        Wide enough for a nested group to keep its columns of real words at
        depth three, which is the depth the chrome now budgets for. The rows
        truncate rather than wrap, so the panel's width is the one thing
        deciding how much of a nested path stays readable, and the group card,
        its footer and the trailing grip-and-kebab pair all take their share
        from it before the cells do.
      */}
      <PopoverContent
        align={align}
        // THE POPUP'S OWN NAME. It is a `role="dialog"`, and without this a
        // reader entering it hears "dialog" and nothing else: the panel's name
        // is one level in, on its own `role="group"`. The same string, because
        // it is the same thing - the trigger says "Advanced filter" and so does
        // what it opens.
        aria-label={actions.labels.advancedFilter}
        className={cn("w-[42rem] max-w-[95vw] p-0", className)}
      >
        {/*
          `mode` defaults to "popover" here, which is what keeps the panel's own
          padding - the popover content is `p-0`, so that padding IS the popup's
          inner padding.
        */}
        <FiltersAdvancedPanel<V, O> reorderable={reorderable} />
      </PopoverContent>
    </Popover>
  )
}
