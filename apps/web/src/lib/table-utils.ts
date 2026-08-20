import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { SetStateAction } from "react";

export const resolveUpdater = <T>(
  updater: SetStateAction<T>,
  previous: T
): T =>
  typeof updater === "function"
    ? (updater as (prev: T) => T)(previous)
    : updater;

export function resolveColumnDefId<TData extends object>(
  column: DataGridColumnDef<TData>
): string | undefined {
  if (typeof column.id === "string") {
    return column.id;
  }
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }
  return undefined;
}

export function mergeColumnOrder(
  columnOrder: readonly string[],
  visibleColumnIds: readonly string[]
): string[] {
  if (visibleColumnIds.length === 0) {
    return [...columnOrder];
  }
  if (columnOrder.length === 0) {
    return [...visibleColumnIds];
  }

  const visibleSet = new Set(visibleColumnIds);
  const ordered = columnOrder.filter((id) => visibleSet.has(id));
  const orderedSet = new Set(ordered);
  const missing = visibleColumnIds.filter((id) => !orderedSet.has(id));
  return [...ordered, ...missing];
}
