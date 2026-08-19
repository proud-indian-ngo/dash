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
import { CascaderItems } from "@pi-dash/design-system/components/reui/cascader/cascader-item"
import {
  CascaderInput,
  CascaderNav,
} from "@pi-dash/design-system/components/reui/cascader/cascader-nav"
import {
  useCascaderActions,
  useCascaderHighlight,
} from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import type {
  CascaderActionItem,
  CascaderNode,
} from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import type {
  CascaderItemState,
  CascaderProps,
} from "@pi-dash/design-system/components/reui/cascader/cascader"
import {
  FilterActionsContext,
  filterControlSizes,
  type FilterResolutionStore,
} from "@pi-dash/design-system/components/reui/filters/filters-context"
import {
  applyFilterExclusiveSelection,
  filterFilterOptions,
  joinFilterPath,
  normalizeFilterQuery,
  warnFilterOnce,
} from "@pi-dash/design-system/components/reui/filters/filters-lib"
import type {
  AnyFilterEditor,
  FilterLabels,
  FilterEditorProps,
  FilterEditorRegistry,
  FilterField,
  FilterIndex,
  FilterLoadResult,
  FilterOperator,
  FilterOption,
  FilterOptionsState,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"
import { ButtonGroup } from "@pi-dash/design-system/components/ui/button-group"
import { Input } from "@pi-dash/design-system/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

/* -------------------------------------------------------------------------- */
/*                              The options service                           */
/* -------------------------------------------------------------------------- */

interface OptionsInternalState<O> {
  items: FilterOption<O>[]
  loading: boolean
  error: boolean
  hasMore: boolean
  cursor?: string
}

const IDLE: OptionsInternalState<never> = {
  items: [],
  loading: false,
  error: false,
  hasMore: false,
}

/** Stable no-op subscription, for a hook running outside a `Filters` root. */
const emptySubscribe = () => () => {}
const zeroVersion = () => 0

/**
 * The joined path of a field, resolved through the schema index.
 *
 * The instance-wide resolution store is keyed by PATH rather than by field
 * identity, so its labels survive a schema rebuild (a structural change hands
 * every consumer new field objects). A plain function rather than a memo: the
 * walk is identity compares over `index.all`, microseconds at the flagship
 * 2,000-field scale, and the render paths that call it are event-driven
 * (memoized chips, open editors). A field object the index does not know (a
 * consumer holding their own) falls back to its id, which is the best stable
 * key available.
 */
function filterFieldKey<V, O>(
  field: FilterField<V, O> | undefined,
  index: FilterIndex | undefined
): string | null {
  if (!field) return null
  if (index) {
    for (const entry of index.all) {
      if ((entry.field as unknown) === (field as unknown)) {
        return joinFilterPath(entry.path)
      }
    }
  }
  return `#${field.id}`
}

/**
 * The shared option service every option-backed editor receives.
 *
 * This exists so that a custom editor never re-implements debouncing, aborting,
 * cursor paging or value-to-label resolution. In the old primitive each of the
 * two pickers owned its own copy of all of it, and the copies had already
 * drifted: different keyboard handling, different `maxSelections` behaviour,
 * different focus management. One service, handed to both hosts, is what makes
 * "the renderer is shared between selection mode and amend mode" true rather
 * than aspirational.
 *
 * It is also a DELIBERATE fork of the cascader's own async machinery
 * (`cascader-async.tsx` / `getChildren`), not an oversight. The cascader's
 * pipeline resolves tree LEVELS and lives inside its composite; this service
 * serves arbitrary editors, both hosts, and the chip's display path, where no
 * menu is mounted at all. The twin result shapes are kept aligned on purpose:
 * `FilterLoadResult` mirrors `CascaderLoadResult` field for field, so a loader
 * moves between the two primitives without reshaping.
 *
 * Resolution is two-tier. The per-instance ref cache is written in an EFFECT
 * (the old primitive wrote a module WeakMap during render, which is impure and
 * never hit anyway), and everything learned is ALSO written to the Filters
 * root's `FilterResolutionStore`: the chip's display instance and the editor's
 * fetching instance are two hook instances, and without the shared tier a
 * `loadOptions`-only field rendered its raw id the moment the menu closed.
 */
export function useFilterOptions<V, O>(
  field: FilterField<V, O> | undefined,
  enabled: boolean,
  debounceMs = 250
): FilterOptionsState<O> {
  const [query, setQueryState] = React.useState("")
  const [state, setState] = React.useState<OptionsInternalState<O>>(
    IDLE as OptionsInternalState<O>
  )

  const cache = React.useRef(new Map<string, FilterOption<O>>())
  const requestId = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  // The context is read directly rather than through `useFilterActions`, so
  // the hook degrades to per-instance resolution outside a `Filters` root
  // instead of throwing.
  const actionsContext = React.useContext(FilterActionsContext)
  const shared: FilterResolutionStore | null = actionsContext?.resolution ?? null
  const sharedKey = filterFieldKey(field, actionsContext?.index)

  // Re-render when a label lands ANYWHERE under this root: the editor's page
  // arriving for the chip that is already showing the value, or a
  // `resolveValues` result coming back for a restored view.
  React.useSyncExternalStore(
    shared ? shared.subscribe : emptySubscribe,
    shared ? shared.getVersion : zeroVersion,
    shared ? shared.getVersion : zeroVersion
  )

  const staticOptions = field?.options
  const loadOptions = field?.loadOptions
  const isAsync = Boolean(loadOptions)

  // Seed the caches from the static options, in an effect rather than during
  // render so the render stays pure.
  React.useEffect(() => {
    if (!staticOptions) return
    for (const option of staticOptions) cache.current.set(option.value, option)
    if (shared && sharedKey) shared.set(sharedKey, staticOptions)
  }, [staticOptions, shared, sharedKey])

  React.useEffect(() => {
    for (const option of state.items) cache.current.set(option.value, option)
    if (shared && sharedKey && state.items.length) {
      shared.set(sharedKey, state.items)
    }
  }, [state.items, shared, sharedKey])

  const run = React.useCallback(
    async (nextQuery: string, cursor: string | undefined, append: boolean) => {
      if (!loadOptions) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const id = ++requestId.current

      setState((previous) => ({
        ...previous,
        loading: true,
        error: false,
        items: append ? previous.items : [],
      }))

      try {
        const result = await loadOptions(nextQuery, {
          signal: controller.signal,
          cursor,
        })
        // A superseded request must not write. Comparing ids rather than
        // trusting the abort keeps an already-resolved promise from landing.
        if (id !== requestId.current) return

        const normalized: FilterLoadResult<O> = Array.isArray(result)
          ? { items: result }
          : result

        setState((previous) => ({
          items: append ? [...previous.items, ...normalized.items] : normalized.items,
          loading: false,
          error: false,
          hasMore: normalized.hasMore ?? Boolean(normalized.nextCursor),
          cursor: normalized.nextCursor,
        }))
      } catch (error) {
        if (id !== requestId.current) return
        if ((error as Error)?.name === "AbortError") return
        setState((previous) => ({
          ...previous,
          loading: false,
          error: true,
          hasMore: false,
        }))
      }
    },
    [loadOptions]
  )

  React.useEffect(() => {
    if (!enabled || !isAsync) return
    const timer = setTimeout(() => void run(query, undefined, false), debounceMs)
    return () => clearTimeout(timer)
  }, [enabled, isAsync, query, debounceMs, run])

  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const normalizedQuery = normalizeFilterQuery(query)

  // Synchronous fields filter locally; async fields already filtered server
  // side, so filtering their results again would hide rows the server matched
  // on something the label does not contain.
  const items = React.useMemo(() => {
    if (isAsync) return state.items
    return filterFilterOptions(staticOptions ?? [], normalizedQuery)
  }, [isAsync, state.items, staticOptions, normalizedQuery])

  const setQuery = React.useCallback((next: string) => setQueryState(next), [])

  const loadMore = React.useCallback(() => {
    if (!state.hasMore || state.loading) return
    void run(query, state.cursor, true)
  }, [state.hasMore, state.loading, state.cursor, query, run])

  const retry = React.useCallback(() => {
    void run(query, undefined, false)
  }, [query, run])

  const resolve = React.useCallback(
    (value: string) => {
      // Static options resolve straight from the schema. Going through the ref
      // cache alone meant the chip painted the raw stored value first and never
      // repainted, because writing a ref triggers no render. The shared store
      // comes next: it is where OTHER instances' pages and `resolveValues`
      // results live, and the subscription above re-renders this component
      // whenever it gains a label, so a read here is never stale for long.
      const declared = staticOptions?.find((option) => option.value === value)
      if (declared) return declared
      const fromShared =
        shared && sharedKey ? shared.get(sharedKey, value) : undefined
      if (fromShared) return fromShared as FilterOption<O>
      return cache.current.get(value)
    },
    [staticOptions, shared, sharedKey]
  )

  return {
    items,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    query,
    setQuery,
    loadMore,
    retry,
    resolve,
  }
}

/**
 * Resolves committed values no loaded page has covered, through the field's
 * own `resolveValues`, into the instance-wide store.
 *
 * The saved-view half of the async story: a restored query holds ids the
 * loader has never returned, so the chip has nothing to draw a label from.
 * The display path calls this with exactly the values it is about to render;
 * the store's claim set dedupes across chips and hosts, so an id is asked for
 * once however many places show it, and a fulfilled resolve that omits an id
 * marks it as asked so an unknown id is not re-requested forever. Only a
 * REJECTED resolve releases its claims, which is what lets a later mount
 * retry after a transient failure.
 */
export function useFilterValueResolution<V, O>(
  field: FilterField<V, O> | undefined,
  values: readonly unknown[]
): void {
  const actionsContext = React.useContext(FilterActionsContext)
  const shared: FilterResolutionStore | null = actionsContext?.resolution ?? null
  const sharedKey = filterFieldKey(field, actionsContext?.index)
  const resolveValues = field?.resolveValues
  const staticOptions = field?.options
  // Keyed by CONTENT: the caller rebuilds the array per render, and the NUL
  // separator is the same one every join in this primitive uses, for the same
  // reason - it cannot occur inside a real stored value.
  const valuesKey = values.map((entry) => String(entry)).join("\u0000")

  React.useEffect(() => {
    if (!resolveValues || !shared || !sharedKey || valuesKey === "") return
    const missing = valuesKey.split("\u0000").filter((value) => {
      if (staticOptions?.some((option) => option.value === value)) return false
      return shared.get(sharedKey, value) === undefined
    })
    const wanted = shared.claim(sharedKey, missing)
    if (wanted.length === 0) return

    // No unmount guard on the write: the store outlives the component and a
    // resolved label is valid whoever asked for it.
    void Promise.resolve(resolveValues(wanted)).then(
      (options) => shared.set(sharedKey, options),
      () => shared.release(sharedKey, wanted)
    )
  }, [resolveValues, shared, sharedKey, valuesKey, staticOptions])
}

/* -------------------------------------------------------------------------- */
/*                               Shared chrome                                */
/* -------------------------------------------------------------------------- */

/**
 * The panel every editor renders into.
 *
 * A plain flex column, NOT a combobox. That is deliberate: an editor nested
 * inside a Base UI composite would inherit its `aria-activedescendant` and its
 * arrow keys, which is fine for a row-shaped control and hostile to a colour
 * picker, a slider or an embedded grid. Keeping the surface plain is what makes
 * "any custom control at any level" genuinely open rather than open only to
 * controls that happen to look like a list.
 */
function EditorPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="filter-editor"
      className={cn(
        "flex w-full flex-col gap-2 p-2",
        // The option list's height cap, published as a VARIABLE rather than
        // passed down as a number. 16rem is the 256px the menu has always
        // used, so nothing moves by default; what changes is who can outrank
        // it. The cascader writes a `maxHeight` prop into an inline style on
        // its list shell, which no consumer class can beat, whereas this sits
        // on the very element a field's own `className` is merged onto - so
        // a field setting `--cascader-max-height` simply wins, the same way
        // a `w-*` there already beats the default width.
        "[--cascader-max-height:16rem]",
        className
      )}
    >
      {children}
    </div>
  )
}

