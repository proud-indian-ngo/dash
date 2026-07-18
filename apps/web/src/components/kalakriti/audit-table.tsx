import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { formatAuditLabel } from "@/lib/kalakriti-audit-policy";

export interface KalakritiAuditRow {
  action: string;
  actorName: string | null;
  actorUserId: string | null;
  createdAt: string;
  domain: string;
  id: string;
  metadata: Record<string, unknown> | null;
  reason: string | null;
  targetId: string | null;
  targetType: string;
}

const TEXT_SKELETON = <Skeleton className="h-4 w-24" />;
const BADGE_SKELETON = <Skeleton className="h-5 w-24" />;
const AUDIT_COLUMNS_BY_TIME_ZONE = new Map<
  string,
  ColumnDef<KalakritiAuditRow>[]
>();

function createColumns(timeZone: string): ColumnDef<KalakritiAuditRow>[] {
  const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  });
  return [
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt}>
          {dateTimeFormatter.format(new Date(row.original.createdAt))}
        </time>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Time" visibility={true} />
      ),
      id: "createdAt",
      meta: { headerTitle: "Time", skeleton: TEXT_SKELETON },
      size: 180,
    },
    {
      accessorFn: (row) => row.actorName ?? "System",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">
            {row.original.actorName ?? "System or deleted user"}
          </div>
          {row.original.actorUserId ? (
            <div className="truncate text-muted-foreground text-xs">
              {row.original.actorUserId}
            </div>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Actor" visibility={true} />
      ),
      id: "actor",
      meta: { headerTitle: "Actor", skeleton: TEXT_SKELETON },
      size: 190,
    },
    {
      accessorFn: (row) => row.action,
      cell: ({ row }) => (
        <Badge variant="outline">{formatAuditLabel(row.original.action)}</Badge>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Action"
          visibility={true}
        />
      ),
      id: "action",
      meta: { headerTitle: "Action", skeleton: BADGE_SKELETON },
      size: 150,
    },
    {
      accessorFn: (row) => row.domain,
      cell: ({ row }) => formatAuditLabel(row.original.domain),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Domain"
          visibility={true}
        />
      ),
      id: "domain",
      meta: { headerTitle: "Domain", skeleton: TEXT_SKELETON },
      size: 210,
    },
    {
      accessorFn: (row) => `${row.targetType} ${row.targetId ?? ""}`,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div>{formatAuditLabel(row.original.targetType)}</div>
          {row.original.targetId ? (
            <div className="truncate text-muted-foreground text-xs">
              {row.original.targetId}
            </div>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Target"
          visibility={true}
        />
      ),
      id: "target",
      meta: { headerTitle: "Target", skeleton: TEXT_SKELETON },
      size: 220,
    },
    {
      accessorFn: (row) => row.reason ?? "",
      cell: ({ row }) => (
        <span className={row.original.reason ? "" : "text-muted-foreground"}>
          {row.original.reason ?? "No reason required"}
        </span>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Reason"
          visibility={true}
        />
      ),
      id: "reason",
      meta: { headerTitle: "Reason", skeleton: TEXT_SKELETON },
      size: 260,
    },
  ];
}

function getAuditColumns(timeZone: string) {
  const cached = AUDIT_COLUMNS_BY_TIME_ZONE.get(timeZone);
  if (cached) {
    return cached;
  }
  const columns = createColumns(timeZone);
  AUDIT_COLUMNS_BY_TIME_ZONE.set(timeZone, columns);
  return columns;
}

function searchAuditRow(row: KalakritiAuditRow, query: string) {
  const normalized = query.trim().toLowerCase();
  return (
    !normalized ||
    [
      row.action,
      row.actorName,
      row.actorUserId,
      row.domain,
      row.reason,
      row.targetId,
      row.targetType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

function getAuditRowId(row: KalakritiAuditRow) {
  return row.id;
}

export function KalakritiAuditTable({
  hasActiveFilters,
  isLoading,
  onClearFilters,
  rowCount,
  rows,
  timeZone,
  toolbarActions,
  toolbarFilters,
}: {
  hasActiveFilters: boolean;
  isLoading: boolean;
  onClearFilters: () => void;
  rowCount: number;
  rows: KalakritiAuditRow[];
  timeZone: string;
  toolbarActions: ReactNode;
  toolbarFilters: ReactNode;
}) {
  return (
    <DataTableWrapper
      columns={getAuditColumns(timeZone)}
      data={rows}
      defaultPageSize={25}
      emptyMessage="No audit entries found for this scope."
      getRowId={getAuditRowId}
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      manualPagination
      onClearFilters={onClearFilters}
      paginationSizes={[10, 25, 50, 100]}
      rowCount={rowCount}
      searchFn={searchAuditRow}
      searchPlaceholder="Filter this page..."
      searchQueryKey="auditSearch"
      storageKey="kalakriti_audit_table_v1"
      tableLayout={{
        columnsMovable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
      toolbarFilters={toolbarFilters}
    />
  );
}
