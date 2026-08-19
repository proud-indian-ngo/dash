// @ts-nocheck
import { collapseCascaderPath } from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type { CascaderCollapse } from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import type {
  FilterField,
  FilterIndex,
  FilterOperator,
  FilterOption,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

/* -------------------------------------------------------------------------- */
/*                                    Menus                                   */
/* -------------------------------------------------------------------------- */

/**
 * How every menu in the primitive is sized, in one place.
 *
 * ONE string, shared by the chip's kebab and by all three of the builder's
 * menus, because they draw the SAME rows from `FilterRuleMenuItems` and a menu
 * that fits a label in one chrome and clips it in the other is the same defect
 * shipped twice.
 *
 * `w-max` is the load-bearing half, and it is an OVERRIDE rather than an
 * addition. The shadcn menu content pins its width to the anchor
 * (`w-(--anchor-width)` in base, `w-(--radix-dropdown-menu-trigger-width)` in
 * radix) and then hides its own horizontal overflow, so a menu hung off a
 * 28px icon button was drawn at whatever floor it had and every row longer
 * than that was silently CUT. Sizing to max-content is the AUTO WIDTH: the menu
 * is exactly as wide as its longest row and no wider, which is what a
 * three-row kebab wants. Both twins name the same `w-` utility, so one string
 * overrides both through tailwind-merge.
 *
 * THE FLOOR IS `min-w-32`, down from `min-w-56` and then from `min-w-40`. The
 * original floor was 224px and the chip kebab's rows are "Duplicate", "Negate"
 * and "Remove" - about 130px of content - so the shipped menu was most of a
 * hundred pixels of nothing, hung off a 28px button. A floor is still wanted,
 * because a menu narrower than its own trigger reads as a mistake and a two-row
 * menu beside a wide one looks broken.
 *
 * 128px is where it landed because the ROWS got shorter in the same pass that
 * moved it: "Ungroup", "Move to top", "Wrap in group". At 160px a three-row
 * group menu was again drawn mostly empty, which is the reported defect one
 * rung smaller. 128px is what every style already gives
 * `cn-dropdown-menu-content`, so the floor now agrees with the part instead of
 * quietly overriding it, and any row longer than eight rems pushes past it on
 * its own.
 *
 * The cap is what stops a pathological label pushing the menu off the side of
 * a phone.
 *
 * NO ROW EVER WRAPS. At max-content none can, by definition; past the cap one
 * has to give, and this is what decides how. `min-w-0` lets a row shrink below
 * its content at all (a flex child's floor is its content otherwise), and the
 * label span inside carries `truncate` - see `FILTER_MENU_LABEL_CLASS`, and see
 * why it is a span. Truncating is chosen over wrapping because a wrapped row
 * changes HEIGHT, which moves every row under it and puts the destructive row
 * somewhere the pointer was not aiming.
 */
export const FILTER_MENU_CLASS =
  "w-max min-w-32 max-w-[min(24rem,calc(100vw-2rem))] [&_[data-slot=dropdown-menu-item]]:min-w-0"

/**
 * What a menu row's LABEL wears, so the row truncates instead of wrapping.
 *
 * A span, and it has to be a span. `truncate` is `overflow:hidden` plus
 * `text-overflow:ellipsis` plus `white-space:nowrap`, and `text-overflow`
 * applies to a block container - a menu row is `display:flex`, so its bare text
 * child is an anonymous flex item and the ellipsis is not reliably drawn on it.
 * Putting the text in a real element is what makes the property land. The span
 * is transparent to the accessible name, which is still the row's text content,
 * and it costs no layout: the row already spaces its children with `gap`, so a
 * span sits exactly where the text did.
 *
 * `min-w-0` for the same reason it is on the row: without it the span's floor
 * is its own content and it never shrinks, so `truncate` has nothing to do.
 */
export const FILTER_MENU_LABEL_CLASS = "min-w-0 truncate"

/**
 * How the FIELD PICKER's panel is sized, in one place.
 *
 * Two chromes mount it - the Add filter popover and the advanced row's
 * attribute cell - and they have to agree, for the reason every shared string
 * in this file exists: the same cascader drawing the same schema at two widths
 * is one collapse rule the user has to learn twice.
 *
 * `min-w-56` and not the `min-w-64` this shipped with. The floor is not the
 * width: `w-auto` means the panel grows to whatever the longest row needs, so
 * lowering the floor costs a long label nothing and only affects the case that
 * was reported - a flat schema of short names ("Name", "Status", "Owner")
 * drawn in 256px of panel, most of it empty. 224px still clears the search
 * input, the breadcrumb and a leaf row's icon-plus-label, and a deep-search
 * result carrying a full breadcrumb pushes past it on its own.
 */
export const FILTER_FIELD_PICKER_CLASS = "w-auto min-w-56 p-0"

/* -------------------------------------------------------------------------- */
/*                                    Paths                                   */
/* -------------------------------------------------------------------------- */

/**
 * Key the root level is stored under in `childrenOf`.
 *
 * A control character, so it cannot collide with a real field id. A field id of
 * `""` is rejected by `findFilterSchemaIssues`, but a defensive key costs
 * nothing and removes the question entirely.
 */
export const FILTER_ROOT_KEY = "\u0000root"

/** Separator between path segments in the flat map keys. */
const PATH_SEPARATOR = "\u0000"

/** Joins a field path into the key `byPath` and `parentOf` use. */
export function joinFilterPath(path: readonly string[]): string {
  return path.join(PATH_SEPARATOR)
}

/** Splits a joined key back into a path. */
export function splitFilterPath(key: string): string[] {
  return key === "" ? [] : key.split(PATH_SEPARATOR)
}

/** The joined key of a path's parent, or `FILTER_ROOT_KEY` at the top level. */
export function parentFilterKey(path: readonly string[]): string {
  return path.length <= 1 ? FILTER_ROOT_KEY : joinFilterPath(path.slice(0, -1))
}

/* -------------------------------------------------------------------------- */
/*                                  Signature                                 */
/* -------------------------------------------------------------------------- */

/**
 * A content hash of the schema, used to decide whether a rebuild can be skipped.
 *
 * Identity alone is useless here. Every one of the 26 block call sites and every
 * example declares `fields` as an inline array literal, so a `useMemo` keyed on
 * the array identity misses on every single parent render. That is exactly what
 * happened in the old primitive: `getFieldsMap` and `flattenFields` re-ran
 * constantly, and because the value-to-label cache was a WeakMap keyed on the
 * field OBJECT, async chips lost their resolved labels and re-fetched them.
 *
 * Deliberately covers only cheap, structural, comparable content. Render props
 * (`icon`, `renderValue`, a component-valued `editor`) are excluded because
 * inline JSX recreates them on every render, so including them would defeat the
 * whole mechanism. The consequence is worth stating plainly: changing ONLY a
 * render prop, with no structural change anywhere in the schema, will keep
 * serving the previous field objects. Change any structural field, or give
 * `fields` a stable identity, if a render prop must update on its own.
 */
export function computeFilterSchemaSignature<V, O>(
  fields: readonly FilterField<V, O>[]
): string {
  const parts: string[] = []

  const walk = (list: readonly FilterField<V, O>[], depth: number) => {
    for (const field of list) {
      parts.push(
        depth +
          ":" +
          field.id +
          "|" +
          (field.label ?? "") +
          "|" +
          (field.type ?? "") +
          "|" +
          (field.defaultOperator ?? "") +
          "|" +
          (field.column ?? "") +
          "|" +
          (field.selectable ? "1" : "0") +
          (field.disabled ? "1" : "0") +
          (field.icon ? "1" : "0") +
          (field.renderValue ? "1" : "0") +
          (field.loadOptions ? "1" : "0") +
          (field.resolveValues ? "1" : "0") +
          "|" +
          (typeof field.editor === "string" ? field.editor : field.editor ? "fn" : "") +
          "|" +
          (field.keywords?.join(",") ?? "") +
          "|" +
          (field.count ?? "") +
          "|" +
          // Options are part of the shape: a field whose option list changed
          // must rebuild, or a stale list is served for the life of the schema.
          // `exclusive` rides along with them, and has to: it decides what a
          // pick DOES rather than how a row looks, so a schema that turns it on
          // without touching a value or a label would otherwise keep serving
          // the previous field objects and the previous, ordinary behaviour.
          (field.options
            ? field.options
                .map(
                  (option) =>
                    option.value +
                    "~" +
                    option.label +
                    (option.exclusive ? "~x" : "")
                )
                .join(",")
            : "") +
          "|" +
          (Array.isArray(field.operators)
            ? field.operators.map((operator) => operator.value).join(",")
            : field.operators
              ? "fn"
              : "")
      )
      if (field.fields?.length) walk(field.fields, depth + 1)
    }
  }

  walk(fields, 0)
  return parts.join("\n")
}

/* -------------------------------------------------------------------------- */
/*                                    Index                                   */
/* -------------------------------------------------------------------------- */

const EMPTY_INDEX: FilterIndex<never, never> = {
  byPath: new Map(),
  childrenOf: new Map(),
  parentOf: new Map(),
  all: [],
  roots: [],
  signature: "",
}

/**
 * Normalizes a field schema into flat maps.
 *
 * Pass the previous index as `previous`: when the signature matches, the
 * PREVIOUS OBJECT is returned unchanged. That is the whole point. Returning an
 * equal-but-new object would leave every downstream memo missing exactly as
 * often as before.
 *
 * Duplicate sibling ids are ignored after the first, matching the cascader's
 * behaviour for duplicate node values. `findFilterSchemaIssues` reports them in
 * development so the silence is not permanent.
 */
export function buildFilterIndex<V = unknown, O = unknown>(
  fields: readonly FilterField<V, O>[],
  previous?: FilterIndex<V, O> | null,
  /** A signature the caller already computed, to avoid walking twice. */
  precomputedSignature?: string
): FilterIndex<V, O> {
  const signature =
    precomputedSignature ?? computeFilterSchemaSignature(fields)
  if (previous && previous.signature === signature) return previous
  if (fields.length === 0) {
    return { ...(EMPTY_INDEX as unknown as FilterIndex<V, O>), signature }
  }

  const byPath = new Map<string, FilterField<V, O>>()
  const childrenOf = new Map<string, FilterField<V, O>[]>()
  const parentOf = new Map<string, string>()
  const all: { field: FilterField<V, O>; path: string[] }[] = []
  const roots: FilterField<V, O>[] = []

  const walk = (
    list: readonly FilterField<V, O>[],
    parentPath: string[],
    parentKey: string
  ) => {
    const accepted: FilterField<V, O>[] = []
    const seen = new Set<string>()

    for (const field of list) {
      if (seen.has(field.id)) continue
      seen.add(field.id)

      const path = [...parentPath, field.id]
      const key = joinFilterPath(path)
      if (byPath.has(key)) continue

      byPath.set(key, field)
      parentOf.set(key, parentKey === FILTER_ROOT_KEY ? "" : parentKey)
      all.push({ field, path })
      accepted.push(field)

      if (field.fields?.length) walk(field.fields, path, key)
    }

    childrenOf.set(parentKey, accepted)
    if (parentKey === FILTER_ROOT_KEY) roots.push(...accepted)
  }

  walk(fields, [], FILTER_ROOT_KEY)

  return { byPath, childrenOf, parentOf, all, roots, signature }
}

/** The field at a path, or undefined. */
export function getFilterField<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[]
): FilterField<V, O> | undefined {
  return index.byPath.get(joinFilterPath(path))
}