function EditorFooter({
  onCancel,
  onCommit,
  labels,
  host,
}: Pick<FilterEditorProps, "labels" | "host"> & {
  onCancel: () => void
  onCommit: () => void
}) {
  // The ONE ladder, not a hardcoded rung. `size="sm"` here was one of the three
  // offenders `FILTER_CONTROL_SIZES` was written to end - "and the footer to a
  // third" - and it measured 4px short of the bar's own controls at
  // `size="default"` in all eight styles, so this pair's relationship to the
  // rest of the bar changed with `size` instead of holding.
  //
  // The context is read directly rather than through `useFilterActions`, like
  // the options service above: an editor rendered outside a `Filters` root has
  // to draw rather than throw, and the default rung is what it draws at.
  const actions = React.useContext(FilterActionsContext)
  const sizes = filterControlSizes({ size: actions?.size ?? "default" })

  // The create host already has the panel's own Back and the wizard advances on
  // commit, so a second pair of buttons there is noise. The amend host is a
  // popover over a live filter, where discarding has to be possible.
  if (host === "create") return null
  return (
    <div className="flex items-center justify-end gap-1.5 pt-1">
      <Button variant="ghost" size={sizes.button} onClick={onCancel}>
        {labels.discard}
      </Button>
      <Button size={sizes.button} onClick={onCommit}>
        {labels.apply}
      </Button>
    </div>
  )
}

/**
 * The class list every single-input editor's `ButtonGroup` carries.
 *
 * `w-full` because `ButtonGroup` is `w-fit`, which is right for a chip and
 * wrong here: the panel is a fixed-width column, and a fit-content group inside
 * it collapses to the input's intrinsic size and stops short of the panel's
 * edge. With a width, the group's own `[&>input]:flex-1` gives the input every
 * pixel the two icon buttons do not take.
 *
 * The sera clause is the same normalisation the chip does. Sera is an underline
 * style: its input carries a bottom border and nothing else, so an outline
 * button beside it draws a box next to a rule and the group reads as two
 * different controls. Flattening every direct child to the same bottom-only
 * edge is what makes the three read as one field again. It has to be
 * `border-b-input` and not just `border-transparent`, because the buttons are
 * the group's trailing edge - dropping their bottom border too would leave the
 * field's rule stopping halfway across the panel.
 */
const EDITOR_FIELD_GROUP =
  "w-full"

