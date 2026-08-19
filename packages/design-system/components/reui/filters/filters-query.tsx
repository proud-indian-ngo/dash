// @ts-nocheck
import type {
  FilterCombinator,
  FilterGroupNode,
  FilterIssue,
  FilterNode,
  FilterOperator,
  FilterQuery,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

/* -------------------------------------------------------------------------- */
/*                                 Constructors                               */
/* -------------------------------------------------------------------------- */

export function isFilterRule<V>(node: FilterNode<V>): node is FilterRule<V> {
  return node.type === "rule"
}

export function isFilterGroup<V>(
  node: FilterNode<V>
): node is FilterGroupNode<V> {
  return node.type === "group"
}

/**
 * A rule.
 *
 * `id` is required rather than generated here. Generating it would put a
 * non-deterministic value inside a pure function, which is how the old
 * `createFilter` ended up producing a different id on the server and the client
 * and breaking hydration on any page that shipped default filters. Callers get
 * their id from `createFilterIdFactory`, seeded from `useId`.
 */
export function createFilterRule<V = unknown>(input: {
  id: string
  path: string[]
  operator: string
  value?: V
  negated?: boolean
}): FilterRule<V> {
  const rule: FilterRule<V> = {
    id: input.id,
    type: "rule",
    path: input.path,
    operator: input.operator,
    value: input.value,
  }
  if (input.negated) rule.negated = true
  return rule
}

export function createFilterGroup<V = unknown>(input: {
  id: string
  combinator?: FilterCombinator
  rules?: FilterNode<V>[]
}): FilterGroupNode<V> {
  return {
    id: input.id,
    type: "group",
    combinator: input.combinator ?? "and",
    rules: input.rules ?? [],
  }
}

/** An empty query. The root is always a group, never a bare array. */
export function createFilterQuery<V = unknown>(
  rules: FilterNode<V>[] = [],
  combinator: FilterCombinator = "and",
  id = "root"
): FilterQuery<V> {
  return { id, type: "group", combinator, rules }
}

/* -------------------------------------------------------------------------- */
/*                                   Reading                                  */
/* -------------------------------------------------------------------------- */

/** Every rule in the tree, depth first. Groups are flattened away. */
export function flattenFilterRules<V>(query: FilterQuery<V>): FilterRule<V>[] {
  const out: FilterRule<V>[] = []
  const walk = (node: FilterNode<V>) => {
    if (isFilterRule(node)) {
      out.push(node)
      return
    }
    for (const child of node.rules) walk(child)
  }
  walk(query)
  return out
}

/**
 * One rule, flattened to the shape most consumers actually filter with.
 *
 * `values` is always an array even though `FilterRule.value` is singular. That
 * is not a step backwards: the query STORES the honest shape, and this is the
 * read-side normalisation that a predicate wants, so a caller writes one
 * `values.includes(...)` branch instead of re-deriving arity at every call site.
 */
export interface FilterCondition {
  /** Full field path, `["name", "first"]`. */
  path: string[]
  /** First path segment, for the common flat-schema case. */
  field: string
  operator: string
  /** `[]` for an operator that takes no value. */
  values: unknown[]
  negated: boolean
}

/**
 * Whether a rule says anything at all yet.
 *
 * A rule is created the moment an attribute is picked, before a condition has
 * been chosen, so `operator: ""` is a real and expected state - it is the chip
 * reading "Select condition" with a dashed outline. It is not a filter: there
 * is no predicate for "not yet decided".
 *
 * The two readers below therefore SKIP an incomplete rule rather than emitting
 * `operator: ""` into a consumer's predicate, and `collectFilterIssues` reports
 * it as `missing-operator` so the chrome can point at the cell that is empty.
 * It is the ONE completeness rule in the primitive, so a consumer compiling the
 * conditions to SQL, Prisma, Drizzle or a REST query reads the same answer the
 * chrome draws rather than re-deriving it.
 */
export function isFilterRuleComplete<V>(rule: FilterRule<V>): boolean {
  return rule.operator !== ""
}

/**
 * Flattens a query to conditions, dropping group structure.
 *
 * Lossy by design, and only safe when the query is flat or every group shares
 * the root's combinator. Read `query.combinator` and walk the tree directly for
 * anything else. It exists because compiling a flat AND to a predicate is what
 * the overwhelming majority of consumers need, and making each of them
 * re-implement the value-to-array normalisation is how the old primitive ended
 * up with a different `values` convention in every block that used it.
 *
 * Incomplete rules are left out. Handing a consumer `operator: ""` means every
 * one of them writes the same guard or, far more likely, forgets to and filters
 * every row out on a switch that falls through.
 */
export function flattenFilterConditions<V>(
  query: FilterQuery<V>
): FilterCondition[] {
  return flattenFilterRules(query).filter(isFilterRuleComplete).map((rule) => ({
    path: rule.path,
    field: rule.path[0],
    operator: rule.operator,
    values:
      rule.value === undefined || rule.value === null
        ? []
        : Array.isArray(rule.value)
          ? (rule.value as unknown[])
          : [rule.value],
    negated: Boolean(rule.negated),
  }))
}

/** How many rules the query holds, at any depth. */
export function countFilterRules<V>(query: FilterQuery<V>): number {
  let count = 0
  const walk = (node: FilterNode<V>) => {
    if (isFilterRule(node)) {
      count += 1
      return
    }
    for (const child of node.rules) walk(child)
  }
  walk(query)
  return count
}

/** Whether the query would match everything. */
export function isFilterQueryEmpty<V>(query: FilterQuery<V>): boolean {
  return countFilterRules(query) === 0
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

/**
 * How an arity is answered for one rule. `null` means "not judgeable".
 *
 * The caller resolves the operator, because arity lives on the FIELD's operator
 * list and this file knows nothing about a schema. `null` is what a rule on a
 * field the schema no longer has returns: the builder draws that rule as an
 * unknown row with no operator and no value cell, so an issue on it would point
 * at a control that is not on screen.
 */
export type FilterArityResolver<V> = (
  rule: FilterRule<V>
) => FilterOperator["arity"] | null

/**
 * Runs a field's own `validate`, when it declares one.
 *
 * A resolver rather than the field itself, for the same reason `arityOf` is
 * one: this file is the primitive's pure tier and knows nothing about the
 * schema index. The caller closes over it and hands back a message or nothing.
 */
export type FilterValidateResolver<V> = (
  rule: FilterRule<V>
) => string | null | undefined | false

/** A value slot the user has not filled in. `false` and `0` are values. */
function isBlankFilterValue(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}

/**
 * Compares two range bounds, or gives up.
 *
 * Deliberately narrow. Numbers and dates have one obvious order, and an ISO
 * string is a date written down, so those three are compared and everything
 * else returns `null` - a custom field whose range is a pair of colour names has
 * no order this function can invent, and guessing one would flag a correct
 * filter as reversed. `Date.parse` is required on BOTH strings, so lexicographic
 * nonsense ("banana" after "apple") never reaches the comparison.
 */
function compareFilterBounds(from: unknown, to: unknown): number | null {
  if (typeof from === "number" && typeof to === "number") {
    return Number.isNaN(from) || Number.isNaN(to) ? null : from - to
  }
  if (from instanceof Date && to instanceof Date) {
    const a = from.getTime()
    const b = to.getTime()
    return Number.isNaN(a) || Number.isNaN(b) ? null : a - b
  }
  if (typeof from === "string" && typeof to === "string") {
    const a = Date.parse(from)
    const b = Date.parse(to)
    return Number.isNaN(a) || Number.isNaN(b) ? null : a - b
  }
  return null
}

/**
 * Every reason a query cannot be run as written, in document order.
 *
 * The five reasons are the five ways this builder can hold a condition that
 * SILENTLY does the wrong thing, which is why they are surfaced HERE rather than
 * left to whatever the consumer compiles the query into. Every one of them is a
 * row the user can see and a result set that disagrees with it:
 *
 *  - `missing-operator` and `empty-group` carry no predicate at all.
 *    `flattenFilterConditions` drops both, so the row is on screen and absent
 *    from the conditions the consumer receives.
 *  - `missing-value` is an operator that needs a value and has none. The
 *    condition reaches the consumer with an EMPTY `values` array, which every
 *    backend reads differently and most read as "match nothing".
 *  - `incomplete-range` is `missing-value` for the second slot.
 *  - `reversed-range` is the quiet one: a range from 10 to 1 is a legal query
 *    that returns no rows anywhere, so it fails as "the filter found nothing"
 *    rather than as an error.
 *
 * A group holding exactly ONE condition is deliberately NOT an issue. It is what
 * "Convert to group" produces, so flagging it would put a warning on the result
 * of the action the user just took, and a group of one means what its one
 * condition means - it is not even a shape change. An EMPTY group is different:
 * nothing is not a filter, and the group will sit there filtering nothing until
 * something goes in it.
 *
 * The ROOT is exempt from `empty-group` for the same reason: a query with no
 * conditions is not a broken query, it is no filter.
 *
 * Pure, so the chrome and a consumer's own "can I save this view" check read one
 * answer rather than two implementations of it.
 */
export function collectFilterIssues<V>(
  query: FilterQuery<V>,
  arityOf: FilterArityResolver<V>,
  validateOf?: FilterValidateResolver<V>
): FilterIssue[] {
  const issues: FilterIssue[] = []

  const visit = (group: FilterGroupNode<V>, isRoot: boolean) => {
    if (!isRoot && group.rules.length === 0) {
      issues.push({
        nodeId: group.id,
        column: "group",
        reason: "empty-group",
      })
    }

    for (const child of group.rules) {
      if (isFilterGroup(child)) {
        visit(child, false)
        continue
      }
      // Asked FIRST, before the completeness check, because `null` means the
      // caller cannot judge this rule at all - a field the schema no longer has
      // draws neither an operator cell nor a value cell, so even
      // `missing-operator` would point at a control that is not on screen.
      const arity = arityOf(child)
      if (arity === null) continue

      if (!isFilterRuleComplete(child)) {
        issues.push({
          nodeId: child.id,
          column: "operator",
          reason: "missing-operator",
        })
        continue
      }

      if (arity === "none") continue

      const values =
        child.value === undefined || child.value === null
          ? []
          : Array.isArray(child.value)
            ? (child.value as unknown[])
            : [child.value]

      if (arity === "range") {
        if (
          values.length < 2 ||
          isBlankFilterValue(values[0]) ||
          isBlankFilterValue(values[1])
        ) {
          issues.push({
            nodeId: child.id,
            column: "value",
            reason: "incomplete-range",
          })
          continue
        }
        const order = compareFilterBounds(values[0], values[1])
        if (order !== null && order > 0) {
          issues.push({
            nodeId: child.id,
            column: "value",
            reason: "reversed-range",
          })
        }
        continue
      }

      // `many` and `one` collapse here: both are unsatisfied by an empty list,
      // and `one` normalises to a single-element list above.
      if (values.length === 0 || values.every(isBlankFilterValue)) {
        issues.push({
          nodeId: child.id,
          column: "value",
          reason: "missing-value",
        })
        continue
      }

      // LAST, and only on a rule the primitive is already happy with. A field
      // whose value is missing has nothing to validate, and stacking a second
      // message on the same cell contradicts the one-issue-per-node shape the
      // chrome reads.
      const message = validateOf?.(child)
      if (message) {
        issues.push({
          nodeId: child.id,
          column: "value",
          reason: "custom",
          message,
        })
      }
    }
  }

  visit(query, true)
  return issues
}

/** Locates a node and its parent. Returns null when the id is unknown. */
export function findFilterNode<V>(
  query: FilterQuery<V>,
  id: string
): {
  node: FilterNode<V>
  parent: FilterGroupNode<V> | null
  index: number
} | null {
  if (query.id === id) return { node: query, parent: null, index: -1 }

  const walk = (
    group: FilterGroupNode<V>
  ): { node: FilterNode<V>; parent: FilterGroupNode<V>; index: number } | null => {
    for (let i = 0; i < group.rules.length; i++) {
      const child = group.rules[i]
      if (child.id === id) return { node: child, parent: group, index: i }
      if (isFilterGroup(child)) {
        const found = walk(child)
        if (found) return found
      }
    }
    return null
  }

  return walk(query)
}

/** The rule with this id, or null when the id names a group or is unknown. */
export function findFilterRule<V>(
  query: FilterQuery<V>,
  id: string
): FilterRule<V> | null {
  const found = findFilterNode(query, id)
  if (!found || !isFilterRule(found.node)) return null
  return found.node
}

/* -------------------------------------------------------------------------- */
/*                                  Rewriting                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rebuilds the tree, applying `transform` to the group holding `id`.
 *
 * Every writer below routes through this, which is what makes structural
 * sharing a property of the module rather than of each function: a group whose
 * subtree did not change is returned BY IDENTITY, so `React.memo` on a chip
 * holds for every chip except the one that actually moved. Tests assert this
 * with `toBe`, not `toEqual`.
 */
function rewriteGroup<V>(
  group: FilterGroupNode<V>,
  shouldRewrite: (group: FilterGroupNode<V>) => boolean,
  transform: (group: FilterGroupNode<V>) => FilterGroupNode<V>
): FilterGroupNode<V> {
  if (shouldRewrite(group)) return transform(group)

  let changed = false
  const rules = group.rules.map((child) => {
    if (!isFilterGroup(child)) return child
    const next = rewriteGroup(child, shouldRewrite, transform)
    if (next !== child) changed = true
    return next
  })

  return changed ? { ...group, rules } : group
}

/** Replaces a rule's fields. Unknown ids return the query unchanged. */
export function updateFilterRule<V>(
  query: FilterQuery<V>,
  id: string,
  updates: Partial<Omit<FilterRule<V>, "id" | "type">>
): FilterQuery<V> {
  return rewriteGroup(
    query,
    (group) => group.rules.some((child) => child.id === id && isFilterRule(child)),
    (group) => ({
      ...group,
      rules: group.rules.map((child) =>
        child.id === id && isFilterRule(child) ? { ...child, ...updates } : child
      ),
    })
  ) as FilterQuery<V>
}

/**
 * Removes a node.
 *
 * A group left with no rules is removed too, all the way up, because an empty
 * group is invisible in the flat UI yet still contributes an empty pair of
 * parentheses to anything that compiles the tree. The root group is kept even
 * when empty: it is the query.
 */
export function removeFilterNode<V>(
  query: FilterQuery<V>,
  id: string
): FilterQuery<V> {
  const prune = (group: FilterGroupNode<V>): FilterGroupNode<V> => {
    let changed = false
    const rules: FilterNode<V>[] = []

    for (const child of group.rules) {
      if (child.id === id) {
        changed = true
        continue
      }
      if (isFilterGroup(child)) {
        const next = prune(child)
        if (next !== child) changed = true
        if (next.rules.length === 0) continue
        rules.push(next)
        continue
      }
      rules.push(child)
    }

    return changed ? { ...group, rules } : group
  }

  return prune(query) as FilterQuery<V>
}

/** Appends a node to a group, defaulting to the root. */
export function insertFilterNode<V>(
  query: FilterQuery<V>,
  node: FilterNode<V>,
  parentId?: string,
  index?: number
): FilterQuery<V> {
  const targetId = parentId ?? query.id
  return rewriteGroup(
    query,
    (group) => group.id === targetId,
    (group) => {
      const rules = [...group.rules]
      const at = index === undefined ? rules.length : Math.max(0, Math.min(index, rules.length))
      rules.splice(at, 0, node)
      return { ...group, rules }
    }
  ) as FilterQuery<V>
}

/**
 * A deep copy of a node under fresh ids.
 *
 * Fresh ids the whole way down, not just at the root: a group whose children
 * kept their originals would give two live nodes one id, and every lookup in
 * this file is by id, so the second copy would be unaddressable and the first
 * would answer for both.
 */
function cloneFilterNode<V>(
  node: FilterNode<V>,
  nextId: () => string
): FilterNode<V> {
  return isFilterRule(node)
    ? { ...node, id: nextId() }
    : {
        ...node,
        id: nextId(),
        rules: node.rules.map((child) => cloneFilterNode(child, nextId)),
      }
}

/** Copies a node in beside the original. */
export function duplicateFilterNode<V>(
  query: FilterQuery<V>,
  id: string,
  nextId: () => string
): FilterQuery<V> {
  const found = findFilterNode(query, id)
  if (!found || !found.parent) return query

  return insertFilterNode(
    query,
    cloneFilterNode(found.node, nextId),
    found.parent.id,
    found.index + 1
  )
}

/** Sets a group's combinator. */
export function setFilterCombinator<V>(
  query: FilterQuery<V>,
  groupId: string,
  combinator: FilterCombinator
): FilterQuery<V> {
  return rewriteGroup(
    query,
    (group) => group.id === groupId,
    (group) => (group.combinator === combinator ? group : { ...group, combinator })
  ) as FilterQuery<V>
}

/** Flips a group's combinator between and and or. */
export function toggleFilterCombinator<V>(
  query: FilterQuery<V>,
  groupId: string
): FilterQuery<V> {
  const found = findFilterNode(query, groupId)
  if (!found || !isFilterGroup(found.node)) return query
  return setFilterCombinator(
    query,
    groupId,
    found.node.combinator === "and" ? "or" : "and"
  )
}

/** Moves a node within its own group. Out of range moves are no-ops. */
export function moveFilterNode<V>(
  query: FilterQuery<V>,
  id: string,
  delta: number
): FilterQuery<V> {
  const found = findFilterNode(query, id)
  if (!found || !found.parent) return query

  const from = found.index
  const to = from + delta
  if (to < 0 || to >= found.parent.rules.length || delta === 0) return query

  return rewriteGroup(
    query,
    (group) => group.id === found.parent!.id,
    (group) => {
      const rules = [...group.rules]
      const [moved] = rules.splice(from, 1)
      rules.splice(to, 0, moved)
      return { ...group, rules }
    }
  ) as FilterQuery<V>
}

/** Whether `id` names `node` itself or anything beneath it. */
function containsFilterNode<V>(node: FilterNode<V>, id: string): boolean {
  if (node.id === id) return true
  if (isFilterRule(node)) return false
  return node.rules.some((child) => containsFilterNode(child, id))
}

/**
 * Removes a node WITHOUT pruning the groups it leaves behind.
 *
 * The opposite of `removeFilterNode`'s deliberate pruning, and the reason it
 * cannot be reused for a move: dragging the last condition out of a group would
 * delete the group before the insert ran, so a drop back into it would land
 * nowhere. A move is one operation on the tree, not a remove followed by an add.
 */
function detachFilterNode<V>(
  group: FilterGroupNode<V>,
  id: string
): FilterGroupNode<V> {
  let changed = false
  const rules: FilterNode<V>[] = []

  for (const child of group.rules) {
    if (child.id === id) {
      changed = true
      continue
    }
    if (isFilterGroup(child)) {
      const next = detachFilterNode(child, id)
      if (next !== child) changed = true
      rules.push(next)
      continue
    }
    rules.push(child)
  }

  return changed ? { ...group, rules } : group
}

/**
 * Moves a node into another group, at an index.
 *
 * `moveFilterNode` reorders within one parent, which is all a flat chip row can
 * express. Nested groups need the cross-parent form: it is what a drag from the
 * root into a group, or out of one, actually is.
 *
 * Refuses to move a group into itself or into its own descendant, which would
 * detach that whole subtree from the tree and leave a cycle behind. The root is
 * likewise immovable: it is the query.
 */
export function moveFilterNodeTo<V>(
  query: FilterQuery<V>,
  id: string,
  parentId: string,
  index: number
): FilterQuery<V> {
  const found = findFilterNode(query, id)
  if (!found || !found.parent) return query
  if (containsFilterNode(found.node, parentId)) return query

  const destination = findFilterNode(query, parentId)
  if (!destination || !isFilterGroup(destination.node)) return query

  // Within one parent the slot the node currently occupies disappears when it
  // detaches, so every index after it shifts down by one. Skipping this makes a
  // one-step drag down a no-op and a drag to the end land one short.
  const sameParent = found.parent.id === parentId
  const target = sameParent && found.index < index ? index - 1 : index
  if (sameParent && target === found.index) return query

  return insertFilterNode(detachFilterNode(query, id), found.node, parentId, target)
}

/**
 * Copies a node into a group at a position, leaving the original in place.
 *
 * The Alt path of the drag layer. It is deliberately NOT `duplicateFilterNode`
 * followed by `moveFilterNodeTo`: that pair emits two queries for one gesture,
 * so a controlled consumer sees an intermediate tree with the copy beside the
 * original, and the second step needs the id the first one minted and never
 * returned.
 *
 * Unlike a move it may target the dragged node's own subtree. The clone is
 * taken BEFORE the insert, so copying a group into itself produces one finite
 * snapshot rather than the cycle `moveFilterNodeTo` has to refuse.
 */
export function copyFilterNodeTo<V>(
  query: FilterQuery<V>,
  id: string,
  parentId: string,
  index: number,
  nextId: () => string
): FilterQuery<V> {
  const found = findFilterNode(query, id)
  if (!found || !found.parent) return query

  const destination = findFilterNode(query, parentId)
  if (!destination || !isFilterGroup(destination.node)) return query

  return insertFilterNode(
    query,
    cloneFilterNode(found.node, nextId),
    parentId,
    index
  )
}

/**
 * Wraps a node in a new group.
 *
 * The one operation that turns a flat query into a nested one: it is what the
 * advanced builder's "Wrap in condition group" does, and it is the keyboard
 * path to nesting for a user who cannot drag.
 */
export function wrapFilterNodeInGroup<V>(
  query: FilterQuery<V>,
  id: string,
  groupId: string,
  combinator: FilterCombinator = "or"
): FilterQuery<V> {
  const found = findFilterNode(query, id)
  if (!found || !found.parent) return query

  return rewriteGroup(
    query,
    (group) => group.id === found.parent!.id,
    (group) => ({
      ...group,
      rules: group.rules.map((child) =>
        child.id === id
          ? createFilterGroup<V>({ id: groupId, combinator, rules: [child] })
          : child
      ),
    })
  ) as FilterQuery<V>
}

/**
 * Dissolves a group into its parent, keeping its children in place.
 *
 * The inverse of `wrapFilterNodeInGroup`: the group's rules are spliced into
 * its parent at the position the group held, in order, so wrapping and
 * unwrapping round-trip. The root cannot be unwrapped (it is the query), a
 * rule id is a no-op, and an unknown id returns the query unchanged. Only the
 * parent chain is rewritten; untouched branches keep their identity.
 */
export function unwrapFilterGroup<V>(
  query: FilterQuery<V>,
  groupId: string
): FilterQuery<V> {
  if (query.id === groupId) return query
  const found = findFilterNode(query, groupId)
  if (!found || !found.parent || !isFilterGroup(found.node)) return query

  const dissolved = found.node
  return rewriteGroup(
    query,
    (group) => group.id === found.parent!.id,
    (group) => {
      const rules = [...group.rules]
      rules.splice(found.index, 1, ...dissolved.rules)
      return { ...group, rules }
    }
  ) as FilterQuery<V>
}

/** Empties the query, keeping the root's identity fields. */
export function clearFilterQuery<V>(query: FilterQuery<V>): FilterQuery<V> {
  return query.rules.length === 0 ? query : { ...query, rules: [] }
}

/**
 * Drops groups that hold nothing and unwraps groups holding exactly one node.
 *
 * Not called automatically. A user mid-edit may legitimately hold an
 * almost-empty group, and collapsing it under them would be hostile. Consumers
 * persisting a query call it once on the way out.
 */
export function pruneFilterQuery<V>(query: FilterQuery<V>): FilterQuery<V> {
  const prune = (node: FilterNode<V>): FilterNode<V> | null => {
    if (isFilterRule(node)) return node

    const rules: FilterNode<V>[] = []
    for (const child of node.rules) {
      const next = prune(child)
      if (next) rules.push(next)
    }

    if (rules.length === 0) return null
    if (rules.length === 1 && isFilterGroup(rules[0])) return rules[0]
    return { ...node, rules }
  }

  const rules: FilterNode<V>[] = []
  for (const child of query.rules) {
    const next = prune(child)
    if (next) rules.push(next)
  }
  return { ...query, rules }
}