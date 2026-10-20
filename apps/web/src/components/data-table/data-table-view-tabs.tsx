import {
  createFilterQuery,
  createFilterRule,
  isFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterField,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import {
  type FilterValueGetter,
  readSelectEquality,
} from "./compile-filter-query";

const ALL_VIEW = "__all__";
const ATTENTION_PREFIX = "attention:";

export interface DataTableView {
  count: number;
  label: string;
  value: string;
}

/**
 * A count shortcut shown after the view tabs, past a divider: rows that need
 * someone's attention ("Unallocated", "Missing payment proof"). It applies
 * one `is` rule on its own, replacing the rest of the query; picking a view
 * tab or All clears it. Hidden while its count is 0, unless it is the active
 * filter. `count` must use the same predicate as the rule's filter value so
 * the count and the rows agree.
 */
export interface DataTableAttentionView {
  count: number;
  id: string;
  label: string;
  rule: { path: string; value: string };
}

/** One tab per option of a select field, counted over every row. */
export function getDataTableViews<TData>({
  data,
  field,
  getValue,
}: {
  data: readonly TData[];
  field: FilterField;
  getValue: FilterValueGetter<TData>;
}): DataTableView[] {
  const options = Array.isArray(field.options) ? field.options : [];
  const counts = new Map<string, number>();
  for (const row of data) {
    const value = getValue(row, [field.id]);
    if (typeof value === "string") {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return options.map((option) => ({
    count: counts.get(option.value) ?? 0,
    label: option.label,
    value: option.value,
  }));
}

/**
 * Replaces any top-level rule on `fieldId` with `is value`, or removes it for
 * the All view. Other rules are kept.
 */
export function selectDataTableView(
  query: FilterQuery,
  fieldId: string,
  value: string | null
): FilterQuery {
  const others = query.rules.filter(
    (rule) => !(isFilterRule(rule) && rule.path[0] === fieldId)
  );
  const rules = value
    ? [
        ...others,
        createFilterRule({
          id: `view-${fieldId}`,
          operator: "is",
          path: [fieldId],
          value,
        }),
      ]
    : others;
  return createFilterQuery(rules, query.combinator, query.id);
}

const isAttentionRule = (
  node: FilterQuery["rules"][number],
  view: DataTableAttentionView
) =>
  isFilterRule(node) &&
  node.path[0] === view.rule.path &&
  node.operator === "is" &&
  !node.negated &&
  node.value === view.rule.value;

/** Whether the query holds the attention view's rule at the top level. */
export function isAttentionViewActive(
  query: FilterQuery,
  view: DataTableAttentionView
): boolean {
  return query.rules.some((node) => isAttentionRule(node, view));
}

/** The attention views worth showing: a non-zero count, or the active one. */
export function visibleAttentionViews(
  query: FilterQuery,
  views: readonly DataTableAttentionView[]
): DataTableAttentionView[] {
  return views.filter(
    (view) => view.count > 0 || isAttentionViewActive(query, view)
  );
}

/**
 * The selected tab: the view field's value, else the first active attention
 * view, else All.
 */
export function activeDataTableTab(
  query: FilterQuery,
  fieldId: string,
  attentionViews: readonly DataTableAttentionView[] = []
): string {
  const view = readSelectEquality(query, fieldId);
  if (view) {
    return view;
  }
  const attention = attentionViews.find((item) =>
    isAttentionViewActive(query, item)
  );
  return attention ? `${ATTENTION_PREFIX}${attention.id}` : ALL_VIEW;
}

/**
 * The query after picking a tab. An attention view replaces the whole query
 * with its rule, as the toolbar shortcuts it replaced did; a view tab or All
 * drops every attention rule and keeps the other filters.
 */
export function selectDataTableTab(
  query: FilterQuery,
  fieldId: string,
  attentionViews: readonly DataTableAttentionView[],
  tab: string
): FilterQuery {
  if (tab.startsWith(ATTENTION_PREFIX)) {
    const id = tab.slice(ATTENTION_PREFIX.length);
    const view = attentionViews.find((item) => item.id === id);
    if (view) {
      return createFilterQuery([
        createFilterRule({
          id: view.id,
          operator: "is",
          path: [view.rule.path],
          value: view.rule.value,
        }),
      ]);
    }
  }
  const cleared = createFilterQuery(
    query.rules.filter(
      (node) => !attentionViews.some((view) => isAttentionRule(node, view))
    ),
    query.combinator,
    query.id
  );
  return selectDataTableView(
    cleared,
    fieldId,
    tab === ALL_VIEW || tab.startsWith(ATTENTION_PREFIX) ? null : tab
  );
}

export function DataTableViewTabs({
  attentionViews = [],
  fieldId,
  onQueryChange,
  query,
  total,
  views,
}: {
  attentionViews?: readonly DataTableAttentionView[];
  fieldId: string;
  onQueryChange: (query: FilterQuery) => void;
  query: FilterQuery;
  total: number;
  views: DataTableView[];
}) {
  const shownAttention = visibleAttentionViews(query, attentionViews);
  const active = activeDataTableTab(query, fieldId, shownAttention);
  const handleChange = useEventCallback((value: unknown) => {
    onQueryChange(
      selectDataTableTab(query, fieldId, attentionViews, String(value))
    );
  });

  return (
    // Scrolls sideways on phones. The 2px of bottom padding, taken back by
    // the margin, keeps the active underline from being clipped.
    <Tabs
      className="scroll-fade-x no-scrollbar -mb-0.5 overflow-x-auto overscroll-x-contain pb-0.5"
      onValueChange={handleChange}
      value={active}
    >
      <TabsList
        aria-label="Views"
        className="h-8 gap-3 px-0 pointer-coarse:h-10"
        variant="line"
      >
        <ViewTab count={total} label="All" value={ALL_VIEW} />
        {views.map((view) => (
          <ViewTab
            count={view.count}
            key={view.value}
            label={view.label}
            value={view.value}
          />
        ))}
        {shownAttention.length > 0 ? (
          <span
            aria-hidden="true"
            className="bg-border h-4 w-px flex-none"
            data-testid="attention-views-divider"
          />
        ) : null}
        {shownAttention.map((view) => (
          <ViewTab
            attention
            count={view.count}
            key={view.id}
            label={view.label}
            value={`${ATTENTION_PREFIX}${view.id}`}
          />
        ))}
      </TabsList>
    </Tabs>
  );
}

function ViewTab({
  attention = false,
  count,
  label,
  value,
}: {
  attention?: boolean;
  count: number;
  label: string;
  value: string;
}) {
  return (
    // Phones drop empty views (unless selected) so the ones with rows fit.
    <TabsTrigger
      aria-label={`${label} ${count}`}
      className="flex-none px-0 max-md:data-empty:not-data-active:hidden"
      data-empty={count === 0 || undefined}
      value={value}
    >
      {label}
      <span
        className={
          attention && count > 0
            ? "text-warning-foreground font-mono text-xs tabular-nums"
            : "text-muted-foreground font-mono text-xs tabular-nums"
        }
      >
        {count}
      </span>
    </TabsTrigger>
  );
}
