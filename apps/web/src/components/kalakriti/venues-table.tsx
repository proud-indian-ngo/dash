import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
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
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  VenueTableRow,
} from "./competition-config-types";

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-10" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  canManage,
  onDelete,
  onEdit,
  onSetState,
  onView,
  venue,
}: {
  canManage: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (venue: VenueTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (venue: VenueTableRow) => void;
  venue: VenueTableRow;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(venue));
  const handleEdit = useEventCallback(() => onEdit(venue));
  const handleRetire = useEventCallback(() =>
    onSetState({
      action: venue.retiredAt === null ? "Retire" : "Restore",
      enabled: venue.retiredAt === null,
      id: venue.id,
      kind: "venue_retired",
      name: venue.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id: venue.id, kind: "venue", name: venue.name })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${venue.name}`}
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
        {canManage ? (
          <>
            <DropdownMenuItem onClick={handleEdit}>Edit Venue</DropdownMenuItem>
            <DropdownMenuItem onClick={handleRetire}>
              {venue.retiredAt === null ? "Retire" : "Restore"} Venue
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} variant="destructive">
              Delete Venue
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchVenue(venue: VenueTableRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [venue.name, venue.retiredAt === null ? "active" : "retired"]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function VenuesTable({
  canManage,
  data,
  isLoading,
  onDelete,
  onEdit,
  onSetState,
  onView,
  toolbarActions,
}: {
  canManage: boolean;
  data: VenueTableRow[];
  isLoading: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (venue: VenueTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (venue: VenueTableRow) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: ColumnDef<VenueTableRow>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="font-medium text-sm" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      meta: { headerTitle: "Venue", skeleton: SKELETON_NAME },
      size: 260,
    },
    {
      accessorKey: "sessionCount",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Scheduled Sessions"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Scheduled Sessions", skeleton: SKELETON_COUNT },
      size: 170,
    },
    {
      accessorFn: (venue) => (venue.retiredAt === null ? "active" : "retired"),
      cell: ({ row }) => (
        <Badge
          variant={row.original.retiredAt === null ? "secondary" : "outline"}
        >
          {row.original.retiredAt === null ? "Active" : "Retired"}
        </Badge>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 120,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canManage={canManage}
          onDelete={onDelete}
          onEdit={onEdit}
          onSetState={onSetState}
          onView={onView}
          venue={row.original}
        />
      ),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      size: 52,
    },
  ];
  const getRowId = useEventCallback((row: VenueTableRow) => row.id);
  const handleRowClick = useEventCallback((row: VenueTableRow) => onView(row));

  return (
    <DataTableWrapper<VenueTableRow>
      columns={columns}
      data={data}
      emptyMessage="No Venues configured."
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchVenue}
      searchPlaceholder="Search Venues..."
      storageKey="kalakriti_venues_table_state_v1"
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
