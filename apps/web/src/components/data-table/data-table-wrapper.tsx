import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Cancel01Icon,
  FilterHorizontalIcon,
  GroupItemsIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid";
import { DataGridColumnVisibility } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-visibility";
import {
  type DataGridColumnDef,
  type DataGridFeatures,
  type DataGridRow,
  type DataGridTableInstance,
  useDataGridTable,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { DataGridPagination } from "@pi-dash/design-system/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table";
import { DataGridTableDnd } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table-dnd";
import { Filters } from "@pi-dash/design-system/components/reui/filters/filters";
import type {
  FilterField,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@pi-dash/design-system/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@pi-dash/design-system/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@pi-dash/design-system/components/ui/input-group";
import {
  ScrollArea,
  ScrollBar,
} from "@pi-dash/design-system/components/ui/scroll-area";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type {
  ColumnPinningState,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  FilterFn,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import debounce from "lodash/debounce";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import {
  compileFilterQuery,
  type FilterValueGetter,
} from "@/components/data-table/compile-filter-query";
import {
  DataTableViewTabs,
  getDataTableViews,
} from "@/components/data-table/data-table-view-tabs";
import { DATA_TABLE_FILTER_EDITORS } from "@/components/data-table/filter-date-editor";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { useTableState } from "@/hooks/use-table-state";
import {
  mergeColumnOrder,
  resolveColumnDefId,
  resolveUpdater,
} from "@/lib/table-utils";

import {
  applyPreferredSizingChange,
  deriveColumnFill,
  TABLE_COLUMN_DEFAULTS,
} from "./column-fill";
import { applyColumnKinds } from "./column-kinds";
import {
  applyCompactVisibilityChange,
  COMPACT_BREAKPOINT,
  findExistingExpandColumnId,
  insertExpandColumn,
  overlayCompactVisibility,
  partitionCompactColumns,
  stripCompactExpandId,
  toCompactColumnRefs,
  visibleCollapsedIds,
  visibleStackedPrimaryIds,
  withCompactExpandOrder,
  withCompactExpandPinning,
} from "./compact-columns";
import {
  CompactTableProvider,
  createCompactExpandColumn,
  stackPrimaryColumn,
  wrapExpandColumnWithCompactDetails,
} from "./data-table-compact";
import {
  DataTableGroupHeader,
  type DataTableGroupBy,
  groupRowId,
  mergeGroupExpanded,
  orderByGroup,
  splitGroupExpanded,
  useDataTableGroupBy,
} from "./data-table-group";
import { getDataTableClassNames } from "./data-table-layout";
import { DataTableTotals } from "./data-table-totals";
import { useAutoPageSize } from "./use-auto-page-size";
import { getSizingColumns, useTableViewportWidth } from "./use-column-fill";

export interface DataTableFilterConfig<TData extends object> {
  /** When false, persist and render the query but do not filter `data` locally. */
  applyLocally?: boolean;
  fields: FilterField[];
  getValue?: FilterValueGetter<TData>;
  queryKey?: string;
  /** A select field shown as view tabs with row counts above the toolbar. */
  viewField?: string;
}

export interface DataTableWrapperProps<TData extends object> {
  columns: DataGridColumnDef<TData>[];
  /** Collapse secondary columns on narrow tables. Injects an expand panel unless `onRowClick` already opens details. */
  compactOnMobile?: boolean;
  data: TData[];
  defaultColumnPinning?: ColumnPinningState;
  defaultColumnVisibility?: ColumnVisibilityState;
  defaultPageSize?: number;
  emptyMessage?: string;
  enableRowSelection?: boolean;
  filter?: DataTableFilterConfig<TData>;
  getRowCanExpand?: (row: DataGridRow<TData>) => boolean;
  getRowId: (row: TData) => string;
  /** Offers a "Group by" toggle that splits rows under collapsible group headers. */
  groupBy?: DataTableGroupBy<TData>;
  isLoading?: boolean;
  /** Server-side pagination: delegates page slicing to the caller */
  manualPagination?: boolean;
  onFilteredDataChange?: (filteredData: TData[]) => void;
  onRowClick?: (row: TData) => void;
  paginationSizes?: number[];
  /** Total row count for server-side pagination */
  rowCount?: number;
  searchFn: (row: TData, searchQuery: string) => boolean;
  searchPlaceholder?: string;
  searchQueryKey?: string;
  storageKey: string;
  tableLayout?: {
    columnsMovable?: boolean;
    columnsResizable?: boolean;
    columnsVisibility?: boolean;
    columnsDraggable?: boolean;
    columnsPinnable?: boolean;
    dense?: boolean;
  };
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
  /** Column ids summed in a totals row under the grid, over every filtered row. */
  totals?: string[];
}

/** `size` value meaning "fit the window"; any size picked in the menu replaces it. */
const AUTO_PAGE_SIZE = 0;

const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  end: ["actions"],
  start: ["select"],
};

export function DataTableFiltersBar({
  allowAdvanced = true,
  fields,
  onQueryChange,
  query,
}: {
  /** When false, hide chip kebab "Convert to advanced". Server-paginated chips only honor `is`. */
  allowAdvanced?: boolean;
  fields: FilterField[];
  onQueryChange: (query: FilterQuery) => void;
  query: FilterQuery;
}) {
  const [variant, setVariant] = useState<"advanced" | "basic">("basic");
  const handleQueryChange = useEventCallback((next: FilterQuery) => {
    onQueryChange(next);
  });
  const handleConvertToAdvanced = useEventCallback(() => {
    setVariant("advanced");
  });

  return (
    <Filters
      editors={DATA_TABLE_FILTER_EDITORS}
      fields={fields}
      onConvertToAdvanced={allowAdvanced ? handleConvertToAdvanced : undefined}
      onQueryChange={handleQueryChange}
      query={query}
      showClear
      size="sm"
      variant={allowAdvanced ? variant : "basic"}
    />
  );
}

export function DataTableWrapper<TData extends object>(
  props: DataTableWrapperProps<TData>
) {
  if (props.filter) {
    return <DataTableWrapperWithFilters {...props} filter={props.filter} />;
  }
  return <DataTableWrapperBase {...props} />;
}

function DataTableWrapperWithFilters<TData extends object>({
  data,
  filter,
  toolbarFilters,
  ...rest
}: DataTableWrapperProps<TData> & { filter: DataTableFilterConfig<TData> }) {
  const {
    applyLocally: applyLocallyOption,
    fields,
    getValue,
    queryKey,
    viewField,
  } = filter;
  const { query, setQuery } = useDataTableFilters(queryKey);
  const applyLocally = applyLocallyOption !== false && Boolean(getValue);
  const matches = useMemo(
    () =>
      applyLocally && getValue ? compileFilterQuery(query, getValue) : null,
    [applyLocally, getValue, query]
  );
  const filteredData = useMemo(
    () => (matches ? data.filter(matches) : data),
    [data, matches]
  );
  const handleQueryChange = useEventCallback((next: FilterQuery) => {
    setQuery(next);
  });
  const viewFieldConfig = viewField
    ? fields.find((field) => field.id === viewField)
    : undefined;
  const views = useMemo(
    () =>
      viewFieldConfig && getValue
        ? getDataTableViews({ data, field: viewFieldConfig, getValue })
        : null,
    [data, getValue, viewFieldConfig]
  );

  return (
    <DataTableWrapperBase
      {...rest}
      data={filteredData}
      pageResetKey={JSON.stringify(query)}
      toolbarTop={
        viewField && views ? (
          <DataTableViewTabs
            fieldId={viewField}
            onQueryChange={handleQueryChange}
            query={query}
            total={data.length}
            views={views}
          />
        ) : null
      }
      toolbarFilters={
        <>
          <DataTableFiltersBar
            allowAdvanced={applyLocally}
            fields={fields}
            onQueryChange={handleQueryChange}
            query={query}
          />
          {toolbarFilters}
        </>
      }
    />
  );
}

function DataTableWrapperBase<TData extends object>({
  compactOnMobile = false,
  storageKey,
  columns,
  data,
  defaultColumnPinning = DEFAULT_COLUMN_PINNING,
  defaultColumnVisibility,
  defaultPageSize = 10,
  enableRowSelection = false,
  emptyMessage = "No results found.",
  getRowCanExpand,
  getRowId,
  groupBy,
  isLoading,
  manualPagination,
  onFilteredDataChange,
  onRowClick,
  pageResetKey,
  paginationSizes = [10, 20, 50],
  rowCount,
  searchFn,
  searchPlaceholder = "Search...",
  searchQueryKey = "search",
  tableLayout,
  toolbarActions,
  toolbarFilters,
  toolbarTop,
  totals,
}: DataTableWrapperProps<TData> & {
  pageResetKey?: string;
  toolbarTop?: ReactNode;
}) {
  // Server-paged callers read `size` from the URL themselves, so they keep a fixed size.
  const autoPageSize = !manualPagination;
  const initialColumnOrder = columns
    .map(resolveColumnDefId)
    .filter((id): id is string => typeof id === "string");

  const {
    state: {
      columnOrder,
      columnPinning,
      columnSizing,
      columnVisibility,
      pagination,
      rowSelection,
      sorting,
    },
    actions: {
      setColumnOrder,
      setColumnPinning,
      setColumnSizing,
      setColumnVisibility,
      setPagination,
      setRowSelection,
      setSorting,
    },
  } = useTableState(
    {
      columnOrder: initialColumnOrder,
      columnPinning: defaultColumnPinning,
      columnSizing: {},
      columnVisibility: defaultColumnVisibility,
      pagination: {
        pageIndex: 0,
        pageSize: autoPageSize ? AUTO_PAGE_SIZE : defaultPageSize,
      },
      rowSelection: {},
      sorting: [],
    },
    {
      pageIndex: "page",
      pageSize: "size",
    },
    {
      storageKey,
    }
  );

  const { scrollAreaRef, viewportWidth } = useTableViewportWidth(
    compactOnMobile || tableLayout?.columnsResizable === true
  );
  const isAutoSize = autoPageSize && pagination.pageSize === AUTO_PAGE_SIZE;
  const fittedPageSize = useAutoPageSize({
    areaRef: scrollAreaRef,
    enabled: isAutoSize,
    hasRows: data.length > 0,
  });
  const tablePagination = isAutoSize
    ? { ...pagination, pageSize: fittedPageSize ?? defaultPageSize }
    : pagination;
  const tablePaginationSizes = isAutoSize
    ? [...new Set([...paginationSizes, tablePagination.pageSize])].sort(
        (a, b) => a - b
      )
    : paginationSizes;
  const compactPartition = useMemo(
    () => partitionCompactColumns(toCompactColumnRefs(columns)),
    [columns]
  );
  const isCompact =
    compactOnMobile && viewportWidth > 0 && viewportWidth < COMPACT_BREAKPOINT;
  const collapsedForPanel = useMemo(
    () =>
      isCompact
        ? visibleCollapsedIds(compactPartition.collapsedIds, columnVisibility)
        : [],
    [columnVisibility, compactPartition.collapsedIds, isCompact]
  );
  const stackedPrimaryIds = useMemo(
    () =>
      isCompact
        ? visibleStackedPrimaryIds(
            compactPartition.stackedPrimaryIds,
            columnVisibility
          )
        : [],
    [columnVisibility, compactPartition.stackedPrimaryIds, isCompact]
  );
  const trailingIds = useMemo(
    () =>
      isCompact
        ? visibleStackedPrimaryIds(
            compactPartition.trailingIds,
            columnVisibility
          )
        : [],
    [columnVisibility, compactPartition.trailingIds, isCompact]
  );
  const showExpand = isCompact && collapsedForPanel.length > 0 && !onRowClick;
  const existingExpandColumnId = useMemo(
    () => findExistingExpandColumnId(columns),
    [columns]
  );
  const reuseExistingExpand = showExpand && Boolean(existingExpandColumnId);
  const existingExpandedContent = useMemo(
    () =>
      columns.find((column) => column.meta?.expandedContent)?.meta
        ?.expandedContent,
    [columns]
  );
  const kindColumns = useMemo(() => applyColumnKinds(columns), [columns]);
  const tableColumns = useMemo(() => {
    if (!isCompact) {
      return kindColumns;
    }
    const withStackedPrimary =
      compactPartition.firstPrimaryId &&
      (stackedPrimaryIds.length > 0 || trailingIds.length > 0)
        ? kindColumns.map((column) =>
            resolveColumnDefId(column) === compactPartition.firstPrimaryId
              ? stackPrimaryColumn(column, stackedPrimaryIds, trailingIds)
              : column
          )
        : kindColumns;
    if (!showExpand) {
      return withStackedPrimary;
    }
    if (existingExpandColumnId) {
      return withStackedPrimary.map((column) =>
        resolveColumnDefId(column) === existingExpandColumnId
          ? wrapExpandColumnWithCompactDetails(
              column,
              collapsedForPanel,
              getRowId
            )
          : column
      );
    }
    return insertExpandColumn(
      withStackedPrimary,
      createCompactExpandColumn({
        collapsedColumnIds: collapsedForPanel,
        existingExpandedContent,
        getRowId,
      })
    );
  }, [
    collapsedForPanel,
    kindColumns,
    compactPartition.firstPrimaryId,
    existingExpandColumnId,
    existingExpandedContent,
    getRowId,
    isCompact,
    showExpand,
    stackedPrimaryIds,
    trailingIds,
  ]);
  const tableColumnOrder = useMemo(
    () =>
      showExpand && !reuseExistingExpand
        ? withCompactExpandOrder(
            columnOrder,
            tableColumns.some(
              (column) => resolveColumnDefId(column) === "select"
            )
          )
        : columnOrder,
    [columnOrder, reuseExistingExpand, showExpand, tableColumns]
  );
  const tableColumnPinning = useMemo(
    () =>
      showExpand && !reuseExistingExpand
        ? withCompactExpandPinning(columnPinning)
        : columnPinning,
    [columnPinning, reuseExistingExpand, showExpand]
  );
  const [groupColumnId, setGroupColumnId] = useDataTableGroupBy();
  const activeGroupBy =
    groupBy && groupColumnId === groupBy.columnId ? groupBy : undefined;
  const tableColumnVisibility = useMemo(() => {
    const visibility = isCompact
      ? overlayCompactVisibility(columnVisibility, compactPartition, showExpand)
      : columnVisibility;
    // The group header shows the grouped value, and TanStack leaves that
    // column's cells empty in grouped rows, so hide it while grouped.
    return activeGroupBy
      ? { ...visibility, [activeGroupBy.columnId]: false }
      : visibility;
  }, [
    activeGroupBy,
    columnVisibility,
    compactPartition,
    isCompact,
    showExpand,
  ]);
  const sizingColumns = useMemo(
    () => getSizingColumns(tableColumns),
    [tableColumns]
  );
  const fill = useMemo(
    () =>
      deriveColumnFill({
        columns: sizingColumns,
        preferred: columnSizing,
        order: tableColumnOrder,
        visibility: tableColumnVisibility,
        pinning: tableColumnPinning,
        viewportWidth,
      }),
    [
      sizingColumns,
      columnSizing,
      tableColumnOrder,
      tableColumnVisibility,
      tableColumnPinning,
      viewportWidth,
    ]
  );
  const handleColumnSizingChange = useEventCallback(
    (updater: Updater<ColumnSizingState>) => {
      if (!tableLayout?.columnsResizable) {
        setColumnSizing(updater);
        return;
      }
      const preferred = applyPreferredSizingChange(columnSizing, fill, updater);
      if (preferred !== columnSizing) setColumnSizing(preferred);
    }
  );
  const handleColumnVisibilityChange = useEventCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      const nextTableVisibility = resolveUpdater(
        updater,
        tableColumnVisibility
      );
      if (isCompact) {
        // Grouping hides the same column in both states, so it is no change.
        setColumnVisibility(
          applyCompactVisibilityChange(
            columnVisibility,
            tableColumnVisibility,
            nextTableVisibility,
            compactPartition
          )
        );
        return;
      }
      if (!activeGroupBy) {
        setColumnVisibility(nextTableVisibility);
        return;
      }
      // Keep the saved choice for the grouped column; grouping hides it.
      const { [activeGroupBy.columnId]: _grouped, ...rest } =
        nextTableVisibility;
      const saved = columnVisibility?.[activeGroupBy.columnId];
      setColumnVisibility(
        saved === undefined
          ? rest
          : { ...rest, [activeGroupBy.columnId]: saved }
      );
    }
  );
  const handleColumnOrderChange = useEventCallback(
    (updater: Updater<typeof columnOrder>) => {
      const next = resolveUpdater(updater, tableColumnOrder);
      setColumnOrder(stripCompactExpandId(next));
    }
  );
  const handleColumnPinningChange = useEventCallback(
    (updater: Updater<ColumnPinningState>) => {
      const next = resolveUpdater(updater, tableColumnPinning);
      setColumnPinning({
        end: next.end,
        start: stripCompactExpandId(next.start ?? []),
      });
    }
  );

  const [searchQuery, setSearchQuery] = useQueryState(
    searchQueryKey,
    parseAsString.withDefault("")
  );

  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const groupedData = useMemo(
    () =>
      activeGroupBy
        ? orderByGroup(data, activeGroupBy.getValue, activeGroupBy.order)
        : data,
    [activeGroupBy, data]
  );
  const groupIds = useMemo(
    () =>
      activeGroupBy
        ? [
            ...new Set(
              groupedData.map((row) =>
                groupRowId(activeGroupBy.columnId, activeGroupBy.getValue(row))
              )
            ),
          ]
        : [],
    [activeGroupBy, groupedData]
  );
  const tableExpanded = useMemo(
    () =>
      activeGroupBy
        ? mergeGroupExpanded(expanded, groupIds, collapsedGroups)
        : expanded,
    [activeGroupBy, collapsedGroups, expanded, groupIds]
  );
  const handleExpandedChange = useEventCallback(
    (updater: Updater<ExpandedState>) => {
      const next = resolveUpdater(updater, tableExpanded);
      if (!activeGroupBy) {
        setExpanded(next);
        return;
      }
      const { collapsed, leaf } = splitGroupExpanded(next, groupIds);
      setCollapsedGroups(collapsed);
      setExpanded(leaf);
    }
  );
  const handleGroupToggle = useEventCallback(() => {
    if (!groupBy) {
      return;
    }
    resetPage();
    setCollapsedGroups(new Set());
    setGroupColumnId(activeGroupBy ? null : groupBy.columnId);
  });
  const renderGroupRow = useEventCallback((row: DataGridRow<TData>) =>
    activeGroupBy ? (
      <DataTableGroupHeader
        groupBy={activeGroupBy}
        row={row}
        table={table}
        totals={totals}
      />
    ) : null
  );
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const resetPage = () => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  };

  const debouncedSyncRef = useRef(
    debounce((value: string) => {
      if (manualPagination) {
        resetPage();
      }
      setSearchQuery(value);
    }, 300)
  );

  useEffect(
    () => () => {
      debouncedSyncRef.current.cancel();
    },
    []
  );

  // Sync local state when URL changes externally (browser back/forward)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (pageResetKey === undefined) {
      return;
    }
    setPagination((current) =>
      current.pageIndex === 0
        ? current
        : {
            ...current,
            pageIndex: 0,
          }
    );
  }, [pageResetKey, setPagination]);

  useEffect(() => {
    if (!isCompact) {
      setExpanded({});
    }
  }, [isCompact]);

  const globalFilterFn: FilterFn<DataGridFeatures, TData> = (
    row,
    _columnId,
    value
  ) => searchFn(row.original, String(value));

  const onPaginationChange = (updater: Updater<PaginationState>) => {
    const nextPagination = resolveUpdater(updater, tablePagination);
    // Keep the fitted size out of the URL until someone picks a size.
    const keepAuto =
      isAutoSize && nextPagination.pageSize === tablePagination.pageSize;
    setPagination({
      pageIndex: nextPagination.pageIndex,
      pageSize: keepAuto ? AUTO_PAGE_SIZE : nextPagination.pageSize,
    });
  };

  const onSortingChange = (updater: Updater<SortingState>) => {
    const nextSorting = resolveUpdater(updater, sorting);
    resetPage();
    setSorting(nextSorting);
  };

  const table = useDataGridTable(
    {
      autoResetExpanded: false,
      autoResetPageIndex: false,
      columnResizeMode: "onChange",
      defaultColumn: TABLE_COLUMN_DEFAULTS,
      columns: tableColumns,
      data: groupedData,
      enableRowSelection:
        enableRowSelection && activeGroupBy
          ? (row: DataGridRow<TData>) => !row.getIsGrouped()
          : enableRowSelection,
      getRowId,
      globalFilterFn,
      manualPagination,
      // Grouped pages hold group headers and their rows, not whole groups.
      groupedColumnMode: false,
      paginateExpandedRows: Boolean(activeGroupBy),
      onColumnOrderChange: handleColumnOrderChange,
      onColumnPinningChange: handleColumnPinningChange,
      onColumnSizingChange: handleColumnSizingChange,
      onColumnVisibilityChange: handleColumnVisibilityChange,
      onExpandedChange: handleExpandedChange,
      onPaginationChange,
      onRowSelectionChange: setRowSelection,
      onSortingChange,
      state: {
        columnOrder: tableColumnOrder,
        columnPinning: tableColumnPinning,
        columnSizing: fill.effective,
        columnVisibility: tableColumnVisibility,
        expanded: tableExpanded,
        globalFilter: localSearch,
        grouping: activeGroupBy ? [activeGroupBy.columnId] : [],
        pagination: tablePagination,
        rowSelection,
        sorting,
      },
      ...(rowCount !== undefined && { rowCount }),
      ...((showExpand || getRowCanExpand) && {
        getRowCanExpand: (row: DataGridRow<TData>) =>
          showExpand || Boolean(getRowCanExpand?.(row)),
      }),
    },
    () => null
  ) as unknown as DataGridTableInstance<TData>;

  const handleColumnDragEnd = useEventCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const activeColumnId = String(active.id);
    const overColumnId = String(over.id);
    const activeColumn = table.getColumn(activeColumnId);
    const overColumn = table.getColumn(overColumnId);

    if (activeColumn?.getIsPinned() || overColumn?.getIsPinned()) {
      return;
    }

    const visibleColumnIds = table
      .getVisibleLeafColumns()
      .map((column) => column.id);
    const orderedColumnIds = mergeColumnOrder(
      tableColumnOrder,
      visibleColumnIds
    );
    const oldIndex = orderedColumnIds.indexOf(activeColumnId);
    const newIndex = orderedColumnIds.indexOf(overColumnId);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    setColumnOrder(
      stripCompactExpandId(arrayMove(orderedColumnIds, oldIndex, newIndex))
    );
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const filteredData = filteredRows.map((row) => row.original);
  const displayCount =
    manualPagination && rowCount !== undefined ? rowCount : filteredRows.length;
  const stableOnChange0 = useEventCallback(
    (event: { target: { value: string } }) => {
      const { value } = event.target;
      setLocalSearch(value);
      if (!manualPagination) {
        resetPage();
      }
      debouncedSyncRef.current(value);
    }
  );
  const stableOnClick1 = useEventCallback(() => {
    setLocalSearch("");
    debouncedSyncRef.current.cancel();
    resetPage();
    setSearchQuery("");
  });

  useEffect(() => {
    onFilteredDataChange?.(filteredData);
  }, [onFilteredDataChange, filteredData]);

  const resolvedTableLayout = useMemo(
    () => ({
      cellBorder: true,
      ...tableLayout,
      ...(isCompact && { columnsDraggable: false, columnsMovable: false }),
    }),
    [isCompact, tableLayout]
  );

  return (
    <AppErrorBoundary level="section">
      <div aria-busy={isLoading}>
        <span aria-atomic="true" aria-live="polite" className="sr-only">
          {isLoading ? "Loading…" : `${displayCount} results`}
        </span>
        <CompactTableProvider compact={isCompact}>
          <DataGrid
            emptyMessage={emptyMessage}
            isLoading={isLoading}
            onRowClick={onRowClick}
            recordCount={displayCount}
            renderGroupRow={activeGroupBy ? renderGroupRow : undefined}
            table={table}
            tableLayout={resolvedTableLayout}
            tableClassNames={getDataTableClassNames(
              tableLayout?.columnsResizable
            )}
          >
            <Card className="w-full gap-0 py-0!">
              {toolbarTop ? (
                <div className="border-b px-3 pt-1">{toolbarTop}</div>
              ) : null}
              <CardHeader className="block border-b px-3 py-2.5">
                <div className="flex flex-col gap-2 @3xl/card-header:flex-row @3xl/card-header:items-center">
                  <InputGroup className="w-full shrink-0 @3xl/card-header:w-64">
                    <InputGroupAddon align="inline-start">
                      <HugeiconsIcon
                        className="size-4"
                        icon={Search01Icon}
                        strokeWidth={2}
                      />
                    </InputGroupAddon>

                    <InputGroupInput
                      aria-label={searchPlaceholder}
                      onChange={stableOnChange0}
                      placeholder={searchPlaceholder}
                      value={localSearch}
                    />

                    {localSearch ? (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          aria-label="Clear search"
                          onClick={stableOnClick1}
                          size="icon-xs"
                          type="button"
                        >
                          <HugeiconsIcon
                            className="size-3.5"
                            icon={Cancel01Icon}
                            strokeWidth={2}
                          />
                        </InputGroupButton>
                      </InputGroupAddon>
                    ) : null}
                  </InputGroup>
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 @3xl/card-header:flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                      {toolbarFilters}
                    </div>
                    <CardAction className="relative col-auto row-auto flex max-w-full shrink-0 flex-wrap items-center gap-1 self-auto justify-self-auto">
                      <DataGridColumnVisibility
                        table={table}
                        trigger={
                          <Button size="sm" variant="outline">
                            <HugeiconsIcon
                              aria-hidden="true"
                              icon={FilterHorizontalIcon}
                              strokeWidth={2}
                            />
                            Columns
                          </Button>
                        }
                      />
                      {groupBy ? (
                        <Button
                          aria-pressed={Boolean(activeGroupBy)}
                          className="aria-pressed:border-brand/50 aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground aria-pressed:hover:bg-sidebar-accent dark:aria-pressed:border-brand/50 dark:aria-pressed:bg-sidebar-accent dark:aria-pressed:hover:bg-sidebar-accent"
                          onClick={handleGroupToggle}
                          size="sm"
                          variant="outline"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={GroupItemsIcon}
                            strokeWidth={2}
                          />
                          Group by {groupBy.label}
                        </Button>
                      ) : null}
                      {toolbarActions}
                    </CardAction>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-0">
                {!isLoading && filteredRows.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{emptyMessage}</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : null}
                <ScrollArea
                  ref={scrollAreaRef}
                  hidden={!isLoading && filteredRows.length === 0}
                >
                  {!isLoading &&
                  filteredRows.length ===
                    0 ? null : resolvedTableLayout?.columnsDraggable ? (
                    <DataGridTableDnd handleDragEnd={handleColumnDragEnd} />
                  ) : (
                    <DataGridTable />
                  )}
                  {totals?.length && filteredRows.length > 0 && !isLoading ? (
                    <DataTableTotals
                      areaRef={scrollAreaRef}
                      rows={filteredRows}
                      table={table}
                      totals={totals}
                    />
                  ) : null}
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>

              <CardFooter className="bg-transparent! px-3 py-2">
                {!isLoading && displayCount === 0 ? (
                  <span className="text-muted-foreground text-sm">
                    0 of 0 results
                  </span>
                ) : (
                  <DataGridPagination sizes={tablePaginationSizes} />
                )}
              </CardFooter>
            </Card>
          </DataGrid>
        </CompactTableProvider>
      </div>
    </AppErrorBoundary>
  );
}