/** The ancestor chain for a path, root first and the field itself last. */
export function getFilterFieldChain<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[]
): FilterField<V, O>[] {
  const chain: FilterField<V, O>[] = []
  for (let i = 1; i <= path.length; i++) {
    const field = index.byPath.get(joinFilterPath(path.slice(0, i)))
    if (!field) break
    chain.push(field)
  }
  return chain
}

/** Child fields of a path. Pass an empty path for the root level. */
export function getFilterChildren<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[]
): FilterField<V, O>[] {
  const key = path.length === 0 ? FILTER_ROOT_KEY : joinFilterPath(path)
  return index.childrenOf.get(key) ?? []
}

/** Whether a field holds other fields. */
export function isFilterBranch<V, O>(field: FilterField<V, O>): boolean {
  return Boolean(field.fields?.length)
}

/**
 * Whether a field DECLARES itself filterable on directly.
 *
 * Leaves always do. A branch only when it opts in with `selectable`.
 *
 * Read this when a consumer's own picker wants to honour that opt-in. The
 * pickers this primitive ships deliberately do NOT: see
 * `isFilterFieldPickable`.
 */
export function isFilterFieldSelectable<V, O>(
  field: FilterField<V, O>
): boolean {
  if (field.disabled) return false
  return isFilterBranch(field) ? Boolean(field.selectable) : true
}

