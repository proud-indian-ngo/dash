import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";

export interface GuardianRosterItem {
  id: string;
  snapshotEmail: string | null;
  snapshotName: string;
  snapshotPhone: string | null;
  state: "active" | "archived";
}

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_EMAIL = <Skeleton className="h-5 w-48" />;
const SKELETON_PHONE = <Skeleton className="h-5 w-28" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  guardian,
  onArchive,
  onView,
}: {
  guardian: GuardianRosterItem;
  onArchive: (guardian: GuardianRosterItem) => void;
  onView: (guardian: GuardianRosterItem) => void;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(guardian));
  const handleArchive = useEventCallback(() => onArchive(guardian));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${guardian.snapshotName}`}
            className="size-8"
            data-testid="row-actions"
            onClick={stopRowClick}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4"
              icon={MoreVerticalIcon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleView}>View details</DropdownMenuItem>
        {guardian.state === "active" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleArchive} variant="destructive">
              Archive access
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchGuardian(row: GuardianRosterItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    row.snapshotName,
    row.snapshotEmail ?? "",
    row.snapshotPhone ?? "",
    row.state,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function GuardiansTable({
  data,
  isLoading,
  onArchive,
  onView,
  toolbarActions,
}: {
  data: GuardianRosterItem[];
  isLoading: boolean;
  onArchive: (guardian: GuardianRosterItem) => void;
  onView: (guardian: GuardianRosterItem) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: DataGridColumnDef<GuardianRosterItem>[] = [
    {
      accessorKey: "snapshotName",
      cell: ({ row }) => (
        <span className="font-medium text-sm" data-testid="row-title">
          {row.original.snapshotName}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 220,
    },
    {
      accessorKey: "snapshotEmail",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.snapshotEmail ?? "Not provided"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Email" visibility={true} />
      ),
      meta: { headerTitle: "Email", skeleton: SKELETON_EMAIL },
      size: 260,
    },
    {
      accessorKey: "snapshotPhone",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.snapshotPhone ?? "Not provided"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Phone" visibility={true} />
      ),
      meta: { headerTitle: "Phone", skeleton: SKELETON_PHONE },
      size: 160,
    },
    {
      accessorKey: "state",
      cell: ({ row }) => (
        <Badge
          className="capitalize"
          variant={row.original.state === "active" ? "secondary" : "outline"}
        >
          {row.original.state}
        </Badge>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 110,
    },
    {
      cell: ({ row }) => (
        <RowActions
          guardian={row.original}
          onArchive={onArchive}
          onView={onView}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      size: 52,
    },
  ];
  const getRowId = useEventCallback((row: GuardianRosterItem) => row.id);
  const handleRowClick = useEventCallback((row: GuardianRosterItem) =>
    onView(row)
  );

  return (
    <DataTableWrapper<GuardianRosterItem>
      columns={columns}
      data={data}
      emptyMessage="No Guardians found."
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchGuardian}
      searchPlaceholder="Search Guardians..."
      storageKey="kalakriti_guardians_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
