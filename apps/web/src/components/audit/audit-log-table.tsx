import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { formatTimestamp } from "@/lib/date-formats";
import type { AuditLogRow } from "./audit-types";

const SKELETON_TEXT = <Skeleton className="h-4 w-28" />;
const SKELETON_BADGE = <Skeleton className="h-5 w-16" />;

function searchAuditRow(row: AuditLogRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return [
    row.actorName,
    row.actorUserId,
    row.action,
    row.targetId ?? "",
    row.targetType ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function outcomeVariant(outcome: AuditLogRow["outcome"]) {
  switch (outcome) {
    case "success":
      return "success" as const;
    case "denied":
      return "warning" as const;
    case "failure":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

const columns: ColumnDef<AuditLogRow>[] = [
  {
    accessorFn: (row) => row.attemptedAt,
    cell: ({ row }) => formatTimestamp(row.original.attemptedAt),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Time" visibility={true} />
    ),
    id: "attemptedAt",
    meta: { headerTitle: "Time", skeleton: SKELETON_TEXT },
    size: 180,
  },
  {
    accessorFn: (row) => row.actorName,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.actorName}</div>
        <div className="truncate text-muted-foreground text-xs">
          {row.original.actorRole}
        </div>
      </div>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Actor" visibility={true} />
    ),
    id: "actor",
    meta: { headerTitle: "Actor", skeleton: SKELETON_TEXT },
    size: 180,
  },
  {
    accessorFn: (row) => row.action,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.action}</span>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Action" visibility={true} />
    ),
    id: "action",
    meta: { headerTitle: "Action", skeleton: SKELETON_TEXT },
    size: 240,
  },
  {
    accessorFn: (row) => row.targetId ?? row.targetType ?? "",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate">{row.original.targetType ?? "None"}</div>
        {row.original.targetId ? (
          <div className="truncate font-mono text-muted-foreground text-xs">
            {row.original.targetId}
          </div>
        ) : null}
      </div>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Target" visibility={true} />
    ),
    id: "target",
    meta: { headerTitle: "Target", skeleton: SKELETON_TEXT },
    size: 220,
  },
  {
    accessorFn: (row) => row.outcome,
    cell: ({ row }) => (
      <Badge variant={outcomeVariant(row.original.outcome)}>
        {row.original.outcome}
      </Badge>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Outcome" visibility={true} />
    ),
    id: "outcome",
    meta: { headerTitle: "Outcome", skeleton: SKELETON_BADGE },
    size: 110,
  },
];

interface AuditLogTableProps {
  entries: AuditLogRow[];
  hasActiveFilters: boolean;
  isLoading: boolean;
  onClearFilters: () => void;
  onView: (entry: AuditLogRow) => void;
  rowCount: number;
  toolbarFilters: ReactNode;
}

export function AuditLogTable({
  entries,
  hasActiveFilters,
  isLoading,
  onClearFilters,
  onView,
  rowCount,
  toolbarFilters,
}: AuditLogTableProps) {
  const getRowId = useEventCallback((row: AuditLogRow) => row.id);

  return (
    <DataTableWrapper
      columns={columns}
      data={entries}
      defaultPageSize={20}
      emptyMessage="No audit entries found."
      getRowId={getRowId}
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      manualPagination
      onClearFilters={onClearFilters}
      onRowClick={onView}
      paginationSizes={[20, 50, 100]}
      rowCount={rowCount}
      searchFn={searchAuditRow}
      searchPlaceholder="Search actor, action, or target..."
      storageKey="audit_log_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsMovable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarFilters={toolbarFilters}
    />
  );
}
