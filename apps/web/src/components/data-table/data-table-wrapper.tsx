import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Cancel01Icon,
  FilterHorizontalIcon,
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
  createCompactExpandColumn,
  stackPrimaryColumn,
  wrapExpandColumnWithCompactDetails,
} from "./data-table-compact";
import { getDataTableClassNames } from "./data-table-layout";
import { getSizingColumns, useTableViewportWidth } from "./use-column-fill";

export interface DataTableFilterConfig<TData extends object> {
  /** When false, persist and render the query but do not filter `data` locally. */
  applyLocally?: boolean;
  fields: FilterField[];
  getValue?: FilterValueGetter<TData>;
  queryKey?: string;
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
}

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

  return (
    <DataTableWrapperBase
      {...rest}
      data={filteredData}
      pageResetKey={JSON.stringify(query)}
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
}: DataTableWrapperProps<TData> & { pageResetKey?: string }) {
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
        pageSize: defaultPageSize,
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
  const tableColumns = useMemo(() => {
    if (!isCompact) {
      return columns;
    }
    const withStackedPrimary =
      compactPartition.firstPrimaryId &&
      (stackedPrimaryIds.length > 0 || trailingIds.length > 0)
        ? columns.map((column) =>
            resolveColumnDefId(column) === compactPartition.firstPrimaryId
              ? stackPrimaryColumn(column, stackedPrimaryIds, trailingIds)
              : column
          )
        : columns;
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
    columns,
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
  const tableColumnVisibility = useMemo(
    () =>
      isCompact
        ? overlayCompactVisibility(
            columnVisibility,
            compactPartition,
            showExpand
          )
        : columnVisibility,
    [columnVisibility, compactPartition, isCompact, showExpand]
  );
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
      if (!isCompact) {
        setColumnVisibility(updater);
        return;
      }
      const nextTableVisibility = resolveUpdater(
        updater,
        tableColumnVisibility
      );
      setColumnVisibility(
        applyCompactVisibilityChange(
          columnVisibility,
          tableColumnVisibility,
          nextTableVisibility,
          compactPartition
        )
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
    const nextPagination = resolveUpdater(updater, pagination);
    setPagination(nextPagination);
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
      data,
      enableRowSelection,
      getRowId,
      globalFilterFn,
      manualPagination,
      paginateExpandedRows: false,
      onColumnOrderChange: handleColumnOrderChange,
      onColumnPinningChange: handleColumnPinningChange,
      onColumnSizingChange: handleColumnSizingChange,
      onColumnVisibilityChange: handleColumnVisibilityChange,
      onExpandedChange: setExpanded,
      onPaginationChange,
      onRowSelectionChange: setRowSelection,
      onSortingChange,
      state: {
        columnOrder: tableColumnOrder,
        columnPinning: tableColumnPinning,
        columnSizing: fill.effective,
        columnVisibility: tableColumnVisibility,
        expanded,
        globalFilter: localSearch,
        pagination,
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
    () =>
      isCompact && tableLayout
        ? {
            ...tableLayout,
            columnsDraggable: false,
            columnsMovable: false,
          }
        : tableLayout,
    [isCompact, tableLayout]
  );

  return (
    <AppErrorBoundary level="section">
      <div aria-busy={isLoading}>
        <span aria-atomic="true" aria-live="polite" className="sr-only">
          {isLoading ? "Loading…" : `${displayCount} results`}
        </span>
        <DataGrid
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          onRowClick={onRowClick}
          recordCount={displayCount}
          table={table}
          tableLayout={resolvedTableLayout}
          tableClassNames={getDataTableClassNames(
            tableLayout?.columnsResizable
          )}
        >
          <Card className="w-full gap-3 py-3.5!">
            <CardHeader className="flex flex-col gap-2.5! px-3.5 @lg/card-header:flex-row @lg/card-header:items-center">
              <InputGroup className="w-full shrink-0 @lg/card-header:w-72">
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
              <div className="flex w-full min-w-0 items-center justify-between gap-2 @lg/card-header:flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  {toolbarFilters}
                </div>
                <CardAction className="relative col-auto row-auto flex shrink-0 flex-wrap items-center gap-1 self-auto justify-self-auto">
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
                  {toolbarActions}
                </CardAction>
              </div>
            </CardHeader>

            <CardContent className="border-y px-0">
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
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>

            <CardFooter className="border-none bg-transparent! px-3.5 py-0">
              {!isLoading && displayCount === 0 ? (
                <span className="text-muted-foreground text-sm">
                  0 of 0 results
                </span>
              ) : (
                <DataGridPagination sizes={paginationSizes} />
              )}
            </CardFooter>
          </Card>
        </DataGrid>
      </div>
    </AppErrorBoundary>
  );
}
