import {
  Cancel01Icon,
  MoreVerticalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
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
  isKalakritiAssignableUserRole,
  KALAKRITI_RESPONSIBILITY_LABELS,
  KALAKRITI_VOLUNTEER_CHECK_IN_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import { getKalakritiFoodStatus } from "@pi-dash/zero/kalakriti-food-rules";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import {
  createVolunteerFilterFields,
  getVolunteerFilterValue,
  removeObsoleteVolunteerFilters,
} from "@/components/kalakriti/kalakriti-filters";
import { Loader } from "@/components/loader";

import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

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
  operations?: readonly {
    type: string;
    supersededByOperationId: string | null;
  }[];
  humanId?: string | null;
  registrationGroup?: string | null;
  assignments: VolunteerAssignmentItem[];
  id: string;
  snapshotEmail: string | null;
  snapshotName: string;
  snapshotPhone: string | null;
  userId: string;
  userRole: string | null;
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
    row.humanId ?? "",
    row.snapshotEmail ?? "",
    row.snapshotPhone ?? "",
    row.registrationGroup ?? "",
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
  onAssignRole,
  onRemove,
  onRemoveFromEdition,
  onView,
  volunteer,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  isGlobalAdmin: boolean;
  onAssignRole: (volunteer: VolunteerRosterItem) => void;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  onRemoveFromEdition: (volunteer: VolunteerRosterItem) => void;
  onView: (volunteer: VolunteerRosterItem) => void;
  volunteer: VolunteerRosterItem;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(volunteer));
  const handleAssignRole = useEventCallback(() => onAssignRole(volunteer));
  const handleRemoveFromEdition = useEventCallback(() =>
    onRemoveFromEdition(volunteer)
  );
  const removable = volunteer.assignments.filter(
    (assignment) =>
      isGlobalAdmin ||
      canManageKalakritiResponsibility(
        actorResponsibilities,
        assignment.responsibility
      )
  );
  const canAssignRole = isKalakritiAssignableUserRole(volunteer.userRole);

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
        {canAssignRole ? (
          <DropdownMenuItem onClick={handleAssignRole}>
            Assign role
          </DropdownMenuItem>
        ) : null}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleRemoveFromEdition}
          variant="destructive"
        >
          Remove from Edition
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function volunteerCheckInLabel(row: VolunteerRosterItem): string {
  const status = getKalakritiFoodStatus({
    kind: "volunteer",
    operations: row.operations ?? [],
  });
  return KALAKRITI_VOLUNTEER_CHECK_IN_LABELS[
    status.checkedIn ? "checked_in" : "not_checked_in"
  ];
}

export function VolunteersTable({
  actorResponsibilities,
  data,
  isGlobalAdmin,
  isLoading,
  onAssignRole,
  onRemove,
  onRemoveFromEdition,
  onView,
  toolbarActions,
  statusSnapshotComplete = false,
  statusSnapshotKey = "",
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  data: VolunteerRosterItem[];
  isGlobalAdmin: boolean;
  isLoading: boolean;
  onAssignRole: (volunteer: VolunteerRosterItem) => void;
  onRemove: (payload: RemoveAssignmentPayload) => void;
  onRemoveFromEdition: (volunteer: VolunteerRosterItem) => void;
  onView: (volunteer: VolunteerRosterItem) => void;
  toolbarActions?: ReactNode;
  statusSnapshotComplete?: boolean;
  statusSnapshotKey?: string;
}) {
  const { labels, pending } = useTransportStatusSnapshot({
    data,
    scopeKey: statusSnapshotKey,
    complete: statusSnapshotComplete,
    getStatus: volunteerCheckInLabel,
  });
  const getFilterValue = useCallback(
    (row: VolunteerRosterItem, path: string[]) =>
      getVolunteerFilterValue(row, path, labels),
    [labels]
  );
  const columns: DataGridColumnDef<VolunteerRosterItem>[] = [
    {
      accessorKey: "snapshotName",
      cell: ({ row }) => (
        <span className="text-sm font-medium" data-testid="row-title">
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
      accessorKey: "humanId",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.humanId ?? "—"}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Yearly ID"
          visibility={true}
        />
      ),
      id: "humanId",
      meta: { headerTitle: "Yearly ID", skeleton: SKELETON_NAME },
      size: 190,
    },
    {
      id: "checkInStatus",
      accessorFn: (row) => labels?.get(row.id),
      enableSorting: !pending,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Checked in"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const label = labels?.get(row.original.id);
        if (!label) return SKELETON_NAME;
        const checkedIn =
          label === KALAKRITI_VOLUNTEER_CHECK_IN_LABELS.checked_in;
        return (
          <span
            role="img"
            aria-label={label}
            title={label}
            className={
              checkedIn
                ? "inline-flex text-green-600 dark:text-green-400"
                : "inline-flex text-red-600 dark:text-red-400"
            }
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={checkedIn ? Tick02Icon : Cancel01Icon}
              className="size-5"
              strokeWidth={2}
            />
          </span>
        );
      },
      meta: { headerTitle: "Checked in", skeleton: SKELETON_NAME },
      size: 170,
    },
    {
      accessorFn: (row) => row.registrationGroup ?? "—",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Group" visibility={true} />
      ),
      id: "registrationGroup",
      meta: { headerTitle: "Group", skeleton: SKELETON_NAME },
      size: 160,
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
            <Badge variant="secondary">Unassigned</Badge>
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
          onAssignRole={onAssignRole}
          onRemove={onRemove}
          onRemoveFromEdition={onRemoveFromEdition}
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

  const { query, setQuery } = useDataTableFilters();
  const normalizedQuery = useMemo(
    () => removeObsoleteVolunteerFilters(query),
    [query]
  );
  const needsFilterMigration =
    JSON.stringify(query) !== JSON.stringify(normalizedQuery);
  useEffect(() => {
    if (needsFilterMigration) setQuery(normalizedQuery);
  }, [needsFilterMigration, normalizedQuery, setQuery]);
  if (needsFilterMigration) return <Loader />;

  return (
    <DataTableWrapper<VolunteerRosterItem>
      columns={columns}
      data={data}
      defaultColumnVisibility={{
        registrationGroup: false,
      }}
      emptyMessage="No volunteers on this Edition yet."
      filter={{
        fields: createVolunteerFilterFields(data),
        getValue: getFilterValue,
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
