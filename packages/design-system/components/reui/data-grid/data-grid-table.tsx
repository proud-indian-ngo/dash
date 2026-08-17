import { type CSSProperties, Fragment, type ReactNode } from "react"
import { useDataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid"
import type {
  DataGridCell,
  DataGridColumn,
  DataGridHeader,
  DataGridHeaderGroup,
  DataGridRow,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features"
import { cva } from "class-variance-authority"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox"
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner"

const headerCellSpacingVariants = cva("", {
  variants: {
    size: {
      dense:
        "px-2 h-8",
      default:
        "px-3",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

const bodyCellSpacingVariants = cva("", {
  variants: {
    size: {
      dense:
        "px-2 py-1.5",
      default:
        "px-3 py-2",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

const pinnedColumnClassName =
  "[&[data-pinned][data-last-col]]:border-border data-pinned:bg-muted/90 data-pinned:backdrop-blur-xs [&:not([data-pinned]):has(+[data-pinned])_div.cursor-col-resize:last-child]:opacity-0 [&[data-last-col=start]_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=start][data-last-col=start]]:border-e! [&[data-pinned=end]:last-child_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=end][data-last-col=end]]:border-s!"

const pinnedBodyColumnClassName =
  "[&[data-pinned][data-last-col]]:border-border data-pinned:bg-background/90 data-pinned:backdrop-blur-xs [&[data-pinned=start][data-last-col=start]]:border-e! [&[data-pinned=end][data-last-col=end]]:border-s!"

function getPinningStyles<TData extends object>(
  column: DataGridColumn<TData>
): CSSProperties {
  const isPinned = column.getIsPinned()

  return {
    insetInlineStart:
      isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    insetInlineEnd:
      isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  }
}

function DataGridTableBase({ children }: { children: ReactNode }) {
  const { props, table } = useDataGrid()

  return (
    <table
      data-slot="data-grid-table"
      className={cn(
        "text-foreground text-xs w-full min-w-full caption-bottom text-left align-middle font-normal rtl:text-right",
        props.tableLayout?.width === "auto" ? "table-auto" : "table-fixed",
        !props.tableLayout?.columnsResizable && "",
        !props.tableLayout?.columnsDraggable &&
          "border-separate border-spacing-0",
        props.tableClassNames?.base
      )}
      style={
        props.tableLayout?.columnsResizable
          ? { width: table.getTotalSize() }
          : undefined
      }
    >
      {children}
    </table>
  )
}

function DataGridTableHead({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <thead
      className={cn(
        props.tableClassNames?.header,
        props.tableLayout?.headerSticky && props.tableClassNames?.headerSticky
      )}
    >
      {children}
    </thead>
  )
}

function DataGridTableHeadRow<TData extends object>({
  children,
  headerGroup,
}: {
  children: ReactNode
  headerGroup: DataGridHeaderGroup<TData>
}) {
  const { props } = useDataGrid()

  return (
    <tr
      key={headerGroup.id}
      className={cn(
        "bg-muted/40",
        props.tableLayout?.headerBorder && "[&>th]:border-b",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableLayout?.stripped && "bg-transparent",
        props.tableLayout?.headerBackground === false && "bg-transparent",
        props.tableClassNames?.headerRow
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableHeadRowCell<TData extends object>({
  children,
  header,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  header: DataGridHeader<TData>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  const { props } = useDataGrid()

  const { column } = header
  const isPinned = column.getIsPinned()
  const isLastStartPinned =
    isPinned === "start" && column.getIsLastColumn("start")
  const isFirstEndPinned = isPinned === "end" && column.getIsFirstColumn("end")
  const headerCellSpacing = headerCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  })

  return (
    <th
      key={header.id}
      ref={dndRef}
      style={{
        ...((props.tableLayout?.width === "fixed" ||
          props.tableLayout?.columnsResizable) && {
          width: header.getSize(),
        }),
        ...(props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          getPinningStyles(column)),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-last-col={
        isLastStartPinned ? "start" : isFirstEndPinned ? "end" : undefined
      }
      className={cn(
        "text-secondary-foreground/80 h-9 relative text-left align-middle font-normal rtl:text-right [&:has([role=checkbox])]:pe-0",
        headerCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable &&
          column.getCanResize() &&
          "truncate",
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          pinnedColumnClassName,
        header.column.columnDef.meta?.headerClassName,
        column.getIndex() === 0 ||
          column.getIndex() === (header.headerGroup?.headers.length ?? 0) - 1
          ? props.tableClassNames?.edgeCell
          : ""
      )}
    >
      {children}
    </th>
  )
}

function DataGridTableHeadRowCellResize<TData extends object>({
  header,
}: {
  header: DataGridHeader<TData>
}) {
  const { column } = header

  return (
    <div
      {...{
        role: "separator" as const,
        "aria-orientation": "vertical" as const,
        "aria-label": "Resize column",
        onDoubleClick: () => column.resetSize(),
        onMouseDown: header.getResizeHandler(),
        onTouchStart: header.getResizeHandler(),
        className:
          "absolute top-0 h-full w-4 cursor-col-resize user-select-none touch-none -end-2 z-10 flex justify-center before:absolute before:w-px before:inset-y-0 before:bg-border before:-translate-x-px",
      }}
    />
  )
}

function DataGridTableRowSpacer() {
  return <tbody aria-hidden="true" className="h-2"></tbody>
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <tbody
      className={cn(
        "[&_tr:last-child]:border-0",
        props.tableLayout?.rowRounded &&
          "[&_td:first-child]:rounded-e-none",
        props.tableLayout?.rowRounded &&
          "[&_td:last-child]:rounded-e-none",
        props.tableClassNames?.body
      )}
    >
      {children}
    </tbody>
  )
}

function DataGridTableBodyRowSkeleton({ children }: { children: ReactNode }) {
  const { table, props } = useDataGrid()

  return (
    <tr
      className={cn(
        "hover:bg-muted/40 data-[state=selected]:bg-muted/50",
        props.onRowClick && "cursor-pointer",
        !props.tableLayout?.stripped &&
          props.tableLayout?.rowBorder &&
          "border-border border-b [&:not(:last-child)>td]:border-b",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableLayout?.stripped &&
          "odd:bg-muted/90 odd:hover:bg-muted hover:bg-transparent",
        table.options.enableRowSelection && "*:first:relative",
        props.tableClassNames?.bodyRow
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowSkeletonCell<TData extends object>({
  children,
  column,
}: {
  children: ReactNode
  column: DataGridColumn<TData>
}) {
  const { props, table } = useDataGrid()
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  })

  return (
    <td
      style={
        props.tableLayout?.columnsResizable
          ? { width: column.getSize() }
          : undefined
      }
      className={cn(
        "align-middle",
        bodyCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable &&
          column.getCanResize() &&
          "truncate",
        column.columnDef.meta?.cellClassName,
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          pinnedBodyColumnClassName,
        column.getIndex() === 0 ||
          column.getIndex() === table.getVisibleFlatColumns().length - 1
          ? props.tableClassNames?.edgeCell
          : ""
      )}
    >
      {children}
    </td>
  )
}

function DataGridTableBodyRow<TData extends object>({
  children,
  row,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  row: DataGridRow<TData>
  dndRef?: React.Ref<HTMLTableRowElement>
  dndStyle?: CSSProperties
}) {
  const { props, table } = useDataGrid()

  return (
    <tr
      ref={dndRef}
      style={{ ...(dndStyle ? dndStyle : null) }}
      data-state={
        table.options.enableRowSelection && row.getIsSelected()
          ? "selected"
          : undefined
      }
      onClick={() => props.onRowClick && props.onRowClick(row.original)}
      onKeyDown={(e) => {
        if (props.onRowClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          props.onRowClick(row.original)
        }
      }}
      tabIndex={props.onRowClick ? 0 : undefined}
      className={cn(
        "hover:bg-muted/40 data-[state=selected]:bg-muted/50",
        props.onRowClick && "cursor-pointer",
        !props.tableLayout?.stripped &&
          props.tableLayout?.rowBorder &&
          "border-border border-b [&:not(:last-child)>td]:border-b",
        props.tableLayout?.cellBorder && "*:last:border-e-0",
        props.tableLayout?.stripped &&
          "odd:bg-muted/90 odd:hover:bg-muted hover:bg-transparent",
        table.options.enableRowSelection && "*:first:relative",
        props.tableClassNames?.bodyRow
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowExpandded<TData extends object>({
  row,
}: {
  row: DataGridRow<TData>
}) {
  const { props, table } = useDataGrid()

  return (
    <tr
      className={cn(
        props.tableLayout?.rowBorder && "[&:not(:last-child)>td]:border-b"
      )}
    >
      <td colSpan={row.getVisibleCells().length}>
        {table
          .getAllColumns()
          .find((column) => column.columnDef.meta?.expandedContent)
          ?.columnDef.meta?.expandedContent?.(row.original)}
      </td>
    </tr>
  )
}

function DataGridTableBodyRowCell<TData extends object>({
  children,
  cell,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  cell: DataGridCell<TData>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  const { props } = useDataGrid()

  const { column, row } = cell
  const isPinned = column.getIsPinned()
  const isLastStartPinned =
    isPinned === "start" && column.getIsLastColumn("start")
  const isFirstEndPinned = isPinned === "end" && column.getIsFirstColumn("end")
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? "dense" : "default",
  })

  return (
    <td
      key={cell.id}
      ref={dndRef}
      {...(props.tableLayout?.columnsDraggable && !isPinned ? { cell } : {})}
      onClick={
        cell.column.columnDef.meta?.stopRowClick
          ? (e) => e.stopPropagation()
          : undefined
      }
      style={{
        ...(props.tableLayout?.columnsResizable && {
          width: column.getSize(),
        }),
        ...(props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          getPinningStyles(column)),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-last-col={
        isLastStartPinned ? "start" : isFirstEndPinned ? "end" : undefined
      }
      className={cn(
        "align-middle",
        bodyCellSpacing,
        props.tableLayout?.cellBorder && "border-e",
        props.tableLayout?.columnsResizable &&
          column.getCanResize() &&
          "truncate",
        cell.column.columnDef.meta?.cellClassName,
        props.tableLayout?.columnsPinnable &&
          column.getCanPin() &&
          pinnedBodyColumnClassName,
        column.getIndex() === 0 ||
          column.getIndex() === row.getVisibleCells().length - 1
          ? props.tableClassNames?.edgeCell
          : ""
      )}
    >
      {children}
    </td>
  )
}

function DataGridTableEmpty() {
  const { table, props } = useDataGrid()
  const totalColumns = table.getAllColumns().length

  return (
    <tr>
      <td
        colSpan={totalColumns}
        className="text-muted-foreground text-xs py-6 text-center"
      >
        {props.emptyMessage || "No data available"}
      </td>
    </tr>
  )
}

function DataGridTableLoader() {
  const { props } = useDataGrid()

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" role="status" aria-live="polite">
      <div className="text-muted-foreground bg-card rounded-none text-xs flex items-center gap-2 border px-4 py-2 leading-none font-medium">
        <BrailleSpinner variant="inline" />
        {props.loadingMessage || "Loading…"}
      </div>
    </div>
  )
}

function DataGridTableRowSelect<TData extends object>({
  row,
}: {
  row: DataGridRow<TData>
}) {
  return (
    <>
      <div
        className={cn(
          "bg-primary absolute start-0 top-0 bottom-0 hidden w-[2px]",
          row.getIsSelected() && "block"
        )}
      ></div>
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="align-[inherit]"
      />
    </>
  )
}

function DataGridTableRowSelectAll() {
  const { table, recordCount, isLoading } = useDataGrid()

  const isAllSelected = table.getIsAllPageRowsSelected()
  const isSomeSelected = table.getIsSomePageRowsSelected()

  return (
    <Checkbox
      checked={isAllSelected}
      indeterminate={isSomeSelected && !isAllSelected}
      disabled={isLoading || recordCount === 0}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="Select all"
      className="align-[inherit]"
    />
  )
}

function DataGridTable() {
  const { table, isLoading, props } = useDataGrid()

  return (
    <table.Subscribe selector={(state) => state}>
      {(state) => {
        const pagination = state.pagination

        return (
          <DataGridTableBase>
            <DataGridTableHead>
              {table
                .getHeaderGroups()
                .map((headerGroup, index) => {
                  return (
                    <DataGridTableHeadRow headerGroup={headerGroup} key={index}>
                      {headerGroup.headers.map((header, index) => {
                        const { column } = header

                        return (
                          <DataGridTableHeadRowCell header={header} key={index}>
                            {header.isPlaceholder ? null : (
                              <table.FlexRender header={header} />
                            )}
                            {props.tableLayout?.columnsResizable &&
                              column.getCanResize() && (
                                <DataGridTableHeadRowCellResize
                                  header={header}
                                />
                              )}
                          </DataGridTableHeadRowCell>
                        )
                      })}
                    </DataGridTableHeadRow>
                  )
                })}
            </DataGridTableHead>

            {(props.tableLayout?.stripped || !props.tableLayout?.rowBorder) && (
              <DataGridTableRowSpacer />
            )}

            <DataGridTableBody>
              {isLoading &&
              props.loadingMode === "skeleton" &&
              pagination?.pageSize ? (
                Array.from({ length: pagination.pageSize }).map(
                  (_, rowIndex) => (
                    <DataGridTableBodyRowSkeleton key={rowIndex}>
                      {table.getVisibleFlatColumns().map((column, colIndex) => {
                        return (
                          <DataGridTableBodyRowSkeletonCell
                            column={column}
                            key={colIndex}
                          >
                            {column.columnDef.meta?.skeleton}
                          </DataGridTableBodyRowSkeletonCell>
                        )
                      })}
                    </DataGridTableBodyRowSkeleton>
                  )
                )
              ) : isLoading && props.loadingMode === "spinner" ? (
                <tr>
                  <td
                    colSpan={table.getVisibleFlatColumns().length}
                    className="p-8"
                  >
                    <div
                      className="flex items-center justify-center gap-2"
                      role="status"
                      aria-live="polite"
                    >
                      <BrailleSpinner variant="inline" />
                      {props.loadingMessage || "Loading…"}
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, index) => {
                  return (
                    <Fragment key={row.id}>
                      <DataGridTableBodyRow row={row} key={index}>
                        {row.getVisibleCells().map((cell, colIndex) => {
                          return (
                            <DataGridTableBodyRowCell
                              cell={cell}
                              key={colIndex}
                            >
                              <table.FlexRender cell={cell} />
                            </DataGridTableBodyRowCell>
                          )
                        })}
                      </DataGridTableBodyRow>
                      {row.getIsExpanded() && (
                        <DataGridTableBodyRowExpandded row={row} />
                      )}
                    </Fragment>
                  )
                })
              ) : (
                <DataGridTableEmpty />
              )}
            </DataGridTableBody>
          </DataGridTableBase>
        )
      }}
    </table.Subscribe>
  )
}

export {
  DataGridTable,
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableBodyRowCell,
  DataGridTableBodyRowExpandded,
  DataGridTableBodyRowSkeleton,
  DataGridTableBodyRowSkeletonCell,
  DataGridTableEmpty,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableLoader,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
  DataGridTableRowSpacer,
}
