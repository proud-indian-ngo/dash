import type { ReactNode } from "react"
import type {
  Cell,
  Column,
  ColumnDef,
  Header,
  HeaderGroup,
  ReactTable,
  Row,
} from "@tanstack/react-table"
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFn_arrIncludes,
  filterFn_equals,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
} from "@tanstack/react-table"

export type DataGridColumnMeta = {
  cellClassName?: string
  enableColumnOrdering?: boolean
  expandedContent?(row: object): ReactNode
  headerClassName?: string
  headerTitle?: string
  skeleton?: ReactNode
  stopRowClick?: boolean
}

export const dataGridFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  columnMeta: metaHelper<DataGridColumnMeta>(),
  expandedRowModel: createExpandedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    arrIncludes: filterFn_arrIncludes,
    equals: filterFn_equals,
    includesString: filterFn_includesString,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
})

export type DataGridFeatures = typeof dataGridFeatures

export type DataGridColumnDef<
  TData extends object,
  TValue = unknown,
> = ColumnDef<DataGridFeatures, TData, TValue>

export type DataGridColumn<TData extends object, TValue = unknown> = Column<
  DataGridFeatures,
  TData,
  TValue
>

export type DataGridRow<TData extends object> = Row<DataGridFeatures, TData>

export type DataGridCell<TData extends object, TValue = unknown> = Cell<
  DataGridFeatures,
  TData,
  TValue
>

export type DataGridHeader<TData extends object, TValue = unknown> = Header<
  DataGridFeatures,
  TData,
  TValue
>

export type DataGridHeaderGroup<TData extends object> = HeaderGroup<
  DataGridFeatures,
  TData
>

export type DataGridTableInstance<TData extends object> = ReactTable<
  DataGridFeatures,
  TData
>

export const {
  createAppColumnHelper: createDataGridColumnHelper,
  useAppTable: useDataGridTable,
} = createTableHook({
  enableRowRangeSelection: false,
  features: dataGridFeatures,
})
