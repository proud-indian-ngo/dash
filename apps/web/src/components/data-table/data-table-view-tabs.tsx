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

export interface DataTableView {
  count: number;
  label: string;
  value: string;
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

export function DataTableViewTabs({
  fieldId,
  onQueryChange,
  query,
  total,
  views,
}: {
  fieldId: string;
  onQueryChange: (query: FilterQuery) => void;
  query: FilterQuery;
  total: number;
  views: DataTableView[];
}) {
  const active = readSelectEquality(query, fieldId) ?? ALL_VIEW;
  const handleChange = useEventCallback((value: unknown) => {
    onQueryChange(
      selectDataTableView(
        query,
        fieldId,
        value === ALL_VIEW ? null : String(value)
      )
    );
  });

  return (
    <Tabs onValueChange={handleChange} value={active}>
      <TabsList className="h-8 gap-3 px-0" variant="line">
        <ViewTab count={total} label="All" value={ALL_VIEW} />
        {views.map((view) => (
          <ViewTab
            count={view.count}
            key={view.value}
            label={view.label}
            value={view.value}
          />
        ))}
      </TabsList>
    </Tabs>
  );
}

function ViewTab({
  count,
  label,
  value,
}: {
  count: number;
  label: string;
  value: string;
}) {
  return (
    <TabsTrigger className="flex-none px-0" value={value}>
      {label}
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {count}
      </span>
    </TabsTrigger>
  );
}
