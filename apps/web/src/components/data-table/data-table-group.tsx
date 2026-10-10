import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  DataGridRow,
  DataGridTableInstance,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ExpandedState } from "@tanstack/react-table";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";

import { formatINR } from "@/lib/form-schemas";

import { DATA_FONT_CLASS } from "./column-kinds";
import { sumColumns } from "./data-table-totals";

export interface DataTableGroupBy<TData extends object> {
  /** Column whose rows are grouped; its id is what `?group=` holds. */
  columnId: string;
  /** Readable group name for screen readers; defaults to the raw value. */
  formatValue?: (value: string) => string;
  getValue: (row: TData) => string;
  /** Lower-case noun for the toggle, e.g. "status" for "Group by status". */
  label: string;
  /** Group order; values not listed follow in first-seen order. */
  order?: readonly string[];
  renderValue?: (value: string) => ReactNode;
}

/** Reads the grouped column id from the URL, or null when rows are flat. */
export function useDataTableGroupBy(queryKey = "group") {
  return useQueryState(queryKey, parseAsString);
}

/** TanStack builds group row ids as `columnId:value`. */
export function groupRowId(columnId: string, value: string): string {
  return `${columnId}:${value}`;
}

/** Stable-sorts rows so groups appear in `order`, then first-seen order. */
export function orderByGroup<TData>(
  data: readonly TData[],
  getValue: (row: TData) => string,
  order: readonly string[] = []
): TData[] {
  const rank = new Map<string, number>();
  for (const value of order) {
    rank.set(value, rank.size);
  }
  for (const row of data) {
    const value = getValue(row);
    if (!rank.has(value)) {
      rank.set(value, rank.size);
    }
  }
  return data
    .map((row, index) => ({ index, rank: rank.get(getValue(row)) ?? 0, row }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Groups start open, so the table's expanded state is the leaf rows' own
 * expansion plus every group id that has not been collapsed.
 */
export function mergeGroupExpanded(
  leafExpanded: ExpandedState,
  groupIds: readonly string[],
  collapsed: ReadonlySet<string>
): ExpandedState {
  const merged: Record<string, boolean> =
    leafExpanded === true ? {} : { ...leafExpanded };
  for (const id of groupIds) {
    if (!collapsed.has(id)) {
      merged[id] = true;
    }
  }
  return merged;
}

/** Splits a table expanded state back into collapsed groups and leaf rows. */
export function splitGroupExpanded(
  next: ExpandedState,
  groupIds: readonly string[]
): { collapsed: Set<string>; leaf: ExpandedState } {
  if (next === true) {
    return { collapsed: new Set(), leaf: {} };
  }
  const groups = new Set(groupIds);
  const leaf: Record<string, boolean> = {};
  for (const [id, open] of Object.entries(next)) {
    if (!groups.has(id) && open) {
      leaf[id] = true;
    }
  }
  return {
    collapsed: new Set(groupIds.filter((id) => !next[id])),
    leaf,
  };
}

export function DataTableGroupHeader<TData extends object>({
  groupBy,
  row,
  table,
  totals,
}: {
  groupBy: DataTableGroupBy<TData>;
  row: DataGridRow<TData>;
  table: DataGridTableInstance<TData>;
  totals?: readonly string[];
}) {
  const value = String(row.groupingValue ?? "");
  const open = row.getIsExpanded();
  const leafRows = row.getLeafRows();
  const sums = totals?.length ? sumColumns(leafRows, totals) : null;
  const name = groupBy.formatValue?.(value) ?? value;
  const label = groupBy.renderValue?.(value) ?? name;

  return (
    <div className="sticky start-0 flex h-9 w-fit items-center gap-3 px-2">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-3"
        onClick={row.getToggleExpandedHandler()}
        type="button"
      >
        <HugeiconsIcon
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform duration-150 ease-out",
            !open && "-rotate-90"
          )}
          icon={ArrowDown01Icon}
          strokeWidth={2}
        />
        <span className="sr-only">
          {open ? "Collapse" : "Expand"} {name}
        </span>
      </button>
      {label}
      <span className={cn("text-muted-foreground", DATA_FONT_CLASS)}>
        {leafRows.length}
      </span>
      {sums
        ? [...sums].map(([columnId, sum]) => (
            <span className="flex items-baseline gap-1.5" key={columnId}>
              {sums.size > 1 ? (
                <span className="text-muted-foreground text-xs">
                  {table.getColumn(columnId)?.columnDef.meta?.headerTitle}
                </span>
              ) : null}
              <span className={DATA_FONT_CLASS}>{formatINR(sum)}</span>
            </span>
          ))
        : null}
    </div>
  );
}
