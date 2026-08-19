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
import {
  createCenterFilterFields,
  getCenterFilterValue,
} from "@/components/kalakriti/kalakriti-filters";

export interface CenterListItem {
  competitionEntryRegistrationEnabled: boolean;
  id: string;
  name: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

export interface CenterTableRow extends CenterListItem {
  guardianCount: number | null;
  liaisonCount: number | null;
}

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_REGISTRATION = <Skeleton className="h-5 w-20" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-8" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RegistrationStatus({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "secondary" : "outline"}>
      {enabled ? "Open" : "Closed"}
    </Badge>
  );
}

function RowActions({
  canConfigureCenters,
  canManageRegistrationControls,
  center,
  onDelete,
  onEdit,
  onRegistrationControls,
  onRetire,
  onView,
}: {
  canConfigureCenters: boolean;
  canManageRegistrationControls: boolean;
  center: CenterTableRow;
  onDelete: (center: CenterListItem) => void;
  onEdit: (center: CenterListItem) => void;
  onRegistrationControls: (center: CenterListItem) => void;
  onRetire: (center: CenterListItem) => void;
  onView: (center: CenterTableRow) => void;
}) {
  const isRetired = center.retiredAt !== null;
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(center));
  const handleEdit = useEventCallback(() => onEdit(center));
  const handleRegistrationControls = useEventCallback(() =>
    onRegistrationControls(center)
  );
  const handleRetire = useEventCallback(() => onRetire(center));
  const handleDelete = useEventCallback(() => onDelete(center));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${center.name}`}
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
        {canConfigureCenters || canManageRegistrationControls ? (
          <>
            <DropdownMenuSeparator />
            {isRetired ? null : (
              <>
                {canManageRegistrationControls ? (
                  <DropdownMenuItem onClick={handleRegistrationControls}>
                    Registration controls
                  </DropdownMenuItem>
                ) : null}
                {canConfigureCenters ? (
                  <>
                    <DropdownMenuItem onClick={handleEdit}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleRetire}>
                      Retire
                    </DropdownMenuItem>
                  </>
                ) : null}
              </>
            )}
            {canConfigureCenters ? (
              <DropdownMenuItem onClick={handleDelete} variant="destructive">
                Delete
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchCenter(row: CenterTableRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const status = row.retiredAt === null ? "active" : "retired";
  return `${row.name} ${status}`.toLowerCase().includes(normalizedQuery);
}

export function CentersTable({
  canConfigureCenters,
  canManageRegistrationControls,
  data,
  emptyMessage,
  isLoading,
  onDelete,
  onEdit,
  onRegistrationControls,
  onRetire,
  onView,
  toolbarActions,
}: {
  canConfigureCenters: boolean;
  canManageRegistrationControls: boolean;
  data: CenterTableRow[];
  emptyMessage: string;
  isLoading: boolean;
  onDelete: (center: CenterListItem) => void;
  onEdit: (center: CenterListItem) => void;
  onRegistrationControls: (center: CenterListItem) => void;
  onRetire: (center: CenterListItem) => void;
  onView: (center: CenterTableRow) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: DataGridColumnDef<CenterTableRow>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="font-medium text-sm" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 220,
    },
    {
      accessorFn: (row) => (row.retiredAt === null ? "Active" : "Retired"),
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
      size: 110,
    },
    {
      accessorKey: "studentRegistrationEnabled",
      cell: ({ row }) => (
        <RegistrationStatus enabled={row.original.studentRegistrationEnabled} />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student registration"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Student registration",
        skeleton: SKELETON_REGISTRATION,
      },
      size: 180,
    },
    {
      accessorKey: "competitionEntryRegistrationEnabled",
      cell: ({ row }) => (
        <RegistrationStatus
          enabled={row.original.competitionEntryRegistrationEnabled}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participation registration"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Participation registration",
        skeleton: SKELETON_REGISTRATION,
      },
      size: 210,
    },
    {
      accessorKey: "guardianCount",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.guardianCount ?? "Not available"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Guardians"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Guardians", skeleton: SKELETON_COUNT },
      size: 110,
    },
    {
      accessorKey: "liaisonCount",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.liaisonCount ?? "Not available"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Liaisons"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Liaisons", skeleton: SKELETON_COUNT },
      size: 100,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canConfigureCenters={canConfigureCenters}
          canManageRegistrationControls={canManageRegistrationControls}
          center={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
          onRegistrationControls={onRegistrationControls}
          onRetire={onRetire}
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
  const getRowId = useEventCallback((row: CenterTableRow) => row.id);
  const handleRowClick = useEventCallback((row: CenterTableRow) => onView(row));

  return (
    <DataTableWrapper<CenterTableRow>
      columns={columns}
      data={data}
      emptyMessage={emptyMessage}
      filter={{
        fields: createCenterFilterFields(),
        getValue: getCenterFilterValue,
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchCenter}
      searchPlaceholder="Search Centers..."
      storageKey="kalakriti_centers_table_state_v1"
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
