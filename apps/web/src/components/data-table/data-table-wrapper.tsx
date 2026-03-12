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
import { DataGridPagination } from "@pi-dash/design-system/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table";
import { DataGridTableDnd } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table-dnd";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@pi-dash/design-system/components/ui/card";
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
import type {
  ColumnDef,
  ColumnPinningState,
  ExpandedState,
  FilterFn,
  PaginationState,
  Row,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { useTableState } from "@/hooks/use-table-state";
import { resolveUpdater } from "@/lib/table-utils";

export interface DataTableWrapperProps<TData extends object> {
  columns: ColumnDef<TData>[];
  data: TData[];
  defaultColumnPinning?: ColumnPinningState;
  defaultColumnVisibility?: VisibilityState;
  defaultPageSize?: number;
  emptyMessage?: string;
  enableRowSelection?: boolean;
  getRowCanExpand?: (row: Row<TData>) => boolean;
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  onFilteredDataChange?: (filteredData: TData[]) => void;
  paginationSizes?: number[];
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
}

const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  left: ["select"],
  right: ["actions"],
};

export function DataTableWrapper<TData extends object>({
  storageKey,
  columns,
  data,
  defaultColumnPinning,
  defaultColumnVisibility,
  defaultPageSize = 10,
  enableRowSelection = false,
  emptyMessage = "No results found.",
  getRowCanExpand,
  getRowId,
  isLoading,
  onFilteredDataChange,
  paginationSizes = [10, 20, 50],
  searchFn,
  searchPlaceholder = "Search...",
  searchQueryKey = "search",
  tableLayout,
  toolbarActions,
}: DataTableWrapperProps<TData>) {
  const initialColumnOrder = useMemo(
    () =>
      columns
        .map((column) => column.id)
        .filter((id): id is string => typeof id === "string"),
    [columns]
  );

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
      columnPinning: defaultColumnPinning ?? DEFAULT_COLUMN_PINNING,
      columnSizing: {},
      columnVisibility: defaultColumnVisibility ?? {},
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

  const [searchQuery, setSearchQuery] = useQueryState(
    searchQueryKey,
    parseAsString.withDefault("")
  );

  const [expanded, setExpanded] = useState<ExpandedState>({});

  const resetPage = useCallback(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  }, [setPagination]);

  const globalFilterFn = useCallback<FilterFn<TData>>(
    (row, _columnId, value) => searchFn(row.original, String(value ?? "")),
    [searchFn]
  );

  const onGlobalFilterChange = useCallback(
    (updater: Updater<unknown>) => {
      const nextGlobalFilter = String(
        resolveUpdater(updater, searchQuery) ?? ""
      );
      resetPage();
      setSearchQuery(nextGlobalFilter);
    },
    [resetPage, searchQuery, setSearchQuery]
  );

  const onPaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const nextPagination = resolveUpdater(updater, pagination);
      setPagination(nextPagination);
    },
    [pagination, setPagination]
  );

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const nextSorting = resolveUpdater(updater, sorting);
      resetPage();
      setSorting(nextSorting);
    },
    [resetPage, setSorting, sorting]
  );

  const table = useReactTable({
    columns,
    data,
    getRowId,
    globalFilterFn,
    state: {
      columnOrder,
      columnPinning,
      columnSizing,
      columnVisibility,
      expanded,
      globalFilter: searchQuery,
      pagination,
      rowSelection,
      sorting,
    },
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onExpandedChange: setExpanded,
    onPaginationChange,
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    onGlobalFilterChange,
    enableRowSelection,
    ...(getRowCanExpand && { getRowCanExpand }),
    getCoreRowModel: getCoreRowModel(),
    ...(getRowCanExpand && { getExpandedRowModel: getExpandedRowModel() }),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
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

      const oldIndex = columnOrder.indexOf(activeColumnId);
      const newIndex = columnOrder.indexOf(overColumnId);

      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex));
    },
    [columnOrder, setColumnOrder, table]
  );

  const filteredRows = table.getFilteredRowModel().rows;
  const filteredData = useMemo(
    () => filteredRows.map((row) => row.original),
    [filteredRows]
  );

  useEffect(() => {
    onFilteredDataChange?.(filteredData);
  }, [onFilteredDataChange, filteredData]);

  return (
    <AppErrorBoundary level="section">
      <div aria-busy={isLoading}>
        <span aria-atomic="true" aria-live="polite" className="sr-only">
          {isLoading
            ? "Loading…"
            : `${table.getFilteredRowModel().rows.length} results`}
        </span>
        <DataGrid
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          recordCount={table.getFilteredRowModel().rows.length}
          table={table}
          tableLayout={tableLayout}
        >
          <Card className="w-full gap-3 py-3.5!">
            <CardHeader className="px-3.5">
              <div className="flex flex-wrap items-start gap-2.5">
                <InputGroup className="w-full sm:w-72">
                  <InputGroupAddon align="inline-start">
                    <HugeiconsIcon
                      className="size-4"
                      icon={Search01Icon}
                      strokeWidth={2}
                    />
                  </InputGroupAddon>

                  <InputGroupInput
                    onChange={(event) => {
                      table.setGlobalFilter(event.target.value);
                    }}
                    placeholder={searchPlaceholder}
                    value={searchQuery}
                  />

                  {searchQuery ? (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label="Clear search"
                        onClick={() => {
                          table.setGlobalFilter("");
                        }}
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
              </div>

              <CardAction className="flex items-center gap-1">
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
            </CardHeader>

            <CardContent className="border-y px-0">
              <ScrollArea>
                {tableLayout?.columnsDraggable ? (
                  <DataGridTableDnd handleDragEnd={handleColumnDragEnd} />
                ) : (
                  <DataGridTable />
                )}
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>

            <CardFooter className="border-none bg-transparent! px-3.5 py-0">
              <DataGridPagination sizes={paginationSizes} />
            </CardFooter>
          </Card>
        </DataGrid>
      </div>
    </AppErrorBoundary>
  );
}
