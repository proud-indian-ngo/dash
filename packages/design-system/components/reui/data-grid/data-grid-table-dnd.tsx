import { type CSSProperties, Fragment, useId, useRef } from "react"
import { useDataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid"
import {
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
  DataGridTableRowSpacer,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-table"
import type {
  DataGridCell,
  DataGridHeader,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  type Modifier,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { Button } from "@pi-dash/design-system/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons"

function DataGridTableDndHeader<TData extends object>({
  header,
}: {
  header: DataGridHeader<TData>
}) {
  const { props, table } = useDataGrid<TData>()
  const { column } = header
  const isPinned = column.getIsPinned()
  const canOrder = column.columnDef.meta?.enableColumnOrdering !== false

  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: header.column.id,
  })

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    ...(!isPinned && { position: "relative" }),
    transform: CSS.Translate.toString(transform),
    transition,
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    ...(!isPinned && { zIndex: isDragging ? 1 : 0 }),
  }

  return (
    <DataGridTableHeadRowCell
      header={header}
      dndStyle={style}
      dndRef={setNodeRef}
    >
      <div className="flex items-center justify-start gap-0.5">
        {canOrder && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="-ms-2 size-6 cursor-move"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="opacity-60 hover:opacity-100" aria-hidden="true" />
          </Button>
        )}
        <span className="grow truncate">
          {header.isPlaceholder ? null : <table.FlexRender header={header} />}
        </span>
        {props.tableLayout?.columnsResizable && column.getCanResize() && (
          <DataGridTableHeadRowCellResize header={header} />
        )}
      </div>
    </DataGridTableHeadRowCell>
  )
}

function DataGridTableDndCell<TData extends object>({
  cell,
}: {
  cell: DataGridCell<TData>
}) {
  const { table } = useDataGrid<TData>()
  const isPinned = cell.column.getIsPinned()
  const canOrder = cell.column.columnDef.meta?.enableColumnOrdering !== false
  const { isDragging, setNodeRef, transform, transition } = useSortable({
    id: cell.column.id,
  })

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    ...(!isPinned && { position: "relative" as const }),
    transform: CSS.Translate.toString(transform),
    transition,
    width: cell.column.getSize(),
    ...(!isPinned && { zIndex: isDragging ? 1 : 0 }),
    ...(canOrder && { paddingInlineStart: 30 }),
  }

  return (
    <DataGridTableBodyRowCell cell={cell} dndStyle={style} dndRef={setNodeRef}>
      <table.FlexRender cell={cell} />
    </DataGridTableBodyRowCell>
  )
}

function DataGridTableDnd({
  handleDragEnd,
}: {
  handleDragEnd: (event: DragEndEvent) => void
}) {
  const { table, isLoading, props } = useDataGrid()
  const containerRef = useRef<HTMLDivElement>(null)
  const dndId = useId()

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const restrictToTableBounds: Modifier = ({ draggingNodeRect, transform }) => {
    if (!draggingNodeRect || !containerRef.current) {
      return { ...transform, y: 0 }
    }

    const containerRect = containerRef.current.getBoundingClientRect()
    const edgeOffset = 0

    const minX = containerRect.left - draggingNodeRect.left - edgeOffset
    const maxX =
      containerRect.right -
      draggingNodeRect.left -
      draggingNodeRect.width +
      edgeOffset

    return {
      ...transform,
      x: Math.min(Math.max(transform.x, minX), maxX),
      y: 0,
    }
  }

  return (
    <table.Subscribe selector={(state) => state}>
      {(state) => {
        const pagination = state.pagination
        const columnOrder = state.columnOrder

        return (
          <DndContext
            collisionDetection={closestCenter}
            id={dndId}
            modifiers={[restrictToTableBounds]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <div ref={containerRef}>
              <DataGridTableBase>
                <DataGridTableHead>
                  {table
                    .getHeaderGroups()
                    .map((headerGroup, index) => {
                      return (
                        <DataGridTableHeadRow
                          headerGroup={headerGroup}
                          key={index}
                        >
                          <SortableContext
                            items={columnOrder}
                            strategy={horizontalListSortingStrategy}
                          >
                            {headerGroup.headers.map((header) => (
                              <DataGridTableDndHeader
                                header={header}
                                key={header.id}
                              />
                            ))}
                          </SortableContext>
                        </DataGridTableHeadRow>
                      )
                    })}
                </DataGridTableHead>

                {(props.tableLayout?.stripped ||
                  !props.tableLayout?.rowBorder) && <DataGridTableRowSpacer />}

                <DataGridTableBody>
                  {props.loadingMode === "skeleton" &&
                  isLoading &&
                  pagination?.pageSize ? (
                    Array.from({ length: pagination.pageSize }).map(
                      (_, rowIndex) => (
                        <DataGridTableBodyRowSkeleton key={rowIndex}>
                          {table
                            .getVisibleFlatColumns()
                            .map((column, colIndex) => {
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
                  ) : table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => {
                      return (
                        <Fragment key={row.id}>
                          <DataGridTableBodyRow row={row}>
                            {row.getVisibleCells().map((cell) => {
                              return (
                                <SortableContext
                                  key={cell.id}
                                  items={columnOrder}
                                  strategy={horizontalListSortingStrategy}
                                >
                                  <DataGridTableDndCell cell={cell} />
                                </SortableContext>
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
            </div>
          </DndContext>
        )
      }}
    </table.Subscribe>
  )
}

export { DataGridTableDnd }