/**
 * Whether the SHIPPED pickers may commit a field: leaves only.
 *
 * A row that both drills in and commits cannot disambiguate a single click. It
 * carries a chevron and a child count, so the whole of its affordance says
 * "opens a list", and the press that opened the list was then also the press
 * that created a filter on the parent and dismissed the picker - the user's
 * navigation silently became a commit. Drilling is what the chevron promises,
 * so drilling is what a branch does here, always.
 *
 * `selectable` stays on `FilterField` and stays honoured by
 * `isFilterFieldSelectable`, because a consumer building their own picker may
 * have a chrome where the two actions are separable (a split row, a dedicated
 * "Filter on Company itself" entry). Filtering on a branch is then an explicit
 * row of its own rather than an overloaded click.
 */
export function isFilterFieldPickable<V, O>(
  field: FilterField<V, O>
): boolean {
  if (field.disabled) return false
  return !isFilterBranch(field)
}

/** Trailing count for a branch row. */
export function getFilterFieldCount<V, O>(field: FilterField<V, O>): number {
  return field.count ?? field.fields?.length ?? 0
}

/** Renders a path as "Name > First" using the caller's separator. */
export function formatFilterPath<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[],
  separator: string
): string {
  const chain = getFilterFieldChain(index, path)
  if (chain.length === 0) return path.join(separator)
  return chain.map((field) => field.label).join(separator)
}

