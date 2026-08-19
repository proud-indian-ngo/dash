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
import { type ReactNode, useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createCompetitionSessionFilterFields,
  getCompetitionSessionFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  ScheduleTableRow,
} from "./competition-config-types";

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_VALUE = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  canDelete,
  canManage,
  onDelete,
  onEdit,
  onSetState,
  onView,
  session,
}: {
  canDelete: boolean;
  canManage: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (session: ScheduleTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (session: ScheduleTableRow) => void;
  session: ScheduleTableRow;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const label = `${session.competitionName}, ${session.ageCategoryName}`;
  const handleView = useEventCallback(() => onView(session));
  const handleEdit = useEventCallback(() => onEdit(session));
  const handleCancel = useEventCallback(() =>
    onSetState({
      action: session.cancelledAt === null ? "Cancel" : "Restore",
      enabled: session.cancelledAt === null,
      id: session.id,
      kind: "session_cancelled",
      name: label,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id: session.id, kind: "session", name: label })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${label}`}
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
            <DropdownMenuItem onClick={handleEdit}>
              Edit Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCancel}>
              {session.cancelledAt === null ? "Cancel" : "Restore"} Session
            </DropdownMenuItem>
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} variant="destructive">
                  Delete Session
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchSession(session: ScheduleTableRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    session.competitionName,
    session.ageCategoryName,
    session.venueName,
    session.cancelledAt === null ? "scheduled" : "cancelled",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function CompetitionSessionsTable({
  canDelete,
  canManage,
  data,
  isLoading,
  onDelete,
  onEdit,
  onSetState,
  onView,
  timeZone,
  toolbarActions,
}: {
  canDelete: boolean;
  canManage: boolean;
  data: ScheduleTableRow[];
  isLoading: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (session: ScheduleTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (session: ScheduleTableRow) => void;
  timeZone: string;
  toolbarActions?: ReactNode;
}) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
    [timeZone]
  );
  const filterFields = useMemo(
    () => createCompetitionSessionFilterFields(data),
    [data]
  );
  const columns: DataGridColumnDef<ScheduleTableRow>[] = [
    {
      accessorKey: "competitionName",
      cell: ({ row }) => (
        <span className="font-medium text-sm" data-testid="row-title">
          {row.original.competitionName}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competition"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Competition", skeleton: SKELETON_NAME },
      size: 210,
    },
    {
      accessorKey: "ageCategoryName",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Age Category", skeleton: SKELETON_VALUE },
      size: 150,
    },
    {
      accessorKey: "startAt",
      cell: ({ row }) => formatter.format(row.original.startAt),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Starts"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Starts", skeleton: SKELETON_VALUE },
      size: 120,
    },
    {
      accessorKey: "endAt",
      cell: ({ row }) => formatter.format(row.original.endAt),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Ends" visibility={true} />
      ),
      meta: { headerTitle: "Ends", skeleton: SKELETON_VALUE },
      size: 120,
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      meta: { headerTitle: "Venue", skeleton: SKELETON_VALUE },
      size: 170,
    },
    {
      accessorFn: (session) =>
        session.cancelledAt === null ? "scheduled" : "cancelled",
      cell: ({ row }) => (
        <Badge
          variant={row.original.cancelledAt === null ? "secondary" : "outline"}
        >
          {row.original.cancelledAt === null ? "Scheduled" : "Cancelled"}
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
          canDelete={canDelete}
          canManage={canManage}
          onDelete={onDelete}
          onEdit={onEdit}
          onSetState={onSetState}
          onView={onView}
          session={row.original}
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
  const getRowId = useEventCallback((row: ScheduleTableRow) => row.id);
  const handleRowClick = useEventCallback((row: ScheduleTableRow) =>
    onView(row)
  );

  return (
    <DataTableWrapper<ScheduleTableRow>
      columns={columns}
      data={data}
      emptyMessage="No Competition Sessions scheduled."
      filter={{
        fields: filterFields,
        getValue: getCompetitionSessionFilterValue,
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchSession}
      searchPlaceholder="Search Schedule..."
      storageKey="kalakriti_competition_sessions_table_state_v1"
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
