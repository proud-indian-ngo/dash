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
import {
  canManageKalakritiResponsibility,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createVolunteerFilterFields,
  getVolunteerFilterValue,
} from "@/components/kalakriti/kalakriti-filters";

export interface VolunteerAssignmentItem {
  centerId: string | null;
  competitionCategoryId: string | null;
  competitionId: string | null;
  id: string;
  isPrimary: boolean | null;
  responsibility: KalakritiResponsibility;
  scopeName: string | null;
}

export interface VolunteerRosterItem {
  assignments: VolunteerAssignmentItem[];
  id: string;
  snapshotEmail: string | null;
  snapshotName: string;
  snapshotPhone: string | null;
}

export interface RemoveAssignmentPayload {
  assignmentId: string;
  isFinalAssignment: boolean;
  responsibility: KalakritiResponsibility;
  volunteerName: string;
}

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_EMAIL = <Skeleton className="h-5 w-48" />;
const SKELETON_PHONE = <Skeleton className="h-5 w-28" />;
const SKELETON_ROLES = <Skeleton className="h-5 w-40" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

export function formatKalakritiVolunteerAssignment(
  assignment: Pick<
    VolunteerAssignmentItem,
    "isPrimary" | "responsibility" | "scopeName"
  >
): string {
  const label = KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility];
  const scoped = assignment.scopeName
    ? `${label} · ${assignment.scopeName}`
    : label;
  return assignment.isPrimary ? `${scoped} · Primary` : scoped;
}

function searchVolunteer(row: VolunteerRosterItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    row.snapshotName,
    row.snapshotEmail ?? "",
    row.snapshotPhone ?? "",
    ...row.assignments.map((assignment) =>
      formatKalakritiVolunteerAssignment(assignment)
    ),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function VolunteerRemoveMenuItem({
  assignment,
  isFinalAssignment,
  onRemove,
  volunteerName,
}: {
  assignment: VolunteerAssignmentItem;
  isFinalAssignment: boolean;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  volunteerName: string;
}) {
  const handleClick = useEventCallback(() => {
    onRemove({
      assignmentId: assignment.id,
      isFinalAssignment,
      responsibility: assignment.responsibility,
      volunteerName,
    });
  });

  return (
    <DropdownMenuItem onClick={handleClick} variant="destructive">
      {`Remove ${KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility]}`}
    </DropdownMenuItem>
  );
}

function RowActions({
  actorResponsibilities,
  isGlobalAdmin,
  onRemove,
  onView,
  volunteer,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  isGlobalAdmin: boolean;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  onView: (volunteer: VolunteerRosterItem) => void;
  volunteer: VolunteerRosterItem;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(volunteer));
  const removable = volunteer.assignments.filter(
    (assignment) =>
      isGlobalAdmin ||
      canManageKalakritiResponsibility(
        actorResponsibilities,
        assignment.responsibility
      )
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${volunteer.snapshotName}`}
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleView}>View details</DropdownMenuItem>
        {removable.length > 0 ? <DropdownMenuSeparator /> : null}
        {removable.map((assignment) => (
          <VolunteerRemoveMenuItem
            assignment={assignment}
            isFinalAssignment={volunteer.assignments.length === 1}
            key={assignment.id}
            onRemove={onRemove}
            volunteerName={volunteer.snapshotName}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VolunteersTable({
  actorResponsibilities,
  data,
  isGlobalAdmin,
  isLoading,
  onRemove,
  onView,
  toolbarActions,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  data: VolunteerRosterItem[];
  isGlobalAdmin: boolean;
  isLoading: boolean;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  onView: (volunteer: VolunteerRosterItem) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: DataGridColumnDef<VolunteerRosterItem>[] = [
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
      id: "snapshotName",
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
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
      id: "snapshotEmail",
      meta: { headerTitle: "Email", skeleton: SKELETON_EMAIL },
      size: 240,
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
      id: "snapshotPhone",
      meta: { headerTitle: "Phone", skeleton: SKELETON_PHONE },
      size: 150,
    },
    {
      accessorFn: (row) =>
        row.assignments
          .map((assignment) => formatKalakritiVolunteerAssignment(assignment))
          .join(", "),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.assignments.length === 0 ? (
            <span className="text-muted-foreground text-sm">None</span>
          ) : (
            row.original.assignments.map((assignment) => (
              <Badge key={assignment.id} variant="outline">
                {formatKalakritiVolunteerAssignment(assignment)}
              </Badge>
            ))
          )}
        </div>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Roles" visibility={true} />
      ),
      id: "roles",
      meta: { headerTitle: "Roles", skeleton: SKELETON_ROLES },
      size: 280,
    },
    {
      cell: ({ row }) => (
        <RowActions
          actorResponsibilities={actorResponsibilities}
          isGlobalAdmin={isGlobalAdmin}
          onRemove={onRemove}
          onView={onView}
          volunteer={row.original}
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
  const getRowId = useEventCallback((row: VolunteerRosterItem) => row.id);
  const handleRowClick = useEventCallback((row: VolunteerRosterItem) =>
    onView(row)
  );

  return (
    <DataTableWrapper<VolunteerRosterItem>
      columns={columns}
      data={data}
      emptyMessage="No central volunteers are assigned yet."
      filter={{
        fields: createVolunteerFilterFields(data),
        getValue: getVolunteerFilterValue,
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchVolunteer}
      searchPlaceholder="Search volunteers..."
      storageKey="kalakriti_volunteers_table_state_v1"
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