/**
 * How a path is shortened when it does not fit, in the cascader's own words.
 *
 * An alias rather than a second union, so the two primitives cannot drift apart
 * on what "middle" means, and so a filters consumer never has to import a
 * cascader type to type a filters prop.
 */
export type FilterPathCollapse = CascaderCollapse

/** One drawn piece of a shortened path. */
export type FilterPathSegment<V = unknown, O = unknown> =
  | { type: "field"; field: FilterField<V, O> }
  /** The run that was elided, kept so a host can surface it. */
  | { type: "ellipsis"; hidden: FilterField<V, O>[] }

/**
 * Shortens an ancestor chain to at most `maxSegments` names.
 *
 * THE COLLAPSING ITSELF IS THE CASCADER'S. `collapseCascaderPath` already
 * decides which run to elide, keeps the root for orientation under `"middle"`,
 * and hands back the hidden nodes so the caller can put them in a tooltip -
 * which is exactly the shape this needs, down to the reason its own doc comment
 * gives for existing ("shared by the trigger value and the in-panel breadcrumb
 * so the two can never disagree"). Filters has the identical problem in two
 * places, the chip's path and the builder's attribute cell, so it borrows the
 * arithmetic rather than growing a second copy that rounds differently.
 *
 * The adapter is positional on purpose. A `FilterField`'s `id` is unique among
 * its SIBLINGS and nowhere else - two branches may both hold a "name" - so the
 * index in the chain is the only key that survives a round trip through a
 * collapser keyed on `value`.
 *
 * Default `"none"`: every existing consumer draws the full path today, and a
 * collapse nobody asked for would silently shorten their breadcrumbs on upgrade.
 */