/**
 * Confirm and cancel, as an OUTLINE pair FUSED onto the field.
 *
 * The pair used to be two text buttons on a row of their own under the input,
 * which is a second block of chrome for a popover whose whole content is one
 * box. Welded onto the field's trailing edge they read as part of the control
 * they act on, and the panel loses a row.
 *
 * Returns a FRAGMENT, and that is the whole point of the shape. `ButtonGroup`
 * fuses with `*:data-slot:rounded-r-none` and
 * `[&>[data-slot]~[data-slot]]:rounded-l-none border-l-0`, both of which select
 * DIRECT children only, so the input and both buttons have to be direct
 * children of the group or the three render as three separate boxes - the
 * mistake this chip's own header already had to be fixed for once. A fragment
 * shares the pair between the text and number editors without putting a DOM
 * node between the group and its children, which a wrapper div would.
 *
 * `size="icon"` rather than a smaller step: every style's icon button at that
 * size is exactly its input's height (nova 8, sera 10, and so on down the
 * ladder), so the fused row is one height without a single hardcoded number.
 *
 * Only the single-input editors use it. A range has two boxes and neither one
 * owns the pair, so putting the confirm in one of them would claim it applies
 * to that bound alone; the range keeps its footer for that reason.
 */
function EditorCommitButtons({
  onCancel,
  onCommit,
  labels,
}: Pick<FilterEditorProps, "labels"> & {
  onCancel: () => void
  onCommit: () => void
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={labels.apply}
        onClick={onCommit}
      >
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2}
          aria-hidden="true"
        />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={labels.discard}
        onClick={onCancel}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2}
          aria-hidden="true"
        />
      </Button>
    </>
  )
}

/** Commits on Enter, cancels on Escape. Shared by the input-shaped editors. */
function useCommitKeys(commit: () => void, cancel: () => void) {
  return React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
        commit()
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        // Stop here so a surrounding dialog does not also close. Escape with
        // nothing open is handled further out and is deliberately a no-op.
        event.stopPropagation()
        cancel()
      }
    },
    [commit, cancel]
  )
}

/* -------------------------------------------------------------------------- */
/*                                Text / number                               */
/* -------------------------------------------------------------------------- */

export function FilterTextEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const onKeyDown = useCommitKeys(() => commit(), cancel)
  return (
    // A width, rather than shrink-to-fit. The popover is `w-auto`, so an
    // unsized text box would be as wide as the browser's default input, and the
    // panel would then change width between the two hosts - the amend host adds
    // the commit pair, and a fit-content panel would grow by exactly that much.
    //
    // `w-72`, and the number is a compromise between two real measurements.
    //
    // The panel is not the field: `p-2` takes 16, the fused confirm/discard
    // pair takes two icon buttons, and the input takes its own inline padding
    // out of what is left, so the TYPING room is the panel minus all three. At
    // `w-64` that bottomed out at about eighteen characters in sera, which an
    // email address does not fit in - which is why this was `w-80` for a while.
    //
    // `w-80` overshot in the other direction. The COMMON case is a name, a
    // title or a word, and 320px of box around "Acme" reads as a request for a
    // paragraph - it was the widest control in a filter bar of otherwise
    // compact chips. `w-72` holds about 23 characters in sera and 27 in nova,
    // which covers a full name and most titles, and a field whose values really
    // do run long (an email, a URL) widens itself through the documented
    // channel below.
    //
    // The number editor deliberately does NOT follow it up. Its values are
    // short by construction, and 320px of chrome around "42" is the opposite
    // defect.
    //
    // Capped so it cannot outgrow a narrow viewport. `w-80` is 320px and a
    // 360px phone has 40px to spare, which collision handling spends on
    // shifting the popover rather than on shrinking it.
    //
    // Overridable, and by the documented channel rather than a new one:
    // `field.className` is merged last, so a `w-*` on the field beats this
    // through tailwind-merge.
    <EditorPanel
      className={cn("w-72 max-w-[calc(100vw-2rem)] min-w-0", field.className)}
    >
      <ButtonGroup className={EDITOR_FIELD_GROUP}>
        <Input
          {...autoFocusProps}
          value={(value as string) ?? ""}
          placeholder={field.placeholder ?? labels.valuePlaceholder}
          aria-label={field.label}
          onChange={(event) => onValueChange(event.target.value as V)}
          onKeyDown={onKeyDown}
        />
        {/*
          The create host advances on commit and carries its own Back, so a
          confirm there would be a second way to do what the next panel already
          does. The amend host is a popover over a LIVE filter, where discarding
          has to be reachable. A lone input still belongs in the group: the
          per-style sheets re-round the LAST child, so the group with nothing
          fused to it draws exactly the bare field it would have drawn anyway.
        */}
        {host === "create" ? null : (
          <EditorCommitButtons
            labels={labels}
            onCancel={cancel}
            onCommit={() => commit()}
          />
        )}
      </ButtonGroup>
    </EditorPanel>
  )
}

export function FilterNumberEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const onKeyDown = useCommitKeys(() => commit(), cancel)
  return (
    <EditorPanel className={cn("w-56 min-w-0", field.className)}>
      <ButtonGroup className={EDITOR_FIELD_GROUP}>
        <Input
          {...autoFocusProps}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          placeholder={field.placeholder}
          aria-label={field.label}
          onChange={(event) => {
            const raw = event.target.value
            onValueChange((raw === "" ? undefined : Number(raw)) as V)
          }}
          onKeyDown={onKeyDown}
        />
        {host === "create" ? null : (
          <EditorCommitButtons
            labels={labels}
            onCancel={cancel}
            onCommit={() => commit()}
          />
        )}
      </ButtonGroup>
    </EditorPanel>
  )
}

