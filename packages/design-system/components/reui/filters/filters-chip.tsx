// @ts-nocheck
"use client"

import * as React from "react"
import {
  filterControlSizes,
  filterReadOnlyProps,
  isFilterLocked,
  useFilterActions,
  useFilterReorderable,
  useFilterChipAutoOpen,
  useFilterChipFocused,
  useFilterFocusEmpty,
  useFilterFocusStore,
  useFilterRender,
} from "@pi-dash/design-system/components/reui/filters/filters-context"
import {
  FilterMenu,
  useFilterOptions,
  useFilterValueResolution,
} from "@pi-dash/design-system/components/reui/filters/filters-editors"
import {
  FILTER_MENU_CLASS,
  FILTER_MENU_LABEL_CLASS,
  collapseFilterPath,
  formatFilterPath,
  getFilterField,
  getFilterFieldChain,
} from "@pi-dash/design-system/components/reui/filters/filters-lib"
import {
  findFilterNode,
  isFilterGroup,
} from "@pi-dash/design-system/components/reui/filters/filters-query"
import {
  coerceFilterValue,
  getFilterArity,
  getFilterOperator,
  operatorTakesValue,
  visibleFilterOperators,
} from "@pi-dash/design-system/components/reui/filters/filters-operators"
import type {
  FilterEditorProps,
  FilterField,
  FilterGroupNode,
  FilterOperator,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"
import {
  ButtonGroup,
  ButtonGroupText,
} from "@pi-dash/design-system/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu"
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
import { ArrowDataTransferHorizontalIcon, ArrowRight01Icon, Cancel01Icon, Copy01Icon, CornerDownRightIcon, Delete02Icon, Layers01Icon, MoreVerticalIcon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons"

/**
 * Which part of the chip a pointer or key is aimed at.
 *
 * No `field`: the attribute segment is display only, so nothing ever aims at
 * it. The store's own union keeps `field` for the advanced builder, whose rows
 * do let an attribute be re-picked.
 */
type ChipSegment = "operator" | "value" | "menu"

/**
 * The ref half of `autoFocusProps`, shared by every editor this host mounts.
 *
 * A CALLBACK ref, because that is the one ref shape an editor can spread onto
 * any element without a cast, and a NO-OP, because this host steers focus with
 * `autoFocus` alone and reads nothing back. A host that needs the focused
 * node (a wizard panel restoring focus on step changes) supplies its own
 * callback here; the contract is the shape, not this particular function.
 */
const noopAutoFocusRef: React.RefCallback<HTMLElement> = () => {}

/* -------------------------------------------------------------------------- */
/*                                Value display                               */
/* -------------------------------------------------------------------------- */

/**
 * How a committed value reads in the chip.
 *
 * Display is a separate concern from editing, which is why `renderValue` and
 * the editor are two different hooks rather than one. The chip shows
 * "Select time" or "3 selected"; the editor is the calendar or the option list
 * that produced it.
 */
function defaultValueDisplay<V>(
  value: V | undefined,
  operator: FilterOperator | undefined,
  resolveOption: (value: string) => { label: string } | undefined,
  labels: ReturnType<typeof useFilterActions>["labels"],
  // The field's own word for "no value yet", when it has one. The generic label
  // has to serve every type at once, so it cannot be better than vague; a Score
  // field saying "enter text..." is simply wrong. The editor already prefers
  // `field.placeholder` over the label, and the chip reading something else
  // than the input it opens is the kind of drift this rewrite exists to remove.
  fieldPlaceholder?: string,
  /**
   * Whether the value is PICKED rather than typed.
   *
   * An option field's `placeholder` is its search box's prompt - "Search
   * countries..." - which reads as nonsense standing in for a value, and the
   * generic "enter text..." is worse: it names the one interaction a select
   * does not offer. Both are skipped for `labels.selectPlaceholder`.
   */
  optionBacked?: boolean
): string {
  const emptyLabel = optionBacked
    ? labels.selectPlaceholder
    : (fieldPlaceholder ?? labels.valuePlaceholder)
  if (value === undefined || value === null || value === "") {
    return emptyLabel
  }

  if (getFilterArity(operator) === "range" && Array.isArray(value)) {
    const [from, to] = value as unknown[]
    return labels.valueRange(String(from ?? ""), String(to ?? ""))
  }

  if (Array.isArray(value)) {
    const values = value as string[]
    if (values.length === 0) return emptyLabel
    // One pick reads better by name than as a count.
    if (values.length === 1) {
      return resolveOption(values[0])?.label ?? String(values[0])
    }
    return labels.valueCount(values.length)
  }

  if (typeof value === "boolean") return value ? "True" : "False"

  return resolveOption(String(value))?.label ?? String(value)
}

/**
 * The same display, with the option's own icon in front of it.
 *
 * A status filter reads as its colour before it reads as its word, so dropping
 * the swatch the picker showed makes the chip harder to scan than the list it
 * came from.
 */
function valueWithIcon<V>(
  value: V | undefined,
  text: string,
  resolveOption: (value: string) => { icon?: React.ReactNode } | undefined
): React.ReactNode {
  const single =
    value === undefined || value === null || Array.isArray(value)
      ? Array.isArray(value) && value.length === 1
        ? String(value[0])
        : null
      : String(value)
  const icon = single ? resolveOption(single)?.icon : null
  if (!icon) return text
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*                                One rule, read                              */
/* -------------------------------------------------------------------------- */

/**
 * The glyph between two ancestors in a nested attribute path.
 *
 * A chevron rather than the `pathSeparator` string it replaces on screen. The
 * text ">" is set at the label's own size and weight, so between two names it
 * reads as loud as the names themselves; a chevron at `size-3` is chrome, which
 * is what a separator is.
 *
 * DECORATIVE, and it has to stay that way: `aria-hidden` keeps it out of every
 * accessible name, and the plain-string separator is still what
 * `formatFilterPath` joins for the chip's own name, its `title` and the advanced
 * builder's truncated attribute cell. Drawing the structure without also saying
 * it would degrade "Company > Team > Lead" to "Company Team Lead".
 *
 * Not exported, and it does not need to be: both chromes render the
 * `pathLabel` that `useFilterRuleDisplay` builds HERE, so the shared hook IS
 * how the chip and the builder draw the identical thing - a second copy in
 * `filters-advanced` is how the two chromes drift.
 */
function FilterPathSeparator() {
  return (
    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2}
      aria-hidden="true"
      data-slot="filter-path-separator"
      // The full muted token, not the `/60` the string carried. At text size a
      // 60% tint of an already-muted colour still had the label's own stroke
      // weight to carry it; a size-3 chevron has a fraction of the ink and
      // composites to about 2.3:1 on white, which is fainter than a separator
      // between two names should be even when it is decoration.
      //
      // ONE margin, BOTH hosts, so the two chromes cannot disagree about how
      // dense a path reads. The builder's attribute cell leaves the chevron in
      // an inline run where this margin is the only air there is, and the chip
      // wraps `pathLabel` in a zero-gap flex span for exactly that reason (see
      // the chip's path segment) rather than letting its `gap-1.5` stack on top
      // of the margin. 3px a side against a 12px glyph reads as one path; the
      // 8px the chip used to produce read as three separate names.
      //
      // Centred for BOTH hosts, by two tokens that are each inert in the other
      // one: `self-center` centres the flex item in the chip, where
      // `vertical-align` is ignored outright, and the arbitrary `align` centres
      // the inline box in the builder, where `self-center` is the ignored one.
      // `align-middle` is NOT that value. CSS resolves `middle` against the
      // parent's x-HEIGHT, which put the chevron 1.27px below the centre of the
      // capitals beside it - the "not perfectly centred" the truncated cell got
      // blamed for. 0.3635em is half Inter's cap height and 0.375rem is half
      // `size-3`, so the glyph's own centre lands on the cap centre, within
      // 0.01px at every text size the eight styles set.
      //
      // `inline` is load-bearing, not tidying. The app's reset gives every `svg`
      // `display: block`, which a flex host silently swallows - a flex item is
      // blockified whatever it asked for - but the builder's inline run does
      // not: a block box there ends the line on both sides, so `Repository >
      // Stars` came out as three stacked lines in a `truncate` cell that had
      // told it `nowrap`, and no `vertical-align` reaches a block box at all.
      // Inline-block keeps the intrinsic size a bare `inline` would drop, and
      // the chip cannot tell the difference.
      className="text-muted-foreground mx-[3px] inline-block size-3 shrink-0 self-center align-[calc(0.3635em_-_0.375rem)]"
    />
  )
}

/**
 * The elided run of a collapsed path, and the whole path behind it.
 *
 * `collapseFilterPath` hands back the nodes it hid, which is the tooltip's
 * payload, and this draws the one segment that stands for them. What the tooltip
 * shows is the FULL path rather than only the hidden middle: the question a
 * reader has under a shortened breadcrumb is "what is this attribute", not
 * "which two levels were dropped".
 *
 * THE TOOLTIP IS NOT THE ACCESSIBLE ROUTE, and this is the part worth reading
 * twice. A tooltip is hover and focus, so it is unavailable to touch and
 * unreliable through some assistive technology - so the segment is
 * `aria-hidden`, exactly as the chevron separator beside it is, and the full
 * path stays where it already was: in the accessible NAME of the control (the
 * chip group's `aria-label`, the builder cell's). That is the same answer
 * `valueDetail` gives for a collapsed "3 selected", and for the same reason: an
 * abbreviation a screen reader cannot expand is a removal.
 *
 * The host's own `title` is dropped while a path is collapsed (see
 * `pathCollapsed`), because the native tooltip and this one would otherwise both
 * fire under one pointer.
 */
function FilterPathEllipsis({ full }: { full: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-hidden="true"
              data-slot="filter-path-ellipsis"
              // A path SEGMENT, so it carries no air of its own: it stands in
              // for names, and a name is parted from what follows it by the
              // chevron's margin alone. Its own `mx` used to STACK on that one,
              // setting a collapsed path 2px looser on the ellipsis side of a
              // chevron than on the other. Muted, because it reads as chrome.
              // Plain inline and no `vertical-align`: `middle` resolves against
              // the x-height and sat the dots 1.7px low, and the inline-block
              // box grew the builder's run from 20px to 21.17px.
              className="text-muted-foreground shrink-0 self-center"
            >
              ...
            </span>
          }
        />
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Everything a rule needs in order to be READ, in either chrome. */
export interface FilterRuleDisplay {
  /** The field path as plain text, for an accessible name. */
  pathText: string
  /** The same path as nodes, so the separator can be drawn as a chevron. */
  pathLabel: React.ReactNode
  /**
   * Whether `pathLabel` is showing fewer names than the path actually has.
   *
   * Read by both hosts for ONE reason: the cell's own `title` has to step aside
   * for the ellipsis segment's tooltip, or a pointer resting on a shortened
   * breadcrumb fires two tooltips saying the same sentence. Everything else
   * about the collapse is already decided inside `pathLabel`.
   */
  pathCollapsed: boolean
  operatorLabel: string
  valueLabel: React.ReactNode
  /**
   * The same value as PLAIN TEXT, for an accessible name.
   *
   * Never the consumer's `renderValue` node: a display that draws avatars,
   * colour dots or a count badge is the normal case, and a name taken from
   * whatever text happened to survive inside it announces "plus one" for two
   * people. Kept separate from `valueLabel` rather than derived from it,
   * because there is no honest way to read text back out of a React node.
   *
   * A field whose values do not stringify (a date token, a custom range)
   * supplies `valueText` beside `renderValue`, or the built-in fallback says
   * "[object Object]" to exactly the audience the visible display is hiding
   * it from.
   */
  valueText: string
  /**
   * The same value with any collapsed COUNT spelled out, or `valueText` again
   * when there was nothing to spell out.
   *
   * The display has room for "3 selected" and no more, which is a summary a
   * reader cannot recover the three values from. Editable that is fine: opening
   * the editor shows them. Locked it is not, and a read-only bar exists to be
   * READ, so the value control carries this as its `title` and, while the bar
   * refuses to open anything, as its accessible name. See `labels.valueDetail`.
   */
  valueFullText: string
  /** Whether the value segment is showing a placeholder rather than a value. */
  valueEmpty: boolean
}

/**
 * How one rule reads, resolved once and shared by both chromes.
 *
 * The chip and an advanced row show the SAME sentence in different furniture,
 * so the precedence that produces it - a consumer `renderValue`, then the
 * field's own, then the built-in display with the option's icon in front of it -
 * belongs in one place. Duplicating it is how the old primitive ended up
 * rendering a different value in its two pickers.
 */
export function useFilterRuleDisplay<V, O>(
  rule: FilterRule<V>,
  field: FilterField<V, O> | undefined,
  operator: FilterOperator | undefined
): FilterRuleDisplay {
  const actions = useFilterActions<V, O>()
  const render = useFilterRender<V, O>()
  // Lazily: a rule only needs options in order to render a LABEL, so nothing is
  // fetched until an editor actually opens.
  const optionsState = useFilterOptions<V, O>(field, false)

  const values =
    rule.value === undefined || rule.value === null
      ? []
      : Array.isArray(rule.value)
        ? (rule.value as unknown[])
        : [rule.value]

  // The saved-view path: values the loader has never returned are resolved
  // through the field's own `resolveValues` into the instance-wide store, so a
  // restored chip reads "John Doe" rather than the id it was persisted with.
  useFilterValueResolution(field, values)

  const pathText = formatFilterPath(
    actions.index,
    rule.path,
    actions.labels.pathSeparator
  )

  // Rendered as segments rather than one joined string, so the separator can be
  // a chevron: it is chrome between the names, not part of either name. The
  // joined `pathText` above is unaffected, and stays the accessible form.
  const chain = getFilterFieldChain(actions.index, rule.path)
  // Collapsed with the CASCADER's collapser, through both chromes at once. The
  // root publishes the setting on the actions context rather than to one host,
  // so a deep path reads the same way on a chip and in a builder row - the two
  // renderings of one path disagreeing about where the ellipsis goes is the
  // thing the shared hook exists to prevent.
  const segments = collapseFilterPath(chain, {
    maxSegments: actions.maxPathSegments,
    collapse: actions.pathCollapse,
  })
  const pathCollapsed = segments.some((segment) => segment.type === "ellipsis")
  const pathLabel = chain.length
    ? segments.map((segment, index) => (
        <React.Fragment
          // Positional, because a field id is unique among its SIBLINGS only:
          // "Company > Team > Company" is a legal path and its two ids collide.
          key={
            segment.type === "field"
              ? `${index}:${segment.field.id}`
              : `${index}:ellipsis`
          }
        >
          {index > 0 ? <FilterPathSeparator /> : null}
          {segment.type === "field" ? (
            <span>{segment.field.label}</span>
          ) : (
            <FilterPathEllipsis full={pathText} />
          )}
        </React.Fragment>
      ))
    : pathText

  const operatorLabel = operator
    ? rule.negated
      ? actions.labels.negated(operator.label)
      : operator.label
    : rule.operator || actions.labels.selectCondition

  const valueEmpty =
    rule.value === undefined ||
    rule.value === null ||
    rule.value === ("" as unknown as V) ||
    values.length === 0

  if (!field) {
    return {
      pathText,
      pathLabel,
      pathCollapsed,
      operatorLabel,
      valueLabel: "",
      valueText: "",
      valueFullText: "",
      valueEmpty,
    }
  }

  const valueContext = {
    value: rule.value,
    values,
    field,
    operator: operator ?? { value: rule.operator, label: rule.operator },
    // Resolved, not empty. A custom display needs the option behind each stored
    // value to draw a colour, an avatar or a label, and re-resolving them at
    // every call site is exactly the duplication this rewrite removes.
    options: values
      .map((entry) => optionsState.resolve(String(entry)))
      .filter(Boolean) as NonNullable<
      ReturnType<typeof optionsState.resolve>
    >[],
    labels: actions.labels,
  }

  // Computed even when a custom display replaces it: this is the string the
  // accessible name is built from, and the one thing every path agrees on. A
  // field whose values do not stringify overrides it with `valueText`, which
  // receives the same context `renderValue` does and owns both states, the
  // empty one included.
  const valueText = field.valueText
    ? field.valueText(valueContext)
    : defaultValueDisplay(
        rule.value,
        operator,
        optionsState.resolve,
        actions.labels,
        field.placeholder,
        // Option-backed by the FIELD, not by the operator: `is any of` is a
        // multi-value operator on a plain text field too, and that one really
        // is typed into.
        field.type === "select" ||
          field.type === "multiselect" ||
          Boolean(field.options?.length) ||
          Boolean(field.loadOptions)
      )

  const valueLabel = render.renderValue
    ? render.renderValue(valueContext)
    : field.renderValue
      ? field.renderValue(valueContext)
      : valueWithIcon(rule.value, valueText, optionsState.resolve)

  // The list behind the count, or the same text again when nothing was
  // collapsed. See `valueDetail` for why a summary needs one at all.
  //
  // Only the multi-value case: a RANGE also stores an array, and its display
  // already spells both ends out ("10 to 99"), so enumerating it would turn a
  // sentence back into "10, 99". A field that supplies its own `valueText` owns
  // its wording entirely and is left alone.
  const valueFullText =
    field.valueText ||
    !Array.isArray(rule.value) ||
    getFilterArity(operator) === "range" ||
    values.length < 2
      ? valueText
      : actions.labels.valueDetail(
          valueText,
          values.map(
            (entry) =>
              optionsState.resolve(String(entry))?.label ?? String(entry)
          )
        )

  return {
    pathText,
    pathLabel,
    pathCollapsed,
    operatorLabel,
    valueLabel,
    valueText,
    valueFullText,
    valueEmpty,
  }
}

/* -------------------------------------------------------------------------- */
/*                                Value editor                                */
/* -------------------------------------------------------------------------- */

interface FilterValueEditorProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  operator: FilterOperator
  /** Whether the surface holding it is showing. Gates the option service. */
  open: boolean
  /** The editor is finished. The host dismisses. */
  onClose: () => void
}

/**
 * The value editor, with its draft, its option service and its commit - and
 * with NO surface of its own.
 *
 * Split out from the popover so the surface and the wiring can be replaced
 * independently: the value segment's popover hosts it today, a consumer's own
 * chrome can host it tomorrow, and neither needs a copy of the draft, the
 * option service or the commit. That is the same reason `host` exists at all:
 * the old primitive had `SelectOptionsPopover` and `FilterSubmenuContent`, two
 * ~300 line implementations of one control that had already drifted apart.
 *
 * The draft lives here, not in the query. A text filter therefore dispatches
 * once on commit rather than once per keystroke through a controlled parent,
 * which is what made the old one re-run consumer grid predicates per character.
 */
function FilterValueEditor<V, O>({
  rule,
  field,
  operator,
  open,
  onClose,
}: FilterValueEditorProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const [draft, setDraft] = React.useState<V | undefined>(rule.value)

  // Re-seed the draft each time the host opens, so a discarded edit does not
  // survive into the next one.
  React.useEffect(() => {
    if (open) setDraft(rule.value)
  }, [open, rule.value])

  const options = useFilterOptions<V, O>(field, open)
  // A LOOKUP through the actions channel, not a definition: every result is
  // either a module-level built-in or the consumer's own component off the
  // schema, and both keep their identity across renders, so the editor is
  // never remounted mid-edit. The memo makes that stability explicit rather
  // than incidental.
  const editor = React.useMemo(
    () => actions.resolveEditor(field, operator),
    [actions, field, operator]
  )

  if (!editor) return null

  const editorProps: FilterEditorProps<V, O> = {
    field,
    operator,
    value: draft,
    onValueChange: (next) => setDraft(next as V),
    host: "amend",
    autoFocusProps: {
      ref: noopAutoFocusRef,
      autoFocus: true,
    },
    commit: (next, commitOptions) => {
      actions.updateRule(rule.id, {
        value: (next === undefined ? draft : next) as V,
      })
      // A multi-select commits on every toggle and asks to stay put, so the
      // list the user is picking from is not torn down between picks. Anything
      // that commits once and is done falls through and dismisses.
      if (commitOptions?.close === false) return
      onClose()
    },
    cancel: onClose,
    // The same thing as cancel, and honestly so: `back` is documented as
    // meaningful only to a `create` host, and this one is always `amend`. It
    // used to be the condition menu's route back to its own list, from the
    // revision where that menu drew the editor itself.
    back: onClose,
    options,
    labels: actions.labels,
  }

  // `createElement` rather than `<Editor {...props} />`: the component comes
  // out of a lookup, so writing it as JSX reads to the linter as a component
  // defined during render (`react-hooks/static-components`) even though every
  // result is either a module-level built-in or the consumer's own schema
  // value. The fragment keeps the call inside a JSX tree, which is where the
  // props object - it carries the auto-focus ref - is not mistaken for a ref
  // being READ during render.
  return <>{React.createElement(editor, editorProps)}</>
}

/* -------------------------------------------------------------------------- */
/*                                Step handoff                                */
/* -------------------------------------------------------------------------- */

/**
 * One step of the flow, released when the panel that owes it has LEFT THE DOM.
 *
 * The chip flow is a sequence of popups, and a sequence only reads as one if
 * the next surface opens after the previous one has stopped being painted.
 * Both popover implementations keep their portal content mounted for the whole
 * of the exit transition, so the moment this component unmounts IS that moment.
 * No duration is written down here and none has to be: a style that shortens
 * the transition, or a reader with `prefers-reduced-motion` who has none at
 * all, moves the handoff with it. A `setTimeout` guess would have to be
 * re-guessed for each of those, and would be untestable in all of them.
 *
 * `onRelease` is used AS the cleanup rather than wrapped in one, so a caller
 * that hands over a fresh callback each render fires its step early instead of
 * on unmount. Memoizing it is a requirement of this component, not a nicety.
 *
 * In development React mounts, unmounts and remounts every component once, so
 * this fires one extra time immediately after mounting. Harmless by
 * construction: a caller parks its request at the moment it commits a choice,
 * which is never the frame the panel appeared.
 */
function FilterStepHandoff({ onRelease }: { onRelease: () => void }) {
  React.useEffect(() => onRelease, [onRelease])
  return null
}

/* -------------------------------------------------------------------------- */
/*                             Segment host popover                           */
/* -------------------------------------------------------------------------- */

/**
 * The value host: the value editor in a popover anchored to the value segment.
 *
 * BOTH routes to a value end here, and putting them together is the whole of
 * one fix. Pressing a value that already exists opens it where the user
 * pressed; choosing a condition hands off to it once the condition menu has
 * left the DOM. The operator popover used to draw the editor itself, and the
 * two openings then disagreed about where the panel belonged: the handed-off
 * one sat under the CONDITION segment, one segment's width to the left of the
 * panel a second press produced on the very same row. One host and one anchor,
 * so the first open and every reopen after it land in the same place.
 */
export interface FilterValuePopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  operator: FilterOperator | undefined
  /**
   * The element that opens it, WITH its own children.
   *
   * A render element rather than a wrapper the popover draws itself, because
   * the two chromes disagree about the shape entirely: a chip segment must be a
   * direct child of its `ButtonGroup` for the pill to fuse, while an advanced
   * row's cell is a bordered box in a grid cell. What they share is everything
   * behind the trigger, which is what this component is.
   */
  trigger: React.ReactElement
  className?: string
}

export function FilterValuePopover<V, O>({
  rule,
  field,
  operator,
  trigger,
  className,
}: FilterValuePopoverProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const focusStore = useFilterFocusStore()
  const autoOpen = useFilterChipAutoOpen(rule.id) === "value"
  const [open, setOpen] = React.useState(false)
  const locked = isFilterLocked(actions)

  // The last step of the flow as well as the amend route, so this is where the
  // condition menu hands the row on. By the time the flag arrives that menu has
  // UNMOUNTED - see `FilterStepHandoff` - so this open is the only popup on the
  // row rather than the second of two crossfading over each other.
  //
  // The handoff is CONSUMED as it is honoured, not left standing. Leaving the
  // flag set meant this effect re-fired the moment the popover closed - the
  // dependency list holds `open` - so Escape dismissed the editor and it
  // reopened in the same frame, and the step could not be backed out of at all.
  //
  // Consumed even when the bar refuses to open, which is the same reason read
  // the other way round: a handoff nobody spends sits armed until some later
  // chip spends it, and a chip that opened its editor because a DIFFERENT chip
  // was arrowed onto is worse than one that opened nothing.
  React.useEffect(() => {
    if (!autoOpen || open) return
    if (!locked) setOpen(true)
    focusStore.set({ id: rule.id, segment: "value", autoOpen: false })
  }, [autoOpen, open, focusStore, rule.id, locked])

  // Nothing to open. The trigger still renders, so the value keeps its place in
  // the row rather than the layout shifting around a missing box.
  //
  // It wears the bar's state anyway. Everything below hangs the state on the
  // TRIGGER component, which this return path does not reach, so a field whose
  // type has no registered editor drew the one segment in the chip that still
  // looked live while every other one said unavailable - and on a disabled bar
  // it was the one segment still in the tab order. What it can be operated for
  // is unchanged either way: nothing.
  if (!operator || !actions.resolveEditor(field, operator)) {
    return React.cloneElement(
      trigger as React.ReactElement<Record<string, unknown>>,
      { disabled: actions.disabled, ...filterReadOnlyProps(actions) }
    )
  }

  return (
    // REFUSES to open while locked rather than leaving it to the trigger's own
    // state. The trigger below is `aria-disabled` while read only, and an
    // aria-disabled control that still opens an editor when a key reaches it is
    // a control that lied; controlling the open state is also the one guard
    // that reads identically in both twins, where the pointer route into a
    // popup does not.
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && locked) return
        setOpen(next)
      }}
    >
      {/*
        The trigger IS the segment, not a wrapper around it. `ButtonGroup`
        fuses its children with `*:data-slot:rounded-r-none` and
        `[&>[data-slot]~[data-slot]]:border-l-0`, which match DIRECT children
        only. Nesting the segment inside a trigger button leaves each segment
        with its own full border and radius, so the chip reads as a row of
        separate badges instead of one pill.
      */}
      <PopoverTrigger
        render={trigger}
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
      />
      <PopoverContent align="start" className={cn("w-auto p-0", className)}>
        <FilterValueEditor<V, O>
          rule={rule}
          field={field}
          operator={operator}
          open={open}
          onClose={() => {
            setOpen(false)
            focusStore.set({ id: rule.id, segment: "value", autoOpen: false })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/*                            Why there is no field amend                     */
/* -------------------------------------------------------------------------- */

/**
 * A chip's ATTRIBUTE is fixed once the chip exists. There is deliberately no
 * field popover here.
 *
 * A chip is one filter, read left to right as a sentence, and only the last two
 * words of it are still a question: the condition and the value. Re-picking the
 * attribute is not an edit of that sentence, it is a different sentence - a new
 * field invalidates the operator (its catalog differs) and the value (its
 * options differ), so "amending" it silently threw both away and left a chip
 * that shared nothing with the one the user pressed but its position in the
 * row. It also gave the row a third popover that opens from the chip, on the
 * segment a pointer crosses first on its way to the other two.
 *
 * To change the attribute, remove the chip and add another: two presses, both
 * reversible, neither of which destroys work invisibly.
 *
 * The ADVANCED builder keeps its field picker, and that is not an
 * inconsistency. A builder row shows every cell at once inside a panel the user
 * opened to edit a query document, so re-picking an attribute there is visibly
 * an edit of one row of a form rather than a click on a summary pill.
 */

/* -------------------------------------------------------------------------- */
/*                                Operator list                               */
/* -------------------------------------------------------------------------- */

/**
 * The condition menu, and the step after it.
 *
 * The list is the cascader run flat, not a listbox this file owns. An operator
 * menu is navigation, and navigation is the one thing a filter bar should never
 * be hand-rolling: the old primitive's version used `aria-selected` for the
 * keyboard HIGHLIGHT and expressed the real selection only as a visual mark, so
 * a screen reader was told the wrong row was chosen, and it had no Home, End,
 * typeahead or RTL keys at all.
 *
 * It HANDS OFF to the value segment's own popover, and it waits for its own
 * panel to leave the DOM before it does. An earlier revision advanced in place
 * instead, drawing the value editor inside this popover to save a dismiss and
 * an open animation across the gap between the two segments. It cost more than
 * it saved, in two ways that were reported as separate bugs:
 *
 *  - the panel stayed anchored to the CONDITION segment, so the editor arrived
 *    one segment's width to the LEFT of where the same editor opens when the
 *    value is pressed a second time. The first open and every reopen after it
 *    disagreed about where the value editor lives;
 *  - in the advanced builder a text or number value is an INPUT IN THE ROW, not
 *    a popup at all, so advancing in place drew a second editor in a popover on
 *    top of the one the row already had.
 *
 * The WAIT is what keeps it to one popup at a time. `FilterStepHandoff` above
 * arms the store from the panel's own unmount, which both popover
 * implementations run after the exit transition, so the condition menu has
 * stopped being painted before the value editor mounts. Nothing is timed, and
 * the two twins need no branch: an unmount is an unmount in both.
 *
 * Pressing the value segment directly opens the same popover on the same
 * anchor, which is the point: there is one value editor and one place it lives.
 */
export interface FilterOperatorPopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  /** The element that opens it, with its own children. */
  trigger: React.ReactElement
  className?: string
}

export function FilterOperatorPopover<V, O>({
  rule,
  field,
  trigger,
  className,
}: FilterOperatorPopoverProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const focusStore = useFilterFocusStore()
  const autoOpen = useFilterChipAutoOpen(rule.id) === "operator"
  const [open, setOpen] = React.useState(false)
  const locked = isFilterLocked(actions)
  /**
   * Whether the close this panel is going through IS the step being handed on.
   *
   * A ref rather than state, because nothing renders differently for it and it
   * has to survive the render that closes the popover so the unmount can read
   * it. Every close this component did not ask for clears it, which is what
   * keeps Escape working: a request left standing would be spent by the very
   * unmount that Escape causes, and the value editor would open on the frame
   * the user dismissed the menu - the exact regression the two auto-open
   * effects are written to avoid.
   *
   * It records the CLOSE rather than a pending request, and `release` below
   * deliberately leaves it standing, because one twin asks the same question
   * again later: Radix restores focus to the trigger a macrotask after the
   * unmount, so its `onCloseAutoFocus` runs after the store has already been
   * armed. Every OPEN clears it instead - both the pointer path and the
   * auto-open - so it can never be read across two separate closes.
   */
  const handoff = React.useRef(false)
  const operators = actions.resolveOperators(field)
  const operator = getFilterOperator(operators, rule.operator)

  // Memoized because the array IS the menu's identity: the cascader builds its
  // index once per `items` identity, so a fresh array on every render would
  // rebuild it on every keystroke in the search field.
  const items = React.useMemo(
    () =>
      visibleFilterOperators(operators).map((entry) => ({
        value: entry.value,
        label: entry.label,
      })),
    [operators]
  )

  // Opened by the root the moment the chip is created, so picking a field flows
  // straight into picking a condition with no extra click. The flag is CONSUMED
  // here, for the reason spelled out on the value popover's copy of this: an
  // unconsumed handoff re-opens the menu on the frame Escape closes it.
  React.useEffect(() => {
    if (!autoOpen || open) return
    // The one open that does not go through `onOpenChange`, so it clears the
    // previous close's record here instead. See the ref.
    handoff.current = false
    // Consumed even while locked, for the reason on the value popover's copy.
    if (!locked) setOpen(true)
    focusStore.set({ id: rule.id, segment: "operator", autoOpen: false })
  }, [autoOpen, open, focusStore, rule.id, locked])

  const close = () => {
    // A close that is not the handoff retires it. See the ref's own comment.
    handoff.current = false
    setOpen(false)
    focusStore.set({ id: rule.id, segment: "operator", autoOpen: false })
  }

  /**
   * The parked step, spent on the frame this panel stops existing.
   *
   * Memoized on nothing that changes: the store is a context value and the id
   * is fixed for the life of the chip. That is load bearing rather than tidy -
   * `FilterStepHandoff` uses this function AS its cleanup, so a new identity
   * mid-flow would fire the step while the menu was still open.
   *
   * Keyed to THIS rule, so what it arms can only ever be answered by the chip
   * that parked it. No later chip can spend it, and the store flag itself is
   * consumed by whichever value surface honours it.
   */
  const release = React.useCallback(() => {
    if (!handoff.current) return
    focusStore.set({ id: rule.id, segment: "value", autoOpen: true })
  }, [focusStore, rule.id])

  // The chip going away takes its step with it. React destroys a deleted
  // subtree from the top down, so this runs before the panel's own cleanup and
  // the store is never left pointing at a rule that no longer exists - an id
  // nothing owns takes the row's single tab stop with it.
  React.useEffect(
    () => () => {
      handoff.current = false
    },
    []
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Refuses to open while locked, for the reason on the value popover.
        if (next && locked) return
        // Escape, an outside press, a second press on the segment: none of them
        // is the step being taken, so none of them may spend it.
        //
        // RETIRED ON OPEN, not on close, and that distinction is a twin
        // difference rather than a preference. The note this replaces assumed
        // the commit "closes the popover directly rather than through here",
        // which is true of Base UI and NOT of Radix: there, choosing an item
        // dismisses the popup through this handler as well, so retiring on
        // every close wiped the request between the commit setting it and the
        // unmount spending it, and the value editor never opened on the radix
        // twin at all.
        //
        // Keying on the flag instead is exact. Only the commit ever raises it,
        // one line before it closes this panel, so a close that finds it raised
        // IS the handoff; every other close finds it already lowered and has
        // nothing to retire. An open lowers it, which is what stops a request
        // outliving the step that made it.
        if (next) handoff.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={trigger}
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
      />
      <PopoverContent
        align="start"
        // `w-auto` with a FLOOR rather than a fixed width: an operator catalog
        // sizes itself to its longest label, and "is" and "is greater than or
        // equal to" are the same menu at two very different widths. The floor
        // is what the shortest catalog needs to not read as a scrap of paper -
        // a boolean field offers "is" and "is not" and nothing else.
        className={cn("w-auto min-w-40 p-0", className)}
      >
        {/*
          INSIDE the panel deliberately: this is the element whose unmount says
          the panel has finished closing, and only a child of the content is
          unmounted by the exit transition rather than by the close itself.
        */}
        <FilterStepHandoff onRelease={release} />
        <FilterMenu
          items={items}
          selected={rule.operator ? [rule.operator] : []}
          onSelectionChange={(values) => {
            const value = values[0]
            // Deselecting the committed operator would leave the chip reading
            // "Select condition" again, which is a step backwards rather than a
            // choice, so pressing the current row simply closes.
            if (value === undefined) {
              close()
              return
            }
            const chosen = getFilterOperator(operators, value)
            actions.updateRule(rule.id, {
              operator: value,
              // The value moves with the operator rather than being left in the
              // previous arity's shape. "is" to "is any of" would otherwise
              // leave a bare string where every reader expects an array, and
              // an `arity: none` operator would keep a value nothing renders.
              value: coerceFilterValue(
                rule.value,
                getFilterOperator(operators, rule.operator),
                chosen
              ) as V,
            })
            if (operatorTakesValue(chosen)) {
              // PARKED, not opened. The row is handed to its value surface by
              // `release` once this panel has unmounted, so the two never share
              // a frame; closing here is what starts that.
              handoff.current = true
              setOpen(false)
              return
            }
            // The condition WAS the whole filter, so the panel is finished.
            close()
          }}
          labels={actions.labels}
          ariaLabel={field.label}
          searchPlaceholder={actions.labels.searchOperators}
          // No visible search field. An operator catalog is a CLOSED enum of
          // six to ten short labels, all of them on screen at once, so a
          // search box over it is a row of height and a focus stop spent on a
          // list that has nothing to hide. It is still rendered, visually
          // hidden, because it is the element that owns focus and
          // `aria-activedescendant`: removing it would take the arrow keys,
          // Home, End and typeahead with it. Typing still narrows the list,
          // exactly as typing into a native `<select>` does.
          searchable={false}
          // Taller than a value list on purpose. The operator set is CLOSED and
          // fully known, so showing all of it at once is worth the height;
          // a value list is open ended and would only push its own footer off
          // the screen for the same trade.
          maxHeight={320}
          // Deliberately unpinned. There is exactly one selected operator and
          // the list is short, so lifting it to the top would reorder a stable
          // menu for no gain and lose the reading order the catalog declares -
          // "is" next to "is not", "contains" next to "does not contain".
        />
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Rule menu                                 */
/* -------------------------------------------------------------------------- */

/**
 * The keyboard path to a CROSS-GROUP move.
 *
 * Pointer drag can drop a condition into any group; Alt+Arrow deliberately
 * reorders within the owning group only, so without this menu the sole
 * keyboard route "into" a group was Wrap, which creates a NEW group rather
 * than moving into an existing one, and the drag layer's cross-group move had
 * no keyboard parity at all. The move lands through `actions.moveNodeTo`, the
 * same mutator a pointer drop commits through, so both paths announce the
 * same sentence from the live region.
 *
 * Groups carry no names of their own, so destinations are numbered in document
 * order, the order the builder draws them, and the numbering is stable
 * whichever row's menu is open: the excluded current parent still counts.
 *
 * Exported and named for a NODE rather than a rule, because the advanced
 * builder's group menu offers the same move on a whole group. A group brings one
 * extra exclusion with it: itself and everything under it. `moveFilterNodeTo`
 * already refuses that move - it would detach the subtree and leave a cycle - so
 * offering it would be a menu row that quietly does nothing.
 */
export function FilterMoveToMenuItems({ nodeId }: { nodeId: string }) {
  const actions = useFilterActions()
  // A menu ITEM takes the native word, not `aria-disabled`: both twins' menus
  // implement `disabled` as roving-focusable and `aria-disabled` already, so
  // the row stays reachable and announces itself, which is the same outcome the
  // buttons get the long way round.
  const reorderable = useFilterReorderable()
  const locked = isFilterLocked(actions)
  // Read at render time: the menu's content mounts when the menu opens, so
  // this is the tree the user is looking at.
  const query = actions.getQuery()
  const found = findFilterNode(query, nodeId)
  if (!found || !found.parent) return null

  const destinations: { id: string; label: string; size: number }[] = []
  if (found.parent.id !== query.id) {
    destinations.push({
      id: query.id,
      label: actions.labels.moveToTopLevel,
      size: query.rules.length,
    })
  }

  let position = 0
  // `inside` suppresses the PUSH and not the walk, so the numbering stays
  // document order: skipping the recursion instead would renumber every group
  // that happens to sit after the one being moved.
  const visit = (group: FilterGroupNode<unknown>, inside: boolean) => {
    for (const child of group.rules) {
      if (!isFilterGroup(child)) continue
      position += 1
      const within = inside || child.id === nodeId
      if (!within && child.id !== found.parent!.id) {
        destinations.push({
          id: child.id,
          label: actions.labels.moveToGroup(position),
          size: child.rules.length,
        })
      }
      visit(child, within)
    }
  }
  visit(query, false)

  if (destinations.length === 0) return null

  // The THIRD route into a move, and it has to answer to the same switch as the
  // other two. The grip and Alt+Arrow are both gated on `reorderable`; leaving
  // these ungated meant a builder that draws no handle still reordered from a
  // menu, which is the capability being off for a pointer and quietly on for
  // everyone else.
  if (!reorderable) return null

  return (
    <>
      {destinations.map((destination) => (
        <DropdownMenuItem
          key={destination.id}
          disabled={locked}
          onClick={() =>
            actions.moveNodeTo(nodeId, destination.id, destination.size)
          }
        >
          {/* A bend into the destination: movement, not duplication and not
              nesting, which keeps it distinct from Duplicate's copy glyph and
              Wrap's layers. */}
          <HugeiconsIcon icon={CornerDownRightIcon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>{destination.label}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

/**
 * The per-rule actions, without the trigger that opens them.
 *
 * The chip's kebab and an advanced row's kebab act on the same rule in the same
 * ways, so only the button around them differs.
 *
 * Two rows are conditional, and on different things. `allowGrouping` is the
 * CHROME's answer to "can this rendering show a group at all"; "Convert to
 * advanced filter" is the CONSUMER's, and it disappears on an advanced bar on
 * its own rather than being another flag a caller has to remember to pass.
 */
export function FilterRuleMenuItems({
  ruleId,
  /**
   * Offer "Wrap in condition group".
   *
   * Off for the chip row, which has nowhere to draw the group it would create,
   * so the rule would appear to do nothing. On in the builder, where it is the
   * ONLY way to nest an existing condition without dragging, and therefore the
   * whole keyboard path to a nested query.
   */
  allowGrouping = false,
}: {
  ruleId: string
  allowGrouping?: boolean
}) {
  const actions = useFilterActions()
  // Gated here as well as at the trigger, because this is EXPORTED: the shipped
  // chromes keep their menu shut while locked, and a consumer who mounts these
  // rows in a menu of their own gets rows that say they are unavailable rather
  // than rows that quietly do nothing.
  const locked = isFilterLocked(actions)
  return (
    /*
      Every row leads with an icon.

      `IconPlaceholder` rather than a direct import: the same source ships under
      five icon sets and is rewritten per set when a consumer installs it, so a
      hardcoded lucide glyph would be the one thing in the menu that does not
      follow their choice. No size class either - each style already sizes an
      unsized svg inside a menu row (`[&_svg:not([class*='size-'])]:size-4`) and
      spaces it with the row's own gap, so a number here would be the one row in
      the app that ignores its style. `aria-hidden` because the label IS the
      accessible name; the glyph is there to be found by eye, not read out
      twice.
    */
    <>
      <DropdownMenuItem
        disabled={locked}
        onClick={() => actions.duplicateNode(ruleId)}
      >
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2}
          aria-hidden="true"
        />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.duplicate}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={locked}
        onClick={() => actions.negateRule(ruleId)}
      >
        {/* Two arrows swapping: negation flips the condition to its declared
            inverse rather than wrapping it in a NOT. */}
        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2}
          aria-hidden="true"
        />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.negate}</span>
      </DropdownMenuItem>
      {allowGrouping ? (
        <DropdownMenuItem
          disabled={locked}
          onClick={() => actions.wrapNodeInGroup(ruleId)}
        >
          {/* Layers, not braces: braces exist in three of the five sets and
              nothing in the other two reads as grouping, and a menu whose glyph
              changes meaning with the icon set is worse than one metaphor
              everywhere. Nesting is what the action does. */}
          <HugeiconsIcon icon={Layers01Icon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.wrapInGroup}</span>
        </DropdownMenuItem>
      ) : null}
      {allowGrouping ? <FilterMoveToMenuItems nodeId={ruleId} /> : null}
      {/*
        OPTIONAL, and gated on both halves of "would this do anything".
        The handler is what a consumer opts in with - `variant` is theirs to
        set, so this primitive cannot switch chrome on its own and a row
        without a handler would be a row that does nothing. The variant test is
        the second half: an already-advanced bar offering to become advanced is
        the no-op the owner asked not to ship, and testing it HERE rather than
        asking the consumer to withhold the handler means they cannot get it
        wrong by passing it unconditionally.

        NOT gated on `locked`, and that is not an oversight. It changes no
        query - it is the same category as `announce`, which asks the lock
        nothing for the same reason - and a read-only bar being readable in the
        builder as well as the chip row is the audience `readOnly` exists for.
        The boundary is untouched either way: this row is handed no mutator, so
        there is nothing here for a consumer's handler to write with, and the
        shipped kebab refuses to OPEN while locked, so the row is only ever
        reachable from a consumer-composed menu in the first place.
      */}
      {actions.convertToAdvanced && actions.variant !== "advanced" ? (
        <DropdownMenuItem onClick={() => actions.convertToAdvanced?.()}>
          {/* Sliders: the "advanced settings" glyph in every set that has one,
              and the one metaphor that survives all five. Tabler and RemixIcon
              name the same drawing differently. */}
          <HugeiconsIcon icon={SlidersHorizontalIcon} strokeWidth={2}
            aria-hidden="true"
          />
          <span className={FILTER_MENU_LABEL_CLASS}>
            {actions.labels.convertToAdvanced}
          </span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        variant="destructive"
        disabled={locked}
        onClick={() => actions.removeNode(ruleId)}
      >
        {/* No colour of its own: the destructive variant already paints the
            row's svgs, so a class here would only be a second place to keep in
            step with the theme. */}
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2}
          aria-hidden="true"
        />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.remove}</span>
      </DropdownMenuItem>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Chip                                    */
/* -------------------------------------------------------------------------- */

export interface FilterChipProps<V = unknown> {
  rule: FilterRule<V>
  /** Position in the row, for the roving tabindex and arrow navigation. */
  index: number
}

/**
 * One filter, as a chip.
 *
 * Memoized, and it means something here: the actions context is referentially
 * stable, the focus store is subscribed down to a boolean, and the query tree
 * shares structure, so editing one filter in a bar of forty re-renders one chip
 * rather than forty. In the old primitive every chip's closures were rebuilt on
 * every parent render, so memoizing would have bought nothing.
 */
function FilterChipImpl<V, O>({ rule, index }: FilterChipProps<V>) {
  const actions = useFilterActions<V, O>()
  const render = useFilterRender<V, O>()
  const focusStore = useFilterFocusStore()
  const focused = useFilterChipFocused(rule.id)
  const noFocus = useFilterFocusEmpty()
  const locked = isFilterLocked(actions)
  // THE CHIP'S HEIGHT, by way of the one button in it that has one.
  //
  // `ButtonGroup` is `items-stretch` and no style gives `cn-button-group-text`
  // a height, so the three text segments have no definite cross size and
  // stretch to the tallest child. The kebab below is the only child that IS
  // sized, so its rung is the pill's height, in every style, with no size
  // variant on `ButtonGroup` and no hardcoded number here.
  //
  // The RADIUS survives it, which is the half that has broken before. Every
  // style whose `icon-sm` square would round differently from a group text
  // segment already re-pins it inside a group (`in-data-[slot=button-group]`
  // in nova and vega, a flat `rounded-none` in lyra); the other five give
  // `icon-sm` no radius at all, so it keeps the same one `icon` had. The
  // fusion itself is untouched either way: nothing here adds an element or
  // moves a segment out of being a direct child.
  const sizes = filterControlSizes(actions)
  // The kebab is CONTROLLED so it can refuse to open. Every mutating row behind
  // it is gated, so a menu that opened with all of them dead would be a menu
  // whose only content is a disappointment; the trigger says unavailable
  // instead, and keeps its tab stop while it says it.
  //
  // The one row that is NOT a mutation - "Convert to advanced filter" - is
  // therefore unreachable from THIS trigger while the bar is locked, and that
  // is a deliberate trade rather than an oversight: relaxing the refusal to
  // suit one optional row would put a menu on a read-only bar whose contents
  // depend on a prop, and the row stays reachable from a consumer-composed
  // menu, where `FilterRuleMenuItems` draws it ungated.
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Exactly one chip is in the tab order at a time. Before anything has been
  // focused that is the first chip, so Tab reaches the row in one press.
  const isTabStop = focused || (noFocus && index === 0)

  const field = getFilterField(actions.index, rule.path)
  const operators = field ? actions.resolveOperators(field) : []
  const operator = getFilterOperator(operators, rule.operator)

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

  if (!field) {
    // A rule pointing at a field the schema no longer has. Dropping it silently
    // would lose a saved view's data on a schema change; rendering nothing at
    // all leaves an invisible condition still filtering the data.
    //
    // It carries the SAME roving wiring as a real chip. `data-slot` alone put
    // it in the row's arrow-key query while `tabIndex` and `data-rule-id` were
    // missing, so navigation dead-ended beside an unfocusable div and the one
    // chip most in need of removing was the one the keyboard could not reach.
    // With the wiring, arrows land on it and Delete removes it through the
    // row's own scheme.
    return (
      <ButtonGroup
        data-slot="filter-chip"
        data-unknown=""
        role="group"
        aria-label={actions.labels.filterLabel(
          rule.path.join(actions.labels.pathSeparator)
        )}
        data-focused={focused || undefined}
        data-rule-id={rule.id}
        data-index={index}
        tabIndex={isTabStop ? 0 : -1}
        onFocusCapture={() => {
          if (!focused)
            focusStore.set({ id: rule.id, segment: null, autoOpen: false })
        }}
      >
        <ButtonGroupText className="bg-background dark:bg-input/30 text-muted-foreground">
          {rule.path.join(actions.labels.pathSeparator)}
        </ButtonGroupText>
        <Button
          variant="outline"
          size={sizes.icon}
          className="bg-background dark:bg-input/30"
          aria-label={actions.labels.remove}
          // It had no gate at all, so the one chip whose whole purpose is to be
          // removed could be removed from a bar that refuses every other edit.
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={() => actions.removeNode(rule.id)}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2}
          />
        </Button>
      </ButtonGroup>
    )
  }

  if (render.renderChip) return <>{render.renderChip(rule)}</>

  const focusSegment = (segment: ChipSegment) =>
    focusStore.set({ id: rule.id, segment, autoOpen: false })

  // A rule the user has not given a condition yet - the field committed, then
  // the operator menu was dismissed. It is kept rather than removed (see
  // `isFilterRuleComplete`), so it has to be legible as unfinished rather than
  // pass for a filter that is doing something.
  //
  // Legible through WORDS, not through a border style. The chip used to draw a
  // dashed outline as well, and it was the weakest of the four signals it had:
  // the operator segment reads the literal prompt "Select condition" at full
  // foreground while a finished chip's reads muted, the chip is a whole segment
  // short because there is no value to show, and the operator popover is open
  // over it at the moment the state is entered. The dash restated all of that
  // in the one channel a low-vision reader is least likely to resolve, and
  // under sera - whose segments carry only a bottom rule - it degraded to a
  // dashed underline, so it never was the uniform signal it claimed to be.
  // `data-incomplete` below stays, so a consumer who wants their own treatment
  // still has one selector to hang it on.
  const incomplete = !rule.operator

  // The same test the value segment is rendered under, so the name describes
  // the chip that is actually on screen. Reading `valueText` unconditionally
  // used to append the empty-value placeholder to conditions that HAVE no value
  // segment, and "Name is empty enter text..." is a sentence that contradicts
  // itself.
  const hasValue = Boolean(rule.operator) && operatorTakesValue(operator)

  // The value's spoken form in the chip's NAME. The visible segment shows the
  // editor's placeholder while empty, but a name is not a prompt: "Description
  // contains enter text..." reads as a sentence that trails off, so the name
  // says "no value" instead. A field-supplied `valueText` owns both states and
  // is left alone.
  const valueName =
    valueEmpty && !field.valueText ? actions.labels.noValue : valueText

  return (
    <ButtonGroup
      data-slot="filter-chip"
      role="group"
      aria-label={actions.labels.filterLabel(
        `${pathText} ${operatorLabel}${hasValue ? ` ${valueName}` : ""}`.trim() +
          (incomplete ? `, ${actions.labels.incomplete}` : "")
      )}
      data-focused={focused || undefined}
      data-incomplete={incomplete || undefined}
      data-rule-id={rule.id}
      tabIndex={isTabStop ? 0 : -1}
      className={cn(
        // Sera is an underline style: its group text and input group carry only
        // a bottom border, so normalise the boxed segments to match or the chip
        // reads as a mix of boxes and rules.
        ""
      )}
      onFocusCapture={() => {
        if (!focused)
          focusStore.set({ id: rule.id, segment: null, autoOpen: false })
      }}
      data-index={index}
    >
      {/*
        DISPLAY ONLY: a div, not a button, not a tab stop, no popover.
        The attribute is fixed for the life of the chip - see "Why there is no
        field amend" above. `title` because the path truncates on screen and the
        group's own accessible name already carries the whole of it.
      */}
      <ButtonGroupText
        // Dropped while the path is collapsed: the ellipsis inside carries a
        // tooltip with the same sentence, and a native `title` on the ancestor
        // fires under the pointer as well, so the two would stack.
        title={pathCollapsed ? undefined : pathText}
        className="bg-background dark:bg-input/30 cursor-default gap-1.5"
      >
        {field.icon}
        {/*
          Zero gap INSIDE the path, so the separator's own margin is the only
          air around a chevron here as well as in the builder's inline run. The
          group's `gap-1.5` still parts the type icon from the path, but it used
          to reach between the names too and stack on the margin, which set one
          chip's path 6px looser a side than the identical `pathLabel` drawn by
          the builder. The wrapper is the whole of the difference.
        */}
        <span className="flex items-center">{pathLabel}</span>
      </ButtonGroupText>

      <FilterOperatorPopover
        rule={rule}
        field={field}
        trigger={
          <ButtonGroupText
            render={<button type="button" />}
            className={cn(
              "hover:bg-accent bg-background dark:bg-input/30 cursor-default",
              // The operator is connective tissue between the field and the
              // value, so it should read quieter than either - unless it is
              // still the prompt "Select condition", which is the one thing on
              // the chip the user has to act on.
              incomplete ? "text-foreground" : "text-muted-foreground"
            )}
            onPointerDown={() => focusSegment("operator")}
          >
            {operatorLabel}
          </ButtonGroupText>
        }
      />

      {/*
        No condition, no value. `getFilterArity(undefined)` defaults to "one",
        so testing the operator alone would render an "enter text..." segment
        on a chip that has not been given a condition yet.
      */}
      {hasValue ? (
        <FilterValuePopover
          rule={rule}
          field={field}
          operator={operator}
          trigger={
            <ButtonGroupText
              render={<button type="button" />}
              // Named explicitly rather than by its own contents. The contents
              // are whatever the field chose to draw - a row of avatars, colour
              // dots, a "+2" badge - and a button whose name is "plus two" tells
              // a screen reader nothing about the two people it stands for.
              //
              // The name grows to the whole list exactly when the editor cannot
              // be opened, because it then has to carry what activation no
              // longer reveals: locked, "2 selected" is where the road ends
              // rather than a summary with a way into it. Editable it stays the
              // short form the segment shows, so the name and the label agree.
              aria-label={locked ? valueFullText : valueText}
              // The pointer's route to the same thing, and only when there is
              // more to say than the segment already says, so no chip grows a
              // tooltip that reads the word back under the cursor.
              title={valueFullText === valueText ? undefined : valueFullText}
              className={cn(
                "hover:bg-accent bg-background dark:bg-input/30 cursor-default",
                valueEmpty && "text-muted-foreground"
              )}
              onPointerDown={() => focusSegment("value")}
            >
              {valueLabel}
            </ButtonGroupText>
          }
        />
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
              variant="outline"
              size={sizes.icon}
              // The same surface the three text segments force. Styles whose
              // outline button is transparent in dark (sera, luma, rhea) left
              // the kebab as a notch in an otherwise filled pill.
              className="bg-background dark:bg-input/30"
              aria-label={actions.labels.chipMenu(field.label)}
              onPointerDown={() => focusSegment("menu")}
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2}
          />
        </DropdownMenuTrigger>
        {/*
          The SAME sizing the builder's menus use, from one constant, because
          these are the same rows: a menu that fits "Convert to group" in one
          chrome and cuts it in the other is one defect shipped twice. The
          consumer's override arrives the same way, from the root rather than
          from a prop on every chip.
        */}
        <DropdownMenuContent
          align="end"
          className={cn(FILTER_MENU_CLASS, actions.menuClassName)}
        >
          <FilterRuleMenuItems ruleId={rule.id} />
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

export const FilterChip = React.memo(FilterChipImpl) as typeof FilterChipImpl