export function collapseFilterPath<V, O>(
  chain: readonly FilterField<V, O>[],
  options: { maxSegments?: number; collapse?: FilterPathCollapse } = {}
): FilterPathSegment<V, O>[] {
  const segments = collapseCascaderPath(
    chain.map((field, index) => ({ value: String(index), label: field.label })),
    { maxSegments: options.maxSegments, collapse: options.collapse ?? "none" }
  )
  return segments.map((segment) =>
    segment.type === "node"
      ? { type: "field" as const, field: chain[Number(segment.node.value)] }
      : {
          type: "ellipsis" as const,
          hidden: segment.hidden.map((node) => chain[Number(node.value)]),
        }
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Combinator                                 */
/* -------------------------------------------------------------------------- */

/** What the combinator slot at a position is. */
export type FilterCombinatorSlot = "where" | "toggle" | "echo"

/**
 * Which of the three forms the combinator slot before rule `index` takes.
 *
 * A group has exactly ONE combinator, so only one slot may be interactive:
 * three editable "and"s down a column would imply three independent choices.
 * The first slot reads "Where" so the query scans as a sentence, the second is
 * the control, and every later one echoes it.
 *
 * Pure and shared, because the chip row and the advanced builder draw the same
 * rule with different chrome, and a rule restated in two places is a rule that
 * drifts.
 */
export function filterCombinatorSlot(index: number): FilterCombinatorSlot {
  if (index === 0) return "where"
  return index === 1 ? "toggle" : "echo"
}

/* -------------------------------------------------------------------------- */
/*                                   Matching                                 */
/* -------------------------------------------------------------------------- */

/**
 * Case folding for search.
 *
 * `toLocaleLowerCase` on both sides rather than `toLowerCase`, so Turkish
 * dotted and dotless i fold the way a Turkish reader expects.
 */
export function foldFilterText(text: string): string {
  return text.toLocaleLowerCase()
}

export function normalizeFilterQuery(query: string): string {
  return foldFilterText(query.trim())
}

/** Whether a field matches a normalized query, by label or keywords. */
export function matchesFilterQuery<V, O>(
  field: FilterField<V, O>,
  normalizedQuery: string
): boolean {
  if (normalizedQuery === "") return true
  if (foldFilterText(field.label).includes(normalizedQuery)) return true
  if (field.keywords) {
    for (const keyword of field.keywords) {
      if (foldFilterText(keyword).includes(normalizedQuery)) return true
    }
  }
  return false
}

/** Filters one level, preserving input order. */
export function filterFilterLevel<V, O>(
  fields: readonly FilterField<V, O>[],
  normalizedQuery: string
): FilterField<V, O>[] {
  if (normalizedQuery === "") return fields as FilterField<V, O>[]
  return fields.filter((field) => matchesFilterQuery(field, normalizedQuery))
}

/**
 * Searches every selectable field at any depth.
 *
 * A helper for a CONSUMER-built picker, like `filterFilterLevel` and
 * `matchesFilterQuery` beside it: the shipped picker is the cascader and
 * delegates deep search to it, so nothing in the composition tier calls these.
 * They stay because a custom picker re-implementing the fold, the keyword
 * matching and the selectable rule is exactly the drift this module exists to
 * prevent.
 *
 * Only SELECTABLE fields are returned: a search result the user cannot pick is
 * a dead end, and a pure navigation branch is not an answer to "filter by
 * email". Results carry their path so the row can show "Customer > Email".
 */
export function searchFilterDeep<V, O>(
  index: FilterIndex<V, O>,
  normalizedQuery: string,
  limit = 200
): { field: FilterField<V, O>; path: string[] }[] {
  if (normalizedQuery === "") return []
  const results: { field: FilterField<V, O>; path: string[] }[] = []
  for (const entry of index.all) {
    if (results.length >= limit) break
    if (!isFilterFieldSelectable(entry.field)) continue
    if (matchesFilterQuery(entry.field, normalizedQuery)) results.push(entry)
  }
  return results
}

/** Filters an option list by a normalized query, by label or keywords. */
export function filterFilterOptions<O>(
  options: readonly FilterOption<O>[],
  normalizedQuery: string
): FilterOption<O>[] {
  if (normalizedQuery === "") return options as FilterOption<O>[]
  return options.filter((option) => {
    if (foldFilterText(option.label).includes(normalizedQuery)) return true
    if (option.keywords) {
      for (const keyword of option.keywords) {
        if (foldFilterText(keyword).includes(normalizedQuery)) return true
      }
    }
    return false
  })
}

/* -------------------------------------------------------------------------- */
/*                              Exclusive options                             */
/* -------------------------------------------------------------------------- */

/**
 * The None rule, as pure algebra over two selections.
 *
 * `FilterOption.exclusive` marks the row that means NONE OF THE ABOVE, and the
 * whole of what that means is here: pick it and it is the only pick, pick
 * anything else and it goes. Everything downstream is layout.
 *
 * ONE function, called from ONE place (the option editor's selection handler),
 * for the reason the mutation boundary exists a tier up: a click and an Enter
 * arrive through the same handler, so keyboard parity is structural rather
 * than something two code paths have to remember to agree on, and a rule
 * written twice is a rule that drifts.
 *
 * Written against the DELTA rather than against the result, which is what makes
 * it total. The four cases it has to separate cannot be told apart from `next`
 * alone:
 *
 * - Nothing was added. A removal, including UNTICKING the exclusive row, which
 *   has to leave nothing selected rather than stick on. `next` passes through
 *   untouched, so toggling off costs no special case at all.
 * - An exclusive value arrived. It is the whole answer: `[value]`.
 * - An ordinary value arrived. Every exclusive value is dropped, whether it was
 *   picked a moment ago or restored from a saved view.
 * - Both arrived in one step, which only a caller batching picks can produce.
 *   The exclusive one wins, and the LAST of several wins, on the same reading
 *   of intent the single case has.
 *
 * `isExclusive` is a lookup rather than an array because the caller's knowledge
 * is wider than any list it could pass. An async field's menu holds one page,
 * and a query narrowing it to "ada" hides the None row while leaving it
 * SELECTED, so a partition of the visible rows would answer "not exclusive" for
 * the very value the click has to clear. The editor asks the option service
 * instead, which reads the schema, every page any host has loaded, and
 * `resolveValues` results. A value that resolves nowhere is treated as
 * ordinary: an option nobody can produce cannot claim to be the absence of all
 * the others.
 *
 * Deliberately NOT applied on read. A stored value array holding the exclusive
 * value alongside others is invalid in the sense that this UI can no longer
 * produce it, and valid in every other sense: `assignee has any of (Ada,
 * nobody)` is an executable query, and a saved view is the consumer's data. So
 * a controlled bar renders it honestly rather than either rewriting the
 * consumer's state behind their back or firing an `onQueryChange` nobody asked
 * for on mount. It heals on the first ordinary pick instead, because the case
 * above drops every exclusive value whatever put it there.
 *
 * ON ONE CONDITION, which is worth stating rather than leaving to be found: it
 * heals only while `isExclusive` can still ANSWER for the stored value. Give a
 * `loadOptions` field a None row that lives in a page nobody has fetched, and
 * no `resolveValues` to fetch it with, and the resolver says "ordinary" - so
 * the next pick lands BESIDE the stored value and produces the very array this
 * function exists to forbid, by the one route it cannot see.
 *
 * No algebra here fixes that. An unresolvable value is either the exclusive
 * option or an ordinary id whose label has not arrived, the two are
 * indistinguishable from in here, and dropping every unresolvable value on
 * every pick would delete real selections to prevent an occasional invalid one
 * - a strictly worse trade. It is fixed in the SCHEMA instead, and cheaply: an
 * exclusive option belongs in the field's static `options` even when the rest
 * of the list is async, because `resolve` reads those first and
 * unconditionally, so the None rule holds before the first page lands and after
 * a restored view. A `resolveValues` that covers the value does the same job
 * one round trip later. `FilterMultiSelectEditor` warns once in development
 * when it meets a selection it cannot classify on a field that has a None row,
 * rather than letting the wrong query leave quietly.
 */
export function applyFilterExclusiveSelection(
  next: readonly string[],
  previous: readonly string[],
  isExclusive: (value: string) => boolean
): string[] {
  const held = new Set(previous)
  const added = next.filter((value) => !held.has(value))
  if (added.length === 0) return next as string[]

  let arrived: string | null = null
  for (const value of added) {
    if (isExclusive(value)) arrived = value
  }
  if (arrived !== null) return [arrived]

  const kept = next.filter((value) => !isExclusive(value))
  // The same array when nothing was exclusive, which is nearly every call: a
  // fresh one would commit a new value on every toggle of every ordinary row
  // and redraw the chip for a change that did not happen.
  return kept.length === next.length ? (next as string[]) : kept
}

/* -------------------------------------------------------------------------- */
/*                                     Ids                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds a deterministic id generator.
 *
 * The old `createFilter` used `` `${Date.now()}-${Math.random()}` ``, which is
 * hostile to server rendering: the server and the client produce different ids
 * for the same initial query, so React reports a hydration mismatch on any page
 * that ships default filters. Seeding from `React.useId()` and counting from
 * there is stable across both passes.
 */
export function createFilterIdFactory(seed: string): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `${seed}${counter}`
  }
}