/** Two bounds. Used by every `arity: "range"` operator. */
export function FilterRangeEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const tuple = (Array.isArray(value) ? value : []) as unknown[]
  const onKeyDown = useCommitKeys(() => commit(), cancel)

  const update = (index: 0 | 1, raw: string) => {
    const next = [tuple[0], tuple[1]]
    next[index] = raw === "" ? undefined : Number(raw)
    onValueChange(next as V)
  }

  return (
    <EditorPanel>
      <div className="flex items-center gap-1.5">
        <Input
          {...autoFocusProps}
          type="number"
          value={tuple[0] === undefined ? "" : String(tuple[0])}
          aria-label={labels.rangeFrom(field.label)}
          onChange={(event) => update(0, event.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="text-muted-foreground text-xs">
          {labels.rangeSeparator}
        </span>
        <Input
          type="number"
          value={tuple[1] === undefined ? "" : String(tuple[1])}
          aria-label={labels.rangeTo(field.label)}
          onChange={(event) => update(1, event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <EditorFooter
        host={host}
        labels={labels}
        onCancel={cancel}
        onCommit={() => commit()}
      />
    </EditorPanel>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  The menu                                  */
/* -------------------------------------------------------------------------- */

/** One row. The shape both the operator menu and the option editors hand over. */
export interface FilterListItem {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  disabled?: boolean
  /**
   * A None row. See `FilterOption.exclusive`, which is where it comes from.
   *
   * LAYOUT only, here. The menu draws such a row apart from the rest and never
   * pins it; what a pick DOES is `applyFilterExclusiveSelection`, applied once
   * in the option editor's selection handler, because only that host can ask
   * the option service about a value the current page does not contain. A
   * consumer composing `FilterMenu` into an editor of their own owns the same
   * call.
   */
  exclusive?: boolean
}

/**
 * Everything a row carries beyond the cascader's own fields.
 *
 * One flag, on the first row of a group that is not the first. Grouping happens
 * out here - the cascader is handed an already-sorted array and cannot know a
 * boundary ran through it - so the boundary has to travel with the data.
 *
 * A marker beats the two other ways of drawing that line. A disabled separator
 * NODE would join the option ring: Base UI still puts it in the accessibility
 * tree, typeahead still counts it and the query still filters it, so a rule
 * about SELECTION would have leaked into the data the list navigates. A CSS
 * sibling rule (`[data-selected] + :not([data-selected])`) reads the LIVE
 * selection rather than the order the list opened in, so the moment a pinned
 * row was unticked it drew a second line through the middle of the pinned
 * group.
 *
 * Two boundaries can want it now, and the same marker serves both: the pinned
 * group ends where the rest begins, and the rest ends where the exclusive rows
 * begin. When those fall on the same row it is one line, because the flag is a
 * boolean rather than a count.
 */
interface FilterMenuMeta {
  divider?: boolean
  /**
   * Carries `FilterListItem.exclusive` down to the row itself.
   *
   * The rule above the row cannot do it: it is `aria-hidden`, as a decorative
   * line has to be, so on its own the flag reaches the DOM and stops - and a
   * screen reader hears a row byte-identical to its neighbours right up to the
   * moment pressing it destroys four selections. The row's own accessible name
   * is the only channel that arrives before the press, and reaching it needs
   * the flag HERE, because `renderItem` receives the node and nothing else.
   *
   * `[data-slot=filter-menu-exclusive-hint]` is also the handle a consumer
   * styles the row through, since the cascader's row element takes no data
   * attribute of ours: `:has([data-slot=filter-menu-exclusive-hint])` selects
   * it, the same shape the list already uses for the divider.
   */
  exclusive?: boolean
}

/**
 * Joins a selection into one comparable key. The same NUL the path join uses,
 * for the same reason: it cannot occur inside a value that came from a schema
 * or from a server, so no key is ambiguous.
 */
const PIN_SEPARATOR = "\u0000"

/**
 * How many times the restore below re-tries before giving the highlight up.
 *
 * It is a bound on a race, not a guess at a duration: each attempt costs one
 * task and stops the moment the highlight comes back, so the ceiling is only
 * ever reached on a machine where the settle takes longer than four tasks - and
 * there, leaving the highlight where Base UI put it is better than dispatching
 * pointer events at a list the user has moved on from.
 */
const MAX_PIN_RESTORE_ATTEMPTS = 4

interface PendingPinRestore {
  /** The row the user was on when the rows moved. Tracked by VALUE, never index. */
  value: string
  /** The index it sat at, which is the half of the signature Base UI keeps. */
  index: number
  /** The order the rows landed in, so the target's new position is known. */
  order: string[]
  attempts: number
}

/**
 * Carries the HIGHLIGHT across a live re-pin.
 *
 * The defect this exists for, exactly. Base UI holds the highlight as an INDEX
 * into its composite list, and that list re-sorts itself ASYNCHRONOUSLY: a
 * keyed reorder MOVES a row's DOM node instead of remounting it, so no item
 * registers or unregisters and the index map is only rebuilt when the
 * `MutationObserver` watching the row container reports the childList change.
 * The index survives the reorder untouched, so once the map catches up the
 * highlight is on whatever row slid into that position - and every row id is
 * `${listId}-${index}`, so `aria-activedescendant` follows it there. Verified,
 * not assumed: without this component a ticked row lands the highlight one row
 * further down, and the next ArrowDown then skips a row.
 *
 * So the correction cannot run in a layout effect on the reorder, which is the
 * shape it wants to have: at that point the map still reads the OLD order and
 * every index it could compute is the stale one. It instead ARMS there - the
 * store still names the row the user was on, because Base UI has not noticed
 * anything moved - and fires on the first highlight change carrying the bug's
 * signature: the SAME index, a DIFFERENT row. Any move the user makes changes
 * the index, so a real navigation can never be mistaken for the settle and
 * yanked back.
 *
 * The move itself is one synthetic `mousemove` on the target row rather than
 * the arrow-key run `CascaderNav` uses to walk the tree: Base UI's hover path
 * resolves a row through the very list that re-sorted and explicitly clears its
 * `forceScrollIntoView` flag, and NOT scrolling is half the point of the
 * exercise. There is no imperative highlight setter to use instead - Base UI's
 * `actionsRef` is `{ unmount }` and nothing else.
 *
 * Every attempt, including the first, is dispatched from a TASK rather than
 * from the effect itself. Two reasons, both load bearing: the map is provably
 * still stale in the commit that publishes the store event, so a dispatch there
 * resolves the old index and no-ops; and firing a DOM event from inside a
 * commit re-enters React's own event handling mid-render, which is a hazard
 * this has no need to take. It then re-tries because the store event and the
 * re-sort are two different beats of the same settle and nothing orders them.
 * Each attempt is idempotent - Base UI ignores a hover onto the row it already
 * considers active - and the chain stops the moment the highlight is back.
 */
function FilterMenuPinKeeper({
  order,
  items,
}: {
  /** Values in render order. */
  order: string[]
  /** The data the order was derived from, by identity. */
  items: FilterListItem[]
}) {
  const { baseId } = useCascaderActions()
  const highlight = useCascaderHighlight()
  const previousRef = React.useRef<{
    order: string[]
    items: FilterListItem[]
  } | null>(null)
  const pendingRef = React.useRef<PendingPinRestore | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read from the render, not from a ref written during one: this component
  // re-renders on every highlight move, and on the reordering commit the store
  // still holds the row that was highlighted BEFORE it.
  const highlightedValue = highlight.value
  const highlightedIndex = highlight.index

  const stop = React.useCallback(() => {
    pendingRef.current = null
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const startRestore = React.useCallback(() => {
    const attempt = () => {
      timerRef.current = null
      const pending = pendingRef.current
      if (!pending) return

      const target = pending.order.indexOf(pending.value)
      const rows = document
        .getElementById(`${baseId}-column-0`)
        ?.querySelectorAll<HTMLElement>('[data-slot="cascader-item"]')
      // A WINDOWED list renders a subset, so row N is not order[N] and the
      // target row may not be in the document at all. Leaving the highlight
      // alone is the honest outcome there; guessing at a row would move it
      // somewhere nobody asked for.
      if (target < 0 || !rows || rows.length !== pending.order.length) {
        stop()
        return
      }

      rows[target]?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

      pending.attempts += 1
      if (pending.attempts >= MAX_PIN_RESTORE_ATTEMPTS) {
        stop()
        return
      }
      timerRef.current = setTimeout(attempt, 0)
    }

    timerRef.current = setTimeout(attempt, 0)
  }, [baseId, stop])

  // No dependency list: the arm has to be evaluated on the commit that reorders
  // the rows, and that commit changes nothing this closure could list except
  // `order`, whose identity is fresh on every render anyway.
  React.useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { order, items }

    if (!previous || previous.order === order) return
    // A different `items` array is new DATA - a page of async results, a query
    // narrowing the list - and Base UI's own rules own the highlight there. The
    // only reorder this corrects is the one this component causes.
    if (previous.items !== items) return
    if (!highlightedValue) return
    // Content, not identity: the memo hands back a fresh array whenever the
    // selection changes, and unticking the only pinned row can leave the rows
    // in exactly the order they were already in. Arming on a reorder that never
    // happened would leave a correction waiting for a settle that never comes.
    if (isSameOrder(previous.order, order)) return

    pendingRef.current = {
      value: highlightedValue,
      index: highlightedIndex,
      order,
      attempts: 0,
    }
  })

  React.useEffect(() => {
    const pending = pendingRef.current
    if (!pending) return

    // Back where it belongs, or moved by the user. Either way the arm is spent
    // rather than fought.
    if (
      highlightedValue === pending.value ||
      highlightedIndex !== pending.index
    ) {
      stop()
      return
    }
    // Already chasing this one; a second chain would double every dispatch.
    if (pending.attempts > 0 || timerRef.current !== null) return
    startRestore()
  }, [highlightedValue, highlightedIndex, startRestore, stop])

  React.useEffect(() => stop, [stop])

  return null
}

/** Element-wise, because the arrays are rebuilt on every selection change. */
function isSameOrder(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

export interface FilterMenuProps {
  items: FilterListItem[]
  /** Committed values. Drives the check mark and the pinned group. */
  selected: string[]
  multiple?: boolean
  /** Receives the FULL next selection, so no caller re-derives it. */
  onSelectionChange: (values: string[]) => void
  labels: FilterLabels
  /** Names the listbox and the panel. */
  ariaLabel: string
  searchPlaceholder?: string
  /**
   * Whether the search field is VISIBLE. It is always rendered; see the note at
   * the call site.
   */
  searchable?: boolean
  /**
   * Viewport height before the list scrolls, in pixels.
   *
   * OMITTED ON PURPOSE by the option editors, so the cap arrives as CSS rather
   * than as a number. A prop written here becomes an inline style on the list
   * shell, and an inline style is the one thing a consumer's `className`
   * cannot outrank; the editor panel publishes `--cascader-max-height`
   * instead, which a field overrides on the same element by saying
   * `className` by setting `--cascader-max-height` on it. Pass a number only
   * where there is no panel to inherit from, the way the operator menu does.
   */
  maxHeight?: number
  /**
   * Pin selected rows above the rest, with a full-bleed rule between them.
   *
   * Off by default, and off for a short closed list like the operators, where
   * there is exactly one selection and reordering the list under the user buys
   * nothing. The option editors read it from `FilterField.pinSelected`, so a
   * consumer opts a long list in per field.
   */
  pinSelected?: boolean
  /**
   * Order INSIDE each of the two groups, plus WHEN the partition is taken. See
   * `FilterField.sortSelected`.
   *
   * Defaults to the declaration order, which is what makes the partition stable
   * rather than a re-sort: a status list keeps reading To do, In progress,
   * Done in both halves.
   */
  sortSelected?: "none" | "label" | "snapshot"
  /**
   * The caller already filtered `items` for the current query, so the cascader
   * must not filter them a second time.
   */
  preFiltered?: boolean
  autoFocusProps?: FilterEditorProps["autoFocusProps"]
  /** Controlled query. Pair it with `onQueryChange` to filter outside. */
  query?: string
  onQueryChange?: (query: string) => void
  /** Async chrome, when the caller has an option service. */
  state?: Pick<
    FilterOptionsState<unknown>,
    "loading" | "error" | "hasMore" | "loadMore" | "retry"
  >
}

/**
 * One accessible list, shared by the operator menu and every option editor.
 *
 * It is the CASCADER, configured - not a list this file implements. That is the
 * whole point of the component: the old hand-rolled version owned its own
 * `aria-activedescendant`, its own arrow keys, its own scroll container and its
 * own search box, and it still had no typeahead, no RTL handling, no
 * virtualization and no live region. Every one of those already exists in the
 * cascader, and a flat `items` array with no children degrades it to exactly
 * the single-level list a filter value needs.
 *
 * What stays out here is only what the cascader has no opinion about: which
 * rows are pinned to the top, and where the paging affordance lives.
 */
export function FilterMenu({
  items,
  selected,
  multiple = false,
  onSelectionChange,
  labels,
  ariaLabel,
  searchPlaceholder,
  searchable = true,
  maxHeight,
  pinSelected = false,
  sortSelected = "none",
  preFiltered = false,
  autoFocusProps,
  query,
  onQueryChange,
  state,
}: FilterMenuProps) {
  /**
   * The pin set, carried as a KEY rather than as an array.
   *
   * `selected` is a fresh array on most renders, so a memo that depended on it
   * would re-partition on every render; and a memo that closed over it while
   * listing only its signature would be a dependency list that lies. A string
   * is both stable and honest. The separator is the NUL the path join already
   * uses for the same reason: nothing in a real option value contains it.
   */
  const liveKey = pinSelected ? selected.join(PIN_SEPARATOR) : ""

  /**
   * The same set, frozen at OPEN, for `sortSelected: "snapshot"`.
   *
   * LIVE is the default because it is what a pinned list claims to be: "your
   * picks, then the rest" is a statement about the CURRENT selection, and a
   * list that only becomes true again after a close and reopen is one that
   * contradicts the check marks next to it for as long as it is on screen.
   *
   * The tradeoff is real and is paid for rather than ignored. A row that jumps
   * into the pinned group moves every row it passed, so a pointer that has not
   * moved is now over a different one. Two things keep that survivable: the
   * highlighted row is carried across the reorder BY VALUE
   * (`FilterMenuPinKeeper`), and nothing scrolls, so the list the user is
   * reading stays where it was. A consumer who would still rather have the
   * frozen order asks for it by name.
   */
  const [snapshotKey] = React.useState(() => liveKey)
  // `pinSelected` is re-checked here and not just through `liveKey`, because
  // `snapshotKey` is frozen at MOUNT. A menu that opened pinned and then had
  // the prop taken away would otherwise keep partitioning off the stale frozen
  // key, so the one prop that is supposed to turn the stack off would not.
  // Cheap to make airtight, and now worth doing: `pinSelected` became a field
  // prop a consumer can flip.
  const pinnedKey = !pinSelected
    ? ""
    : sortSelected === "snapshot"
      ? snapshotKey
      : liveKey

  // Uncontrolled unless the caller owns the query, which it does whenever an
  // option service is doing the filtering.
  const [ownQuery, setOwnQuery] = React.useState("")
  const currentQuery = query ?? ownQuery
  const setQuery = onQueryChange ?? setOwnQuery

  /**
   * The partition, memoized on the SELECTION rather than on the query.
   *
   * Deliberately not one memo with `currentQuery` in its deps. The query only
   * decides whether a one pixel rule is drawn, and folding that into the same
   * memo re-partitioned - and, under `sortSelected: "label"`, re-sorted - the
   * whole list on every character typed into the search box. The 4,000 row
   * async directory field is the case that makes it visible: its `items` are
   * stable between fetches, so this now runs once per page of results instead
   * of once per keypress.
   */
  const partitioned = React.useMemo(() => {
    const pinned = new Set(pinnedKey ? pinnedKey.split(PIN_SEPARATOR) : [])

    /*
      The exclusive rows come out BEFORE the pin partition runs, and they are
      the one group whose position is fixed.

      That is the whole point of them. "Your picks, then the rest" is a claim
      about the current SELECTION, so a pinned row is somewhere different
      depending on whether it is ticked - which is exactly the wrong contract
      for a row whose job is to be visibly not one of the values. Ticking
      Unassigned would lift it to the top, above the very rule that was drawn to
      set it apart, and untick it back down again: the row a user had learned
      the position of would move every time they used it.

      So the grouping is by ROLE, not by state. An exclusive row sits last, in
      its own group, under a rule, ticked or not, and never joins the pin
      partition. The pinned group above it therefore counts ordinary picks only,
      which is also why selecting Unassigned draws no pin rule at all: it clears
      every other pick, so there is nothing left to pin.

      A short-to-medium list is what this shape is for. On a long async
      directory a trailing row is a row behind a scroll, and an exclusive option
      that has to survive 4,000 contacts wants a field-level control the schema
      does not have yet rather than a silent exception here.
    */
    const exclusive = items.filter((item) => item.exclusive)
    const values = exclusive.length
      ? items.filter((item) => !item.exclusive)
      : items

    const chosen = pinned.size
      ? values.filter((item) => pinned.has(item.value))
      : []
    const rest = pinned.size
      ? values.filter((item) => !pinned.has(item.value))
      : values

    // Inside each group the SCHEMA's order is kept unless the field asks for
    // otherwise: option order is usually semantic, and alphabetising "To do, In
    // progress, In review, Done" makes it harder to read, not easier. A stable
    // partition is also what stops a row moving under the pointer for any
    // reason other than the one pin the user asked for.
    const ordered =
      sortSelected === "label"
        ? [
            [...chosen].sort((a, b) => a.label.localeCompare(b.label)),
            [...rest].sort((a, b) => a.label.localeCompare(b.label)),
            [...exclusive].sort((a, b) => a.label.localeCompare(b.label)),
          ]
        : [chosen, rest, exclusive]

    const rows = [...ordered[0], ...ordered[1], ...ordered[2]]

    return {
      chosenCount: chosen.length,
      /** Index of the first exclusive row, or -1 when the list has none. */
      exclusiveAt: exclusive.length ? rows.length - exclusive.length : -1,
      // The render order on its own, so the one component that has to notice a
      // REORDER can compare identities instead of walking nodes.
      order: rows.map((item) => item.value),
      nodes: rows.map<CascaderNode<FilterMenuMeta>>((item) => ({
        value: item.value,
        label: item.label,
        icon: item.icon,
        description: item.description,
        keywords: item.keywords,
        disabled: item.disabled,
        // Only the exclusive rows carry a `data` object at all, so the ordinary
        // 4,000 keep the shape they had.
        data: item.exclusive ? { exclusive: true } : undefined,
      })),
    }
  }, [items, pinnedKey, sortSelected])

  // No rule while a query is narrowing the list. "Your picks, then the rest" is
  // a claim about the WHOLE list, and the rows on either side of the boundary
  // are exactly the ones a search takes away.
  const dividerAt =
    partitioned.chosenCount && !currentQuery.trim()
      ? partitioned.chosenCount
      : -1

  // The exclusive rule survives a search, and the one above does not, because
  // the two say different things. "Your picks, then the rest" stops being true
  // the moment a query hides rows on either side of it. "What follows is not
  // one of the above" is a fact about the row, so it holds over any subset that
  // still has something above it to be apart from.
  const exclusiveDividerAt = partitioned.exclusiveAt

  const nodes = React.useMemo<CascaderNode<FilterMenuMeta>[]>(() => {
    const total = partitioned.nodes.length
    // Only a boundary with rows on BOTH sides is a boundary. A rule on row 0
    // is a line above the top of the list.
    const marks = [dividerAt, exclusiveDividerAt].filter(
      (index) => index > 0 && index < total
    )
    if (marks.length === 0) return partitioned.nodes
    // The boundary rows are rewritten, not the array rebuilt: the divider is a
    // property of at most two rows and copying 4,000 objects to set it would
    // give back everything the split above just bought.
    const next = partitioned.nodes.slice()
    for (const index of marks) {
      // MERGED, never replaced: the first exclusive row is usually also the row
      // the second boundary falls on, and overwriting `data` there dropped the
      // flag the accessible name is built from.
      next[index] = {
        ...next[index],
        data: { ...next[index].data, divider: true },
      }
    }
    return next
  }, [partitioned, dividerAt, exclusiveDividerAt])

  const renderItem = React.useCallback(
    (
      node: CascaderNode<FilterMenuMeta>,
      itemState: CascaderItemState<FilterMenuMeta>
    ) => (
      <>
        {node.data?.divider ? (
          <span
            data-slot="filter-menu-divider"
            aria-hidden="true"
            // Full bleed: the rows are inset by the list's own padding, so a
            // rule that stops at the row's box reads as a gap rather than as a
            // divider. `--cascader-list-pad` is the per-style number the list
            // is padded with, published on the shell above every row.
            //
            // Centred in the 8px the row gives back above itself (see the
            // list's own class), rather than drawn at `top-0` where it hugged
            // the first unselected row and touched the last selected one.
            className="bg-border absolute inset-x-[calc(var(--cascader-list-pad,4px)*-1)] -top-1 h-px"
          />
        ) : null}

        {node.icon ? (
          <span
            data-slot="filter-menu-icon"
            className="text-muted-foreground flex shrink-0 items-center justify-center"
          >
            {node.icon}
          </span>
        ) : null}

        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="w-full truncate text-start">{node.label}</span>
          {node.description ? (
            <span className="text-muted-foreground w-full truncate text-start text-xs">
              {node.description}
            </span>
          ) : null}
        </span>

        {/*
          What the rule above the row says, for the people the rule does not
          reach. It joins the row's accessible NAME by being inside the option
          element, which is the whole reason it is a span of text here rather
          than an `aria-describedby`: a description is announced late or not at
          all depending on the reader, and this has to arrive with the label,
          before the press.

          The cascader's own `srDetails` channel cannot carry it. `renderItem`
          replaces the default row body wholesale (`custom ?? children ?? ...`),
          and `srDetails` is rendered inside that default, so a menu with a
          custom row has no sr-only suffix at all.

          Empty copy renders nothing, so a consumer who has said it another way
          silences it by setting `labels.exclusiveHint` to "".
        */}
        {node.data?.exclusive && labels.exclusiveHint ? (
          <span data-slot="filter-menu-exclusive-hint" className="sr-only">
            {`, ${labels.exclusiveHint}`}
          </span>
        ) : null}

        {/*
          A check mark, never a checkbox, in both modes - which is why the row
          is drawn here at all rather than left to the cascader's default, whose
          multi-select row leads with a box.
        */}
        {itemState.selected ? (
          <span
            data-slot="filter-menu-check"
            // The gutter every style already reserves for a row's check, on the
            // same logical inset the cascader pins its own mark to. Laid out
            // INLINE the mark would sit before that gutter and leave a column
            // of dead space down the inline end of the list.
            className="cn-combobox-item-indicator end-[var(--cascader-row-inset,8px)]! rtl:right-auto!"
          >
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2}
              // Pinned on the svg AND on its descendants: every style repaints
              // icons inside a highlighted row with
              // `data-highlighted:**:text-accent-foreground`, and a check is
              // state rather than decoration, so it has one correct colour.
              className="text-foreground! **:text-foreground!"
            />
          </span>
        ) : null}
      </>
    ),
    [labels.exclusiveHint]
  )

  const cascaderLabels = React.useMemo(
    () => ({
      search: searchPlaceholder ?? labels.searchOptions,
      empty: labels.empty,
      loading: labels.loading,
      loadingMore: labels.loadingMore,
      loadMore: labels.loadMore,
      error: labels.error,
      retry: labels.retry,
      // Named after the thing being filtered, so a screen reader hears
      // "Priority" rather than the cascader's own "Top level" and "Options".
      rootLevel: ariaLabel,
      panelLabel: ariaLabel,
      // This menu is the cascader run FLAT, so the default hint would teach
      // the branch keys of a list that has no branches. No hint is the honest
      // form; the arrows, Home, End and typeahead follow the standard combobox
      // grammar the role already announces.
      keyboardHint: () => "",
      // Fires from the live region as a query narrows the list, and names the
      // footer holding Load more and Retry. Both surfaced through
      // `FilterLabels`, so the menu ships no English of its own.
      resultsAnnouncement: labels.resultsAnnouncement,
      actionsLabel: labels.actionsLabel,
    }),
    [labels, ariaLabel, searchPlaceholder]
  )

  /**
   * Paging and retry, in the pinned footer rather than as a row in the list.
   *
   * A row would join the option ring: arrows would land on it, typeahead would
   * match it and a query would filter it away mid-page. The cascader keeps
   * commands out of the list for exactly that reason, and this is one. The
   * paging itself stays with `useFilterOptions`, so the cascader's own async
   * machinery (`getChildren`) is never involved.
   */
  const actions = React.useMemo<CascaderActionItem[]>(() => {
    if (state?.error) {
      return [{ value: "retry", label: labels.retry, onSelect: state.retry }]
    }
    if (state?.hasMore) {
      return [
        {
          value: "load-more",
          label: state.loading ? labels.loadingMore : labels.loadMore,
          disabled: state.loading,
          onSelect: state.loadMore,
        },
      ]
    }
    return []
  }, [state, labels])

  const shared = {
    // Inline, pinned open with a no-op handler, exactly as the field step does:
    // inline renders no popup at all, and Base UI forces `open` and disables
    // dismissal there, so the unconditional `setOpen(false)` a single-select
    // commit performs cannot dismiss the popover this panel sits in.
    inline: true,
    open: true,
    onOpenChange: () => {},
    items: nodes,
    inputValue: currentQuery,
    onInputValueChange: setQuery,
    maxHeight,
    renderItem,
    labels: cascaderLabels,
    actions,
    // The option service is the ONE filter when it owns the query, so an async
    // field is not filtered a second time against a label the server matched on
    // something else entirely. A closed list keeps the local scan.
    ...(preFiltered ? { filter: () => true } : null),
  }

  const cascaderProps: CascaderProps<FilterMenuMeta> = multiple
    ? {
        ...shared,
        multiple: true,
        value: selected,
        onValueChange: (values: string[]) => onSelectionChange(values),
      }
    : {
        ...shared,
        value: selected[0] ?? "",
        onValueChange: (value: string) =>
          onSelectionChange(value ? [value] : []),
      }

  return (
    <Cascader {...cascaderProps}>
      <CascaderPanel>
        {/*
          `searchable: false` hides the FIELD, it never removes it. The input is
          what owns focus and `aria-activedescendant` for the whole list, so a
          menu without one has no keyboard at all - which is the opposite of
          what a short closed list wanted when it asked for less chrome. The
          class goes on the nav so the strip's border goes with it.
        */}
        <CascaderNav
          className={cn(
            // The nav draws its own divider as `border-border/60`, while the
            // separator this list puts between the selected and unselected
            // groups is a full-opacity `bg-border`. Two horizontal rules a few
            // pixels apart in one popup, at different strengths, read as a
            // mistake rather than as a hierarchy. The input's divider takes the
            // separator's colour rather than the other way round, because the
            // separator is the line this primitive owns.
            "border-border",
            !searchable && "sr-only"
          )}
        >
          <CascaderInput
            {...(autoFocusProps ?? {})}
            placeholder={searchPlaceholder ?? labels.searchOptions}
            aria-label={ariaLabel}
          />
        </CascaderNav>
        <CascaderEmpty>
          {state?.error
            ? labels.error
            : state?.loading
              ? labels.loading
              : labels.empty}
        </CascaderEmpty>
        {/*
          Plain rows, DELIBERATELY not `CascaderVirtualItems`. Windowing would
          stand `FilterMenuPinKeeper` down (its guard detects a windowed list
          and leaves the highlight alone), so a pinned 100+ row list would lose
          the by-value highlight carry that keeps its keyboard honest across a
          live re-pin. The lists that would clear the threshold are the async
          ones, and those PAGE - 25 rows at a time - so the DOM never holds the
          directory. The field picker windows; see `FilterFieldPicker`.

          `maxHeight` reaches the list through the ROOT prop above (one
          channel), which `CascaderList` resolves from context.
        */}
        <CascaderList
          /**
           * Real layout space around the group rule.
           *
           * The rule itself is absolutely positioned inside its row, and an
           * absolute box adds no height, so the breathing room has to come from
           * the row that carries it. Nothing else can supply it: `renderItem`
           * returns a row's CHILDREN and cannot reach the row's own box, a
           * spacer NODE would join the option ring (arrows, typeahead and the
           * query would all find it), and the sibling form
           * `[data-selected] + :not([data-selected])` reads the LIVE selection,
           * so unticking a pinned row would move the gap.
           *
           * `:has()` earns its keep here: it is scoped to this one list, the
           * compound requires a descendant that exists on at most ONE row, and
           * these menus render tens of rows rather than thousands.
           */
          className="[&>[data-slot=cascader-item]:has([data-slot=filter-menu-divider])]:mt-2"
        >
          <CascaderItems />
        </CascaderList>
        <CascaderFooter />
        <CascaderStatus />
        {/*
          Last, so its layout effect runs after every row has registered itself
          and the reordered DOM is the one it reads. Renders nothing, and is not
          mounted at all for a menu that cannot reorder.
        */}
        {pinSelected && sortSelected !== "snapshot" ? (
          <FilterMenuPinKeeper order={partitioned.order} items={items} />
        ) : null}
      </CascaderPanel>
    </Cascader>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Option based editors                          */
/* -------------------------------------------------------------------------- */

function OptionEditor<V, O>(props: FilterEditorProps<V, O> & { multiple: boolean }) {
  const {
    multiple,
    options,
    labels,
    autoFocusProps,
    commit,
    cancel,
    onValueChange,
    value,
    field,
  } = props

  const selected = React.useMemo(() => {
    if (value === undefined || value === null) return []
    return (Array.isArray(value) ? value : [value]) as string[]
  }, [value])

  // Read directly rather than through `useFilterActions`, so a consumer
  // mounting an editor outside a `Filters` root gets a silent menu instead of a
  // thrown error - the same degradation `useFilterOptions` takes.
  const announce = React.useContext(FilterActionsContext)?.announce

  return (
    /*
      A DELIBERATELY narrow default. An option label is a status, a name or a
      tag, not a sentence, and 12rem holds around 22 characters at every style's
      row size; the rest of the width a menu used to take was empty space beside
      short rows. A field whose labels genuinely need more says so through its
      own `className` - which lands LAST here, so tailwind-merge resolves the
      two `w-*` in the consumer's favour rather than by source order.
    */
    <EditorPanel className={cn("w-48 min-w-0 gap-0 p-0", field.className)}>
      <FilterMenu
        items={options.items}
        selected={selected}
        multiple={multiple}
        onSelectionChange={(raw) => {
          /*
            The ONE place the None rule is applied, and the reason it is here
            rather than in the menu.

            Every route into a selection - a click, an Enter on the highlighted
            row, a typeahead landing followed by Enter - arrives through this
            single callback, so click and keyboard cannot disagree about what
            picking Unassigned does. And it is the editor, not the menu, that
            can ANSWER the question: `options.resolve` reads the schema, every
            page any host under this root has loaded and every `resolveValues`
            result, while the menu holds only the rows currently on screen. A
            query narrowing the list to "ada" hides the still-selected None row,
            and ticking Ada there has to clear it.

            Nothing here writes to the query. `commit` is the only write, and it
            goes through the host to the mutation boundary in `filters.tsx`,
            which is where `readOnly` and `disabled` refuse. A read-only bar
            never opens this editor in the first place, and would refuse the
            commit even if something did.
          */
          const values = applyFilterExclusiveSelection(raw, selected, (value) =>
            Boolean(options.resolve(value)?.exclusive)
          )

          /*
            The rule intervened exactly when it handed back a DIFFERENT array;
            it returns `raw` itself in every other case, which is nearly every
            call. So identity is the test, and no second pass over the values
            is needed to find out whether anything was cleared.

            Announced because nothing else reports it. The row that was pressed
            keeps its name, the search box keeps its text, focus never moved,
            and the rows that lost their check marks are ones nobody is on - so
            a screen reader user pressing Unassigned gets four selections
            destroyed in silence. `labels.exclusiveHint` warns before the press;
            this is the receipt after it.
          */
          if (values !== raw && announce) {
            const arrived = values.find((entry) => !selected.includes(entry))
            const cleared = raw.length - values.length
            if (arrived !== undefined && cleared > 0) {
              announce(
                labels.exclusiveAnnouncement(
                  options.resolve(arrived)?.label ?? arrived,
                  cleared
                )
              )
            }
          } else if (values === raw && raw.length > 1) {
            /*
              The hole in the rule, made LOUD instead of left silent.

              A stored value the option service cannot resolve is classified as
              ordinary (see `applyFilterExclusiveSelection`), so on a field that
              has a None row, a selection still holding an unresolvable value
              after a pick is a selection the rule may simply have failed to
              clean. Nothing here can tell it from an ordinary id whose label
              has not arrived, so the code must not act on it - but a developer
              can, and the fix is two lines of schema.

              Gated on having SEEN a None row, from the schema or from a loaded
              page, so a field that has no exclusive option never pays for this.
              Which also bounds the check honestly: a None row that lives only
              inside a page nobody fetched is a row this primitive has no
              evidence of, and there is no warning to be had for a fact nobody
              has told it. That case is what the schema guidance is for.
            */
            const hasNoneRow =
              options.items.some((item) => item.exclusive) ||
              Boolean(field.options?.some((option) => option.exclusive))
            const unresolved = hasNoneRow
              ? raw.find((entry) => options.resolve(entry) === undefined)
              : undefined
            if (unresolved !== undefined) {
              warnFilterOnce(
                `exclusive-unresolved:${field.id}`,
                `field "${field.id}" has an exclusive option, but the value ` +
                  `"${unresolved}" resolves to no option, so the None rule ` +
                  `cannot tell whether it is the exclusive one and has left ` +
                  `it in place. Declare the exclusive option in the field's ` +
                  `\`options\` even when the rest of the list is async, or ` +
                  `cover stored values with \`resolveValues\`.`
              )
            }
          }

          if (!multiple) {
            const next = values[0]
            // Pressing the row that is already committed deselects it in Base
            // UI's single-select. A filter with no value at all is not an
            // improvement on the one it had, so that press just closes.
            if (next === undefined) {
              cancel()
              return
            }
            onValueChange(next as V)
            // A single pick IS the whole answer, so it commits and closes.
            commit(next as V)
            return
          }
          onValueChange(values as V)
          // Every toggle commits, and the popover stays open, so several picks
          // remain one gesture. An Apply button here would be a second step for
          // a change the chip has already redrawn.
          commit(values as V, { close: false })
        }}
        labels={labels}
        ariaLabel={field.label}
        searchable={field.searchable ?? true}
        // The field's own placeholder, else `labels.searchOptions` inside the
        // menu. Not a composed `Search ${label}...`: that was hardcoded
        // English no `labels` override could reach, and lowercasing a label is
        // locale-hostile besides (Turkish dotted i, German proper nouns).
        searchPlaceholder={field.placeholder}
        // Opt-in, and off by default, because a list short enough to take in
        // at a glance should not reorder itself under the reader: the check
        // marks already say what is chosen, and the schema's order is usually
        // the thing that made the list scannable. A field whose length makes
        // the fold a real problem asks for the stack by name, and then the
        // order INSIDE each group is the schema's unless it also asks for
        // alphabetical.
        pinSelected={field.pinSelected ?? false}
        sortSelected={field.sortSelected}
        // `useFilterOptions` has already applied the query - locally for a
        // static field, server side for an async one.
        preFiltered
        query={options.query}
        onQueryChange={options.setQuery}
        state={options}
        autoFocusProps={autoFocusProps}
      />
    </EditorPanel>
  )
}

export function FilterSelectEditor<V, O>(props: FilterEditorProps<V, O>) {
  return <OptionEditor {...props} multiple={false} />
}

export function FilterMultiSelectEditor<V, O>(props: FilterEditorProps<V, O>) {
  return <OptionEditor {...props} multiple />
}

/* -------------------------------------------------------------------------- */
/*                                   Boolean                                  */
/* -------------------------------------------------------------------------- */

/**
 * Module level, so the menu's index is not rebuilt on every render.
 *
 * The copy is not in `FilterLabels` on purpose: the chip's own display spells
 * the same two words out (see `defaultValueDisplay`), and a key read from two
 * places that must agree is one more thing to keep in step than a shared
 * constant is.
 */
const BOOLEAN_ITEMS: FilterListItem[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
]

export function FilterBooleanEditor<V, O>({
  value,
  onValueChange,
  commit,
  labels,
  autoFocusProps,
  field,
}: FilterEditorProps<V, O>) {
  return (
    // Narrower still than the option menus: the list is two words long and
    // cannot grow. `field.className` lands last for the same reason it does
    // there - a consumer's `w-*` has to beat the default rather than lose to it
    // on source order.
    <EditorPanel className={cn("w-40 min-w-0 gap-0 p-0", field.className)}>
      <FilterMenu
        items={BOOLEAN_ITEMS}
        selected={value === true ? ["true"] : value === false ? ["false"] : []}
        onSelectionChange={(values) => {
          // Deselecting the committed row leaves nothing to filter on, so it is
          // a no-op rather than a commit of `false`.
          if (values.length === 0) return
          const next = (values[0] === "true") as V
          onValueChange(next)
          commit(next)
        }}
        labels={labels}
        ariaLabel={field.label}
        // Two rows, both visible: a search field over them would be more chrome
        // than list. It is still rendered, hidden, because it owns the keyboard.
        searchable={false}
        autoFocusProps={autoFocusProps}
      />
    </EditorPanel>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Resolution                                */
/* -------------------------------------------------------------------------- */

export type {
  AnyFilterEditor,
  FilterEditorRegistry,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

export const DEFAULT_FILTER_EDITORS: FilterEditorRegistry = {
  text: FilterTextEditor,
  number: FilterNumberEditor,
  range: FilterRangeEditor,
  select: FilterSelectEditor,
  multiselect: FilterMultiSelectEditor,
  boolean: FilterBooleanEditor,
}

/**
 * Picks the editor for a (field, operator) pair.
 *
 * Precedence: the field's own `editor`, then the operator's ARITY, then the
 * field's `type`. Arity outranks type because "between" on a number field wants
 * two boxes whatever the field said, and "is any of" on a select wants
 * checkboxes even though the field is single valued. Deriving that from the
 * field alone is what forced the old primitive to promote select to multiselect
 * based on how many values happened to be picked.
 */
export function resolveFilterEditor<V, O>(
  field: FilterField<V, O>,
  operator: FilterOperator | undefined,
  editors: FilterEditorRegistry
): AnyFilterEditor | undefined {
  if (typeof field.editor === "function") {
    // The one place a consumer's typed editor meets the erased registry.
    return field.editor as unknown as AnyFilterEditor
  }
  if (typeof field.editor === "string") {
    const named = editors[field.editor]
    if (named) return named
  }

  const arity = operator?.arity ?? "one"
  if (arity === "none") return undefined
  if (arity === "range") return editors.range
  if (arity === "many") {
    // An option-backed field gets checkboxes; anything else keeps its own
    // editor and receives an array.
    if (field.options || field.loadOptions) return editors.multiselect
  }

  return editors[field.type ?? "text"] ?? editors.text
}
