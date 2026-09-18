import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDataGrid } from "@pi-dash/design-system/components/reui/data-grid/data-grid";
import type {
  DataGridColumnDef,
  DataGridRow,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
} from "react";

import { COMPACT_EXPAND_COLUMN_ID } from "./compact-columns";

const EXPAND_SKELETON = <Skeleton className="size-8" />;

const CompactTableContext = createContext(false);

export function CompactTableProvider({
  children,
  compact,
}: {
  children: ReactNode;
  compact: boolean;
}) {
  return (
    <CompactTableContext.Provider value={compact}>
      {children}
    </CompactTableContext.Provider>
  );
}

export function useCompactTable() {
  return useContext(CompactTableContext);
}

export function DataTableExpandButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse row" : "Expand row"}
      className="aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50 aria-expanded:bg-transparent"
      data-testid="row-expand"
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event);
      }}
      size="icon"
      type="button"
      variant="ghost"
    >
      <HugeiconsIcon
        className={cn(
          "size-4 transition-transform duration-200 ease-out",
          expanded && "rotate-180"
        )}
        icon={ArrowDown01Icon}
        strokeWidth={2}
      />
    </Button>
  );
}

export function DataTableCompactPrimaryCell<TData extends object>({
  additionalPrimaryIds,
  children,
  row,
  trailingIds,
}: {
  additionalPrimaryIds: readonly string[];
  children: ReactNode;
  row: DataGridRow<TData>;
  trailingIds: readonly string[];
}) {
  const { table } = useDataGrid<TData>();
  return (
    <div
      className="flex items-start justify-between gap-3"
      data-compact-primary=""
    >
      <div className="grid min-w-0 gap-0.5">
        {children}
        {additionalPrimaryIds.map((id) => {
          const cell = row.getAllCells().find((item) => item.column.id === id);
          return cell ? (
            <div className="text-muted-foreground min-w-0 text-xs" key={id}>
              <table.FlexRender cell={cell} />
            </div>
          ) : null;
        })}
      </div>
      {trailingIds.length > 0 ? (
        <div className="flex shrink-0 items-center gap-3">
          {trailingIds.map((id) => {
            const cell = row
              .getAllCells()
              .find((item) => item.column.id === id);
            if (!cell) {
              return null;
            }
            const label =
              cell.column.columnDef.meta?.headerTitle || cell.column.id;
            return (
              <div className="flex items-center gap-1" key={id}>
                <span className="text-muted-foreground text-xs">{label}</span>
                <div className="[&_button]:size-6">
                  <table.FlexRender cell={cell} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function DataTableCompactDetails<TData extends object>({
  collapsedColumnIds,
  existingExpandedContent,
  getRowId,
  original,
}: {
  collapsedColumnIds: readonly string[];
  existingExpandedContent?: (row: object) => ReactNode;
  getRowId: (row: TData) => string;
  original: TData;
}) {
  const { table } = useDataGrid<TData>();
  const row = table.getRow(getRowId(original));
  return (
    <div className="px-3.5 py-3" data-slot="data-table-compact-details">
      {collapsedColumnIds.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {collapsedColumnIds.map((id) => {
            const cell = row
              .getAllCells()
              .find((item) => item.column.id === id);
            if (!cell) {
              return null;
            }
            const label =
              cell.column.columnDef.meta?.headerTitle || cell.column.id;
            return (
              <div className="contents" key={id}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="min-w-0">
                  <table.FlexRender cell={cell} />
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      {existingExpandedContent?.(original)}
    </div>
  );
}

export function stackPrimaryColumn<TData extends object>(
  column: DataGridColumnDef<TData>,
  additionalPrimaryIds: readonly string[],
  trailingIds: readonly string[] = []
): DataGridColumnDef<TData> {
  if (additionalPrimaryIds.length === 0 && trailingIds.length === 0) {
    return column;
  }
  const originalCell = column.cell;
  return {
    ...column,
    cell: (context) => (
      <DataTableCompactPrimaryCell
        additionalPrimaryIds={additionalPrimaryIds}
        row={context.row}
        trailingIds={trailingIds}
      >
        {typeof originalCell === "function"
          ? originalCell(context)
          : (originalCell ?? null)}
      </DataTableCompactPrimaryCell>
    ),
  };
}

export function wrapExpandColumnWithCompactDetails<TData extends object>(
  column: DataGridColumnDef<TData>,
  collapsedColumnIds: readonly string[],
  getRowId: (row: TData) => string
): DataGridColumnDef<TData> {
  const existingExpandedContent = column.meta?.expandedContent;
  return {
    ...column,
    meta: {
      ...column.meta,
      compact: "always",
      expandedContent: (row) => (
        <DataTableCompactDetails
          collapsedColumnIds={collapsedColumnIds}
          existingExpandedContent={existingExpandedContent}
          getRowId={getRowId}
          original={row as TData}
        />
      ),
    },
  };
}

export function createCompactExpandColumn<TData extends object>({
  collapsedColumnIds,
  existingExpandedContent,
  getRowId,
}: {
  collapsedColumnIds: readonly string[];
  existingExpandedContent?: (row: object) => ReactNode;
  getRowId: (row: TData) => string;
}): DataGridColumnDef<TData> {
  return {
    cell: ({ row }) => (
      <div className="flex size-full items-center justify-center">
        <DataTableExpandButton
          expanded={row.getIsExpanded()}
          onToggle={row.getToggleExpandedHandler()}
        />
      </div>
    ),
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
    header: "",
    id: COMPACT_EXPAND_COLUMN_ID,
    maxSize: 40,
    minSize: 40,
    size: 40,
    meta: {
      cellClassName: "px-0",
      compact: "always",
      enableColumnOrdering: false,
      headerClassName: "px-0",
      expandedContent: (row) => (
        <DataTableCompactDetails
          collapsedColumnIds={collapsedColumnIds}
          existingExpandedContent={existingExpandedContent}
          getRowId={getRowId}
          original={row as TData}
        />
      ),
      headerTitle: "",
      skeleton: EXPAND_SKELETON,
      stopRowClick: true,
    },
  };
}