/* -------------------------------------------------------------------------- */
/*                              Development checks                            */
/* -------------------------------------------------------------------------- */

const warned = new Set<string>()

/** Warns once per key. Never throws, and is a no-op in production. */
export function warnFilterOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === "production") return
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[filters] ${message}`)
}

/** Clears the warn-once memory. For tests. */
export function resetFilterWarnings(): void {
  warned.clear()
}

export interface FilterSchemaIssues {
  /** Ids that are empty, or that collide with a sibling. */
  duplicatePaths: string[]
  emptyIds: string[]
  /** Branches that declare `selectable` but hold no children. */
  emptyBranches: string[]
  /** Fields whose `defaultOperator` is not in their operator list. */
  unknownDefaultOperators: string[]
}

/**
 * Structural problems worth telling a developer about.
 *
 * Reported, never thrown: a schema arriving from a server should degrade to a
 * usable picker rather than blanking the page.
 */
export function findFilterSchemaIssues<V, O>(
  fields: readonly FilterField<V, O>[],
  resolveOperators: (field: FilterField<V, O>) => FilterOperator[]
): FilterSchemaIssues {
  const duplicatePaths: string[] = []
  const emptyIds: string[] = []
  const emptyBranches: string[] = []
  const unknownDefaultOperators: string[] = []

  const walk = (list: readonly FilterField<V, O>[], parentPath: string[]) => {
    const seen = new Set<string>()
    for (const field of list) {
      const label = [...parentPath, field.id].join(".")
      if (!field.id) emptyIds.push(label)
      else if (seen.has(field.id)) duplicatePaths.push(label)
      seen.add(field.id)

      if (field.selectable && field.fields && field.fields.length === 0) {
        emptyBranches.push(label)
      }

      if (field.defaultOperator) {
        const operators = resolveOperators(field)
        if (!operators.some((op) => op.value === field.defaultOperator)) {
          unknownDefaultOperators.push(`${label} -> ${field.defaultOperator}`)
        }
      }

      if (field.fields?.length) walk(field.fields, [...parentPath, field.id])
    }
  }

  walk(fields, [])
  return { duplicatePaths, emptyIds, emptyBranches, unknownDefaultOperators }
}
