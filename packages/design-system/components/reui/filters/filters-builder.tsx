// @ts-nocheck
"use client"

import * as React from "react"
import {
  Cascader,
  CascaderEmpty,
  CascaderList,
  CascaderPanel,
  CascaderStatus,
} from "@pi-dash/design-system/components/reui/cascader/cascader"
import { CascaderFooter } from "@pi-dash/design-system/components/reui/cascader/cascader-footer"
import {
  CascaderBreadcrumb,
  CascaderInput,
  CascaderNav,
} from "@pi-dash/design-system/components/reui/cascader/cascader-nav"
import { CascaderVirtualItems } from "@pi-dash/design-system/components/reui/cascader/cascader-virtual"
import type {
  CascaderActionItem,
  CascaderLabels,
  CascaderNode,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import {
  filterControlSizes,
  filterReadOnlyProps,
  useFilterActions,
  useFilterState,
} from "@pi-dash/design-system/components/reui/filters/filters-context"
import {
  FILTER_FIELD_PICKER_CLASS,
  getFilterField,
  getFilterFieldCount,
  joinFilterPath,
  splitFilterPath,
} from "@pi-dash/design-system/components/reui/filters/filters-lib"
import { getDefaultFilterOperator } from "@pi-dash/design-system/components/reui/filters/filters-operators"
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover"
import { HugeiconsIcon } from "@hugeicons/react"
import { FilterAddIcon } from "@hugeicons/core-free-icons"

/* -------------------------------------------------------------------------- */
/*                            Schema -> cascader tree                         */
/* -------------------------------------------------------------------------- */

/**
 * Projects the field schema onto cascader nodes.
 *
 * `node.value` is the JOINED PATH, so a commit hands back a value that splits
 * straight into `rule.path` with no lookup, and `details.path` lines up segment
 * for segment with the field chain.
 *
 * Only the field tree is projected. Operators and values deliberately stay out
 * of it: an operator is a bounded enum derived from the field's type, and a
 * value is an arbitrary control. Encoding either as tree nodes was the losing
 * move in both rejected architectures, because it forces the whole wizard
 * through a combobox that owns the arrow keys and `aria-activedescendant`.
 */
function toCascaderNodes<V, O>(
  fields: readonly FilterField<V, O>[],
  parentPath: string[] = []
): CascaderNode<FilterField<V, O>>[] {
  return fields.map((field) => {
    const path = [...parentPath, field.id]
    const node: CascaderNode<FilterField<V, O>> = {
      value: joinFilterPath(path),
      label: field.label,
      icon: field.icon,
      description: field.description,
      keywords: field.keywords,
      disabled: field.disabled,
      data: field,
    }
    if (field.fields?.length) {
      node.children = toCascaderNodes(field.fields, path)
      node.count = getFilterFieldCount(field)
    }
    return node
  })
}

/* -------------------------------------------------------------------------- */
/*                                Field picker                                */
/* -------------------------------------------------------------------------- */

export interface FilterFieldPickerProps {
  /** The level being browsed. Not the chosen field. */
  path: string[]
  onPathChange: (path: string[]) => void
  query: string
  onQueryChange: (query: string) => void
  /**
   * A field was chosen. Receives the operator it should start on, already
   * resolved against what the field actually offers, so no caller re-derives it.
   */
  onSelect: (path: string[], defaultOperator: string | null) => void
  /** Viewport height before the list scrolls. */
  maxHeight?: number
  /**
   * Cascader strings beyond the ones `FilterLabels` covers, merged over the
   * bridge below. The picker translates its back control, empty state, path
   * separator, counts and announcements from `FilterLabels` on its own; the
   * deeper cascader copy (the keyboard hint, the level announcements) is
   * translated here.
   */
  labels?: Partial<CascaderLabels>
  /**
   * Pinned footer rows under the list ("Create custom field..."). The same
   * contract as the cascader's own `actions`: commands stay OUT of the option
   * ring, so arrows, typeahead and the query never land on one.
   */
  actions?: CascaderActionItem[]
}

/**
 * The attribute picker, fully controlled.
 *
 * Controlled rather than draft-driven so the SAME picker serves both chromes.
 * The create popover drives it from the draft reducer, because there the
 * browsing level has to survive a Back press; an advanced row drives it from
 * its own state, because a row amends a rule that already exists and has no
 * wizard to step through. Making it own neither is what keeps there from being
 * a second field picker.
 */
export function FilterFieldPicker<V, O>({
  path,
  onPathChange,
  query,
  onQueryChange,
  onSelect,
  maxHeight = 260,
  labels: labelsProp,
  actions: actionItems,
}: FilterFieldPickerProps) {
  const actions = useFilterActions<V, O>()

  const items = React.useMemo(
    () => toCascaderNodes(actions.index.roots),
    [actions.index]
  )

  /**
   * The `FilterLabels` half of the picker's copy, bridged onto the cascader's
   * own keys so ONE `labels` prop on the root translates the whole picker: the
   * back control, the empty state, the deep-search path separator (which now
   * agrees with the chip's), the branch counts and affordances, and the
   * results announcement. The keys the bridge does not cover (the keyboard
   * hint, the level announcements) come through `labelsProp`, merged last so a
   * consumer override always wins.
   */
  const cascaderLabels = React.useMemo<Partial<CascaderLabels>>(
    () => ({
      search: actions.labels.searchFields,
      back: actions.labels.back,
      empty: actions.labels.empty,
      pathSeparator: actions.labels.pathSeparator.trim() || "/",
      itemCount: actions.labels.itemCount,
      branchAffordance: actions.labels.branchAffordance,
      rootLevel: actions.labels.fieldsLabel,
      panelLabel: actions.labels.fieldsLabel,
      resultsAnnouncement: actions.labels.resultsAnnouncement,
      actionsLabel: actions.labels.actionsLabel,
      ...labelsProp,
    }),
    [actions.labels, labelsProp]
  )

  return (
    <Cascader
      inline
      // Pinned open with a no-op change handler. In inline mode the cascader
      // renders no popup at all (`enabled: open || !!inline`), and Base UI
      // additionally disables dismissal and forces `open` when inline, so the
      // unconditional `setOpen(false)` its single-select commit performs cannot
      // dismiss anything. That is what makes reusing it here safe WITHOUT the
      // `multiple` plus `max` workaround, which would have put
      // `aria-multiselectable="true"` on every single-choice step.
      open
      onOpenChange={() => {}}
      items={items}
      // LEAVES commit, branches navigate - the cascader's own default, stated
      // by omitting the predicate rather than by passing one back.
      //
      // It used to pass `isFilterFieldSelectable`, which honoured a branch's
      // `selectable` opt-in, and that made a row like "Company >" both
      // drillable and committable. A single click cannot mean both: the row
      // carries a chevron and a count of 4, so pressing it read as "open
      // Company's attributes" and instead created a filter on Company and
      // dismissed the picker. `isFilterFieldPickable` is the rule now, and it
      // is the rule for BOTH shipped pickers - this one serves the chip flow
      // and the advanced row alike. Filtering on a branch itself stays
      // possible, as an explicit row in a consumer's own picker; see that
      // helper.
      searchScope="deep"
      // Nothing in this list is ever selected (`value=""` below), so no check
      // can be drawn and the inline-end gutter every style reserves for one is
      // pure dead space: a leaf row's label stopped ~24px short of the edge,
      // and a branch's count and chevron stopped there too. `indicator={false}`
      // gives that column back, so every row ends exactly where the labels
      // start on the other side.
      indicator={false}
      path={path}
      onPathChange={onPathChange}
      // Both `open` and `inputValue` are controlled. The query needs it: the
      // single-select arm of `commit()` never calls `setQuery("")`, only the
      // close path does, so an uncontrolled query typed to find a field would
      // bleed straight into the next step.
      inputValue={query}
      onInputValueChange={onQueryChange}
      value=""
      onValueChange={(value) => {
        const nextPath = splitFilterPath(value)
        const field = getFilterField(actions.index, nextPath)
        if (!field) return
        onSelect(
          nextPath,
          getDefaultFilterOperator(field, actions.resolveOperators(field))
        )
      }}
      labels={cascaderLabels}
      actions={actionItems}
      // The one channel: `CascaderList` resolves its cap from the root through
      // context, and a second copy on the list is a divergence waiting to
      // happen.
      maxHeight={maxHeight}
    >
      <CascaderPanel>
        <CascaderNav>
          <CascaderInput placeholder={actions.labels.searchFields} />
        </CascaderNav>
        <CascaderBreadcrumb />
        <CascaderEmpty />
        <CascaderList>
          {/*
            WINDOWED, unlike the option menus. The picker is where scale lives -
            a 2,000 field schema is one flat level three drills down, and a deep
            search can match most of it - and nothing here pins, so the pin
            keeper's stand-down does not apply. Below the cascader's threshold
            this renders exactly what `CascaderItems` renders, so small schemas
            pay nothing.
          */}
          <CascaderVirtualItems />
        </CascaderList>
        <CascaderFooter />
        <CascaderStatus />
      </CascaderPanel>
    </Cascader>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Field step                                 */
/* -------------------------------------------------------------------------- */

/** The picker, wired to the draft reducer. */
function FieldStep<V, O>() {
  const actions = useFilterActions<V, O>()
  const { draft } = useFilterState<V>()

  return (
    <FilterFieldPicker<V, O>
      path={draft?.cascaderPath ?? []}
      onPathChange={(next) =>
        actions.dispatchDraft({ type: "setCascaderPath", path: next })
      }
      query={draft?.query ?? ""}
      onQueryChange={(query) =>
        actions.dispatchDraft({ type: "setQuery", query })
      }
      onSelect={(path, defaultOperator) =>
        actions.dispatchDraft({ type: "selectField", path, defaultOperator })
      }
    />
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Builder                                   */
/* -------------------------------------------------------------------------- */

export interface FiltersBuilderProps {
  /** Replaces the default Add filter button. */
  trigger?: React.ReactNode
  className?: string
}

/**
 * The Add filter popover.
 *
 * One popup, ONE panel: the field step. Picking a field commits the rule
 * immediately and the operator menu opens on the chip that was just created,
 * so the popover never holds a second or third step the user has to walk. The
 * draft reducer still models the later steps (`operator`, `value`, Back
 * between them), because they are the headless surface a consumer-composed
 * wizard drives; the shipped chrome simply does not need them.
 *
 * It cannot open at all while the bar is disabled or read only, and NOT because
 * the trigger says so: `open` is derived from the draft, and `openCreate` is one
 * of the actions the mutation boundary refuses, so every route to this popover -
 * this button, a consumer's own trigger, a direct `actions.openCreate()` - dies
 * at the same place. The button below carries the state so it can be seen; it
 * does not enforce it.
 */
export function FiltersBuilder<V, O>({ trigger, className }: FiltersBuilderProps) {
  const actions = useFilterActions<V, O>()
  const sizes = filterControlSizes(actions)
  const { draft, ruleCount } = useFilterState<V>()
  const open = draft !== null && draft.ruleId === null
  /**
   * Whether the close about to happen is the HANDOFF to a new chip.
   *
   * The ordering around that close is deliberate and documented below: the
   * panel closes, the chip is created and its condition menu opens, all in one
   * commit, and Base UI's own microtask-then-rAF sequence is what hands focus
   * across. Nothing here may disturb that.
   *
   * What can be removed is the FADE. On a handoff the panel is a 224px card
   * dissolving over the very menu the user is now meant to read, which is the
   * flash reported against the chip bar and not against the advanced builder,
   * whose picker is a small cell popover beside its successor rather than on
   * top of it. Dropping the exit animation makes the panel simply cease, so
   * there is nothing to overlap; with no animation to wait for, Base UI also
   * unmounts it immediately.
   *
   * A DISMISS still fades. Escape and an outside press are not handing over to
   * anything, so the panel keeps the softer exit the rest of the bar uses.
   */
  const committing =
    draft !== null && draft.ruleId === null && draft.status === "ready"
  // LATCHED, because `committing` is true for a single render. The commit
  // effect nulls the draft on the very next one, so a class keyed straight off
  // it would be gone before the exit it is meant to suppress had begun. The
  // latch is raised when the field is chosen and lowered only when the panel is
  // next opened, so it is still standing for the whole of the close.
  //
  // Adjusted during render rather than in an effect, which is React's own
  // answer to "derive state from a prop change" and the same idiom the inline
  // value cell uses a few files over: an effect would paint one frame with the
  // stale value, and one frame is exactly the window this is about.
  const [instantExit, setInstantExit] = React.useState(false)
  if (committing && !instantExit) setInstantExit(true)
  else if (open && !committing && instantExit) setInstantExit(false)
  // Once the row carries filters, the button's label is redundant with the
  // chips beside it, so it collapses to its icon and gives the row back its
  // horizontal space. The accessible name stays.
  //
  // Both states are rungs of ONE ladder now, `sizes.icon` against
  // `sizes.button`, rather than the hardcoded `icon` and `default` this flipped
  // between. The pairing is what keeps the two states the same height and the
  // same corner radius in every style at every bar size: `icon-sm` and `sm`
  // share a radius in nova and lyra, `icon` and `default` share one everywhere.
  // The hardcoded pair agreed with the rest of the bar at ONE bar size and
  // drifted at the other two.
  const compact = ruleCount > 0

  /*
   * The focus handoff to the new chip is Base UI's own ordering, NOT something
   * this file arranges.
   *
   * Committing a field closes this popover and opens the operator menu on the
   * chip created in the same commit, so both want focus. The restore on close
   * runs in a MICROTASK (`FloatingFocusManager`, on unmount) and a popup's
   * initial focus runs in a rAF, so the order is always trigger-then-menu,
   * inside one frame and before paint. An earlier revision suppressed the
   * restore with `finalFocus` to "win" that race; it only removed the safety
   * net, because a frame where the menu does not take focus then leaves focus
   * on the BODY rather than on the button the user pressed.
   */

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) actions.closeDraft()
        else actions.openCreate()
      }}
    >
      <PopoverTrigger
        // On the TRIGGER rather than on the button below it, so a consumer's
        // own trigger wears the state too. The boundary refuses either way -
        // `openCreate` is gated - but a button that gives no sign of it is a
        // button the user presses twice before believing it, and `trigger` is
        // the documented way to replace this one.
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              variant="outline"
              size={compact ? sizes.icon : sizes.button}
              aria-label={compact ? actions.labels.addFilter : undefined}
              // THE RESET BOUNCE, and it is not a transition this primitive
              // wrote: the shadcn button's base class carries `transition-all`,
              // so clearing the last filter, which flips the size class, EASED
              // every interpolable difference between the two. Inline padding
              // ran from 0 to `px-6` in sera over 150ms while the width, which
              // cannot interpolate to `auto`, snapped in a single frame, so the
              // box arrived and its contents settled into it afterwards.
              //
              // `cn` is tailwind-merge, so naming a transition here REPLACES
              // `transition-all` rather than competing with it for the cascade,
              // and what is named is the non-geometric half of what it covered:
              // colour and ring still ease under the pointer, and nothing that
              // occupies space eases at all. The flip now lands in one frame,
              // the same frame the chips leave in.
              className="transition-[color,background-color,border-color,box-shadow]"
            >
              {/*
                A funnel with a plus, because this button ADDS a filter rather
                than representing filtering in general. Phosphor and RemixIcon
                ship no filter-plus glyph, so they keep the plain funnel; the
                button carries `aria-label` either way, so the difference is
                decorative.
              */}
              <HugeiconsIcon icon={FilterAddIcon} strokeWidth={2}
              />
              {compact ? null : actions.labels.addFilter}
            </Button>
          )
        }
      />
      {/*
        The default, then the ROOT's override, then this component's own
        `className` last, so a consumer who sets both gets the specific one.
      */}
      <PopoverContent
        align="start"
        className={cn(
          FILTER_FIELD_PICKER_CLASS,
          // See `instantExit`. Both PROPERTIES, because the panel carries an
          // `exit` animation AND a transition, and either one left running
          // keeps it painted over its successor.
          //
          // And both TWINS' attributes, for the reason the action controls list
          // theirs: Base UI marks a closing popup with `data-ending-style`,
          // Radix says the same thing with `data-state="closed"`. Only one can
          // ever match in a given build, and the string stays identical on both
          // sides so the byte lock holds. Listing only the Base UI half is what
          // left the radix twin still fading a 224px card over its successor.
          instantExit &&
            cn(
              // Base UI.
              "data-ending-style:animate-none data-ending-style:transition-none",
              // Radix.
              "data-[state=closed]:animate-none data-[state=closed]:transition-none"
            ),
          actions.fieldPickerClassName,
          className
        )}
      >
        <FieldStep<V, O> />
      </PopoverContent>
    </Popover>
  )
}

/** Exported for custom field pickers. */
export { toCascaderNodes }
