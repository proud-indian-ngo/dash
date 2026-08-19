// @ts-nocheck
import type {
  FilterDraftStep,
  FilterIssue,
  FilterIssueReason,
  FilterLabels,
} from "@pi-dash/design-system/components/reui/filters/filters-types"

/**
 * The shipped English copy.
 *
 * Every key here is read by the shipped chrome, with two exceptions that are
 * documented as such. `stepAnnouncement` serves a consumer-composed create
 * wizard, because the shipped flow commits on field selection and announces
 * counts instead. `showRecords` was the builder's own subtitle until the panel
 * lost it: the line said what the first row's "Where" already said, one line
 * above it. It is kept, translated and published because a consumer heading
 * their own filter panel needs exactly that sentence, and deleting a key
 * somebody has already translated buys nothing.
 *
 * THREE MORE went with the builder's header strip: `queryMenu` named its
 * kebab, `matchAll` and `matchAny` were the rows in it. See `groupMenu` in
 * `filters-types` for why the strip went and where each of its actions is
 * reachable from now.
 *
 * The old primitive's i18n object carried about twenty keys of
 * which half were dead: `min`, `max`, `to`, `true`, `false`, `percent`,
 * `defaultCurrency`, `typeAndPressEnter`, `enterValue`, `enterKey`, `selected`
 * and `addFilterTitle` each appeared exactly twice, in the interface and in
 * this default, and never once in the component. They advertised field types
 * the primitive did not have. A translator who filled them in got nothing for
 * the work.
 */
export const DEFAULT_FILTER_LABELS: FilterLabels = {
  addFilter: "Add filter",
  advancedFilter: "Advanced filter",
  showRecords: "In this view, show records",
  builderEmpty: "No filters yet",
  builderEmptyHint: "Add a filter to narrow down what you see.",
  addCondition: "Add filter",
  addConditionGroup: "Add group",
  addToGroup: "Add filter to this group",
  removeGroup: "Remove group",
  wrapInGroup: "Wrap in group",
  ungroup: "Ungroup",
  moveToTopLevel: "Move to top",
  moveToGroup: (position) => `Move to group ${position}`,
  reorder: "Reorder",
  reorderHint: "Press Alt with Arrow Up or Arrow Down to reorder",
  groupAll: "All of the following are true...",
  groupAny: "Any of the following are true...",
  groupPlaceholder: "Drag filters here",
  rowLabel: (condition, depth) => `${condition}, level ${depth}`,
  groupLabel: (description, depth) => `${description} level ${depth}`,
  groupAnnouncement: (added) =>
    added ? "Group added" : "Group removed",
  reorderAnnouncement: (label, position, total) =>
    `${label} moved to position ${position} of ${total}`,
  // The destination FIRST after the verb, because that is the half a plain
  // reorder cannot say and the half the user cannot see once the row has
  // stopped moving. The position follows it, so the sentence still ends with
  // the same "of N" a reorder ends with.
  moveAnnouncement: (label, destination, position, total) =>
    `${label} moved into ${destination}, position ${position} of ${total}`,
  clearAll: "Clear all",
  groupMenu: "Group options",
  searchFields: "Search attributes...",
  searchOperators: "Search operators...",
  searchOptions: "Search...",
  back: "Back",
  clear: "Clear",
  apply: "Apply",
  discard: "Discard changes",
  empty: "No results",
  loading: "Loading...",
  loadingMore: "Loading more...",
  loadMore: "Load more",
  error: "Could not load",
  retry: "Retry",
  where: "Where",
  and: "And",
  or: "Or",
  combinator: "Change combinator",
  // The word first, because it is what the control SAYS and what a truncated
  // pill stops showing. The action follows it, so the name still names an
  // action for anyone who meets the button without seeing it.
  combinatorLabel: (word) => `${word}, change combinator`,
  duplicate: "Duplicate",
  negate: "Negate",
  convertToAdvanced: "Advanced editor",
  remove: "Remove",
  chipMenu: (fieldLabel) => `${fieldLabel} filter options`,
  filtersLabel: "Filters",
  filterLabel: (condition) => condition,
  readOnly: "Read only. These filters cannot be changed.",
  pathSeparator: " > ",
  valuePlaceholder: "enter text...",
  selectPlaceholder: "Select...",
  noValue: "no value",
  selectCondition: "Select condition",
  incomplete: "incomplete filter",
  branchAffordance: "opens a list",
  exclusiveHint: "cannot be combined with the other options",
  exclusiveAnnouncement: (label, cleared) =>
    cleared === 1
      ? `${label} selected. 1 other selection cleared.`
      : `${label} selected. ${cleared} other selections cleared.`,
  itemCount: (count) => `${count} items`,
  fieldsLabel: "Attributes",
  resultsAnnouncement: (count) =>
    count === 1 ? "1 result" : `${count} results`,
  actionsLabel: "Actions",
  stepAnnouncement: (step, label) => {
    if (step === "field") return `Choose an attribute. ${label}`
    if (step === "operator") return `Choose a condition for ${label}`
    return `Enter a value for ${label}`
  },
  countAnnouncement: (count) =>
    count === 1 ? "1 filter applied" : `${count} filters applied`,
  valueCount: (count) => `${count} selected`,
  valueDetail: (summary, values) => `${summary}: ${values.join(", ")}`,
  valueRange: (from, to) => `${from} to ${to}`,
  rangeFrom: (fieldLabel) => `${fieldLabel} from`,
  rangeTo: (fieldLabel) => `${fieldLabel} to`,
  rangeSeparator: "to",
  negated: (operatorLabel) => `not ${operatorLabel}`,
  issueOperator: "Choose a condition",
  issueValue: "Enter a value",
  issueRange: "Enter both ends of the range",
  issueRangeOrder: "The end of the range comes before its start",
  issueEmptyGroup: "This group has no conditions yet",
  // "Row" rather than "condition", because an empty GROUP is counted here too
  // and a group is not a condition. Row is what the builder already calls both
  // in `rowLabel`, and it is the unit the person reading this is looking at.
  issueSummary: (count) =>
    count === 1 ? "1 row needs attention" : `${count} rows need attention`,
}

