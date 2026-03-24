import type {
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { type SetStateAction, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { resolveUpdater } from "@/lib/table-utils";

interface UseTableStateDefaultState {
  columnOrder?: ColumnOrderState;
  columnPinning?: ColumnPinningState;
  columnSizing?: ColumnSizingState;
  columnVisibility?: VisibilityState;
  pagination?: PaginationState;
  rowSelection?: Record<string, boolean>;
  sorting?: SortingState;
}

interface UseTableStateQueryKeys {
  pageIndex?: string;
  pageSize?: string;
  sorting?: string;
}

interface UseTableStateOptions {
  storageKey?: string;
}

export function useTableState(
  defaultState: UseTableStateDefaultState = {},
  queryKeys: UseTableStateQueryKeys = {},
  options: UseTableStateOptions = {}
) {
  const parseSortingParam = (value: string): SortingState => {
    if (!value) {
      return [];
    }

    const parsedSorting: SortingState = [];
    const sortingEntries = value.split(",");

    for (const entry of sortingEntries) {
      const normalizedEntry = entry.trim();

      if (!normalizedEntry) {
        continue;
      }

      const separatorIndex = normalizedEntry.lastIndexOf(".");
      if (separatorIndex <= 0 || separatorIndex >= normalizedEntry.length - 1) {
        continue;
      }

      const id = normalizedEntry.slice(0, separatorIndex);
      const direction = normalizedEntry.slice(separatorIndex + 1);

      if (!id) {
        continue;
      }

      if (direction === "asc") {
        parsedSorting.push({ id, desc: false });
        continue;
      }

      if (direction === "desc") {
        parsedSorting.push({ id, desc: true });
      }
    }

    return parsedSorting;
  };

  const serializeSortingState = (value: SortingState): string => {
    if (!value.length) {
      return "";
    }

    return value
      .filter(
        (sortValue) => typeof sortValue.id === "string" && sortValue.id.length
      )
      .map((sortValue) => `${sortValue.id}.${sortValue.desc ? "desc" : "asc"}`)
      .join(",");
  };

  const [persistedState, setPersistedState] = useLocalStorage(
    options.storageKey,
    {
      columnOrder: defaultState.columnOrder ?? [],
      columnPinning: defaultState.columnPinning ?? {},
      columnSizing: defaultState.columnSizing ?? {},
      columnVisibility: defaultState.columnVisibility ?? {},
    }
  );
  const columnOrder = (() => {
    const persisted = persistedState.columnOrder;
    const defaults = defaultState.columnOrder ?? [];
    if (!persisted.length) {
      return defaults;
    }
    const persistedSet = new Set(persisted);
    const missing = defaults.filter((id) => !persistedSet.has(id));
    if (!missing.length) {
      return persisted;
    }
    // Insert new columns before the last persisted column (usually "actions")
    return [...persisted.slice(0, -1), ...missing, ...persisted.slice(-1)];
  })();
  const { columnPinning, columnSizing, columnVisibility } = persistedState;
  const [rowSelection, setRowSelection] = useState(
    defaultState.rowSelection ?? {}
  );
  const [pagination, setPagination] = useQueryStates(
    {
      pageIndex: parseAsIndex.withDefault(
        defaultState.pagination?.pageIndex ?? 0
      ),
      pageSize: parseAsInteger.withDefault(
        defaultState.pagination?.pageSize ?? 15
      ),
    },
    {
      urlKeys: {
        pageIndex: queryKeys.pageIndex ?? "page",
        pageSize: queryKeys.pageSize ?? "size",
      },
    }
  );
  const [sortingParam, setSortingParam] = useQueryState(
    queryKeys.sorting ?? "sort",
    parseAsString.withDefault(serializeSortingState(defaultState.sorting ?? []))
  );
  const sorting = parseSortingParam(sortingParam);

  const setColumnOrder = (updater: SetStateAction<ColumnOrderState>) => {
    setPersistedState((previous) => ({
      ...previous,
      columnOrder: resolveUpdater(updater, previous.columnOrder),
    }));
  };

  const setColumnPinning = (updater: SetStateAction<ColumnPinningState>) => {
    setPersistedState((previous) => ({
      ...previous,
      columnPinning: resolveUpdater(updater, previous.columnPinning),
    }));
  };

  const setColumnSizing = (updater: SetStateAction<ColumnSizingState>) => {
    setPersistedState((previous) => ({
      ...previous,
      columnSizing: resolveUpdater(updater, previous.columnSizing),
    }));
  };

  const setColumnVisibility = (updater: SetStateAction<VisibilityState>) => {
    setPersistedState((previous) => ({
      ...previous,
      columnVisibility: resolveUpdater(updater, previous.columnVisibility),
    }));
  };

  const setSorting = (updater: SetStateAction<SortingState>) => {
    const nextSorting = resolveUpdater(updater, sorting);
    const nextSortingParam = serializeSortingState(nextSorting);

    setSortingParam(nextSortingParam || null);
  };

  return {
    state: {
      columnOrder,
      columnPinning,
      columnSizing,
      columnVisibility,
      rowSelection,
      pagination,
      sorting,
    },
    actions: {
      setColumnOrder,
      setColumnPinning,
      setColumnSizing,
      setColumnVisibility,
      setRowSelection,
      setPagination,
      setSorting,
    },
  };
}
