import {
  createContext,
  type CSSProperties,
  Fragment,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useDataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid"
import {
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyGroupRow,
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

import { cn } from "@pi-dash/design-system/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons"

function mergeSortableColumnIds(
  columnOrder: readonly string[],
  visibleColumnIds: readonly string[]
): string[] {
  if (visibleColumnIds.length === 0) {
    return [...columnOrder]
  }
  if (columnOrder.length === 0) {
    return [...visibleColumnIds]
  }

  const visibleSet = new Set(visibleColumnIds)
  const ordered = columnOrder.filter((id) => visibleSet.has(id))
  const orderedSet = new Set(ordered)
  const missing = visibleColumnIds.filter((id) => !orderedSet.has(id))
  return [...ordered, ...missing]
}

interface ColumnDragState {
  isDragging: boolean
  transform: string | undefined
  transition: string | undefined
}

const IDLE_COLUMN: ColumnDragState = {
  isDragging: false,
  transform: undefined,
  transition: undefined,
}

// dnd-kit keeps one draggable per id, owned by whichever hook registered last
// and dropped when that one unmounts. So body cells must not call useSortable
// with their column's id: once the last-mounted cell unmounted, the header
// could no longer start a drag. The header publishes its drag state here and
// its column's cells follow it.
function createColumnDragStore() {
  const states = new Map<string, ColumnDragState>()
  const listeners = new Set<() => void>()
  return {
    get: (columnId: string) => states.get(columnId) ?? IDLE_COLUMN,
    set: (columnId: string, next: ColumnDragState) => {
      const previous = states.get(columnId) ?? IDLE_COLUMN
      if (
        previous.isDragging === next.isDragging &&
        previous.transform === next.transform &&
        previous.transition === next.transition
      ) {
        return
      }
      states.set(columnId, next)
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const ColumnDragContext = createContext<ReturnType<
  typeof createColumnDragStore
> | null>(null)

function useColumnDragStore() {
  const store = useContext(ColumnDragContext)
  if (!store) {
    throw new Error("Column drag state is only available inside DataGridTableDnd")
  }
  return store
}

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
  const dragStore = useColumnDragStore()
  const translate = CSS.Translate.toString(transform)
  useLayoutEffect(() => {
    dragStore.set(column.id, { isDragging, transform: translate, transition })
  }, [column.id, dragStore, isDragging, transition, translate])

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    ...(!isPinned && { position: "relative" }),
    transform: translate,
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
      <div className="flex min-w-0 items-center justify-start gap-0.5">
        {canOrder && (
          <button
            aria-label="Drag to reorder"
            className={cn(
              "absolute inset-y-0 start-0 inline-flex w-3 shrink-0 cursor-grab items-center justify-center bg-transparent text-secondary-foreground/80 opacity-0 transition-opacity group-hover/th:opacity-100 focus-visible:opacity-100 hover:text-foreground active:cursor-grabbing [&_svg]:size-3"
            )}
            type="button"
            {...attributes}
            {...listeners}
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="opacity-60 hover:opacity-100"
              icon={DragDropVerticalIcon}
              strokeWidth={2}
            />
          </button>
        )}
        <span className="min-w-0 grow truncate">
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
  const dragStore = useColumnDragStore()
  const { isDragging, transform, transition } = useSyncExternalStore(
    dragStore.subscribe,
    () => dragStore.get(cell.column.id),
    () => dragStore.get(cell.column.id)
  )

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    ...(!isPinned && { position: "relative" as const }),
    transform,
    transition,
    width: cell.column.getSize(),
    ...(!isPinned && { zIndex: isDragging ? 1 : 0 }),
  }

  return (
    <DataGridTableBodyRowCell cell={cell} dndStyle={style}>
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
  const [dragStore] = useState(createColumnDragStore)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
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
        const visibleColumnIds = table
          .getVisibleLeafColumns()
          .map((column) => column.id)
        const sortableColumnIds = mergeSortableColumnIds(
          state.columnOrder,
          visibleColumnIds
        )

        return (
          <DndContext
            collisionDetection={closestCenter}
            id={dndId}
            modifiers={[restrictToTableBounds]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <ColumnDragContext.Provider value={dragStore}>
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
                              items={sortableColumnIds}
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
                            {row.getIsGrouped() ? (
                              <DataGridTableBodyGroupRow row={row} />
                            ) : (
                              <DataGridTableBodyRow row={row}>
                                {row.getVisibleCells().map((cell) => (
                                  <DataGridTableDndCell
                                    cell={cell}
                                    key={cell.id}
                                  />
                                ))}
                              </DataGridTableBodyRow>
                            )}
                            {row.getIsExpanded() && !row.getIsGrouped() && (
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
            </ColumnDragContext.Provider>
          </DndContext>
        )
      }}
    </table.Subscribe>
  )
}

export { DataGridTableDnd }