/**
 * Merges a partial override over the defaults.
 *
 * Shallow, like the cascader's. A deep merge would mean a consumer could not
 * replace a function-valued label without the default leaking back in for the
 * arguments they did not think about.
 */
export function resolveFilterLabels(
  labels?: Partial<FilterLabels>
): FilterLabels {
  if (!labels) return DEFAULT_FILTER_LABELS
  return { ...DEFAULT_FILTER_LABELS, ...labels }
}

/**
 * The sentence for one issue.
 *
 * A lookup rather than five call sites reading five keys, because the same
 * sentence is used three times over for one issue - as the cell's tooltip, as
 * its `aria-description`, and in the panel's summary - and three literals per
 * reason is three places for a translation to go missing from.
 *
 * Takes the ISSUE and not just the reason, because one reason carries its own
 * words: a field's `validate` returns the sentence, so `custom` has nothing to
 * look up. Everything else still resolves out of `FilterLabels`, which is what
 * keeps a translated build correct without the primitive holding a string.
 */
export function filterIssueLabel(
  issue: Pick<FilterIssue, "reason" | "message"> | FilterIssueReason,
  labels: FilterLabels
): string {
  const reason = typeof issue === "string" ? issue : issue.reason
  if (typeof issue !== "string" && issue.message) return issue.message
  if (reason === "missing-operator") return labels.issueOperator
  if (reason === "incomplete-range") return labels.issueRange
  if (reason === "reversed-range") return labels.issueRangeOrder
  if (reason === "empty-group") return labels.issueEmptyGroup
  return labels.issueValue
}

/** The search placeholder for a step's panel. */
export function stepPlaceholder(
  step: FilterDraftStep,
  labels: FilterLabels
): string {
  if (step === "field") return labels.searchFields
  if (step === "operator") return labels.searchOperators
  return labels.searchOptions
}