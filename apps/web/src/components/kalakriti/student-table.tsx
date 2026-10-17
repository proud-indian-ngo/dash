import { Delete02Icon, Edit02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type CenterScanStudent,
  getKalakritiStudentTransportLabel,
} from "@pi-dash/zero/kalakriti-center-scan-rules";
import { format } from "date-fns";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createStudentFilterFields,
  getStudentFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { DATE } from "@/lib/date-formats";
import type { StudentCenterPermissions } from "@/lib/kalakriti-student-directory";
import { canDeleteKalakritiStudent } from "@/lib/kalakriti-student-policy";

import type { KalakritiStudentRow } from "./student-form-dialog";
import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

export interface StudentTableRow extends KalakritiStudentRow {
  operations?: CenterScanStudent["operations"];
}

function searchStudents(row: StudentTableRow, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    row.humanId,
    row.name,
    row.gender,
    row.ageCategory?.name,
    row.center?.name,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function StudentRowActions({
  canManage,
  entryRegistrationEnabled,
  onView,
  onDelete,
  onEdit,
  student,
}: {
  canManage: boolean;
  onView: (student: KalakritiStudentRow) => void;
  entryRegistrationEnabled: boolean;
  onDelete: (student: KalakritiStudentRow) => void;
  onEdit: (student: KalakritiStudentRow) => void;
  student: KalakritiStudentRow;
}) {
  const handleView = useEventCallback(() => onView(student));
  const handleEdit = useEventCallback(() => onEdit(student));
  const handleDelete = useEventCallback(() => onDelete(student));
  const canDelete = canDeleteKalakritiStudent({
    entryCount: student.entryMemberships?.length ?? 0,
    entryRegistrationEnabled,
  });
  return (
    <ResponsiveActionMenu
      title={`${student.name} actions`}
      trigger={<RowActionsButton aria-label={`Actions for ${student.name}`} />}
      actions={[
        {
          id: "view",
          icon: ViewIcon,
          label: "View details",
          onSelect: handleView,
        },
        canManage && {
          id: "edit",
          icon: Edit02Icon,
          label: "Edit",
          onSelect: handleEdit,
          group: "manage",
        },
        canManage && {
          id: "delete",
          icon: Delete02Icon,
          label: canDelete ? "Delete" : "Delete (Entries locked)",
          onSelect: handleDelete,
          disabled: !canDelete,
          destructive: true,
          group: "delete",
        },
      ]}
    />
  );
}

interface StudentTableProps {
  centers?: readonly { id: string; name: string }[];
  centerPermissions?: Record<string, StudentCenterPermissions>;
  canManage: boolean;
  data: StudentTableRow[];
  statusSnapshotComplete: boolean;
  statusSnapshotKey: string;
  entryRegistrationEnabled: boolean;
  isLoading: boolean;
  onDelete: (student: KalakritiStudentRow) => void;
  onEdit: (student: KalakritiStudentRow) => void;
  onView: (student: KalakritiStudentRow) => void;
}

function getStudentRowId(student: KalakritiStudentRow): string {
  return student.id;
}

function studentTransportLabel(row: StudentTableRow) {
  return getKalakritiStudentTransportLabel(row.operations ?? []);
}

export function StudentTable({
  centers = [],
  centerPermissions,
  canManage,
  data,
  statusSnapshotComplete,
  statusSnapshotKey,
  entryRegistrationEnabled,
  isLoading,
  onDelete,
  onEdit,
  onView,
}: StudentTableProps) {
  const { labels, pending } = useTransportStatusSnapshot({
    data,
    scopeKey: statusSnapshotKey,
    complete: statusSnapshotComplete,
    getStatus: studentTransportLabel,
  });
  const getFilterValue = (row: StudentTableRow, path: string[]) =>
    getStudentFilterValue(row, path, labels);
  const filterFields = createStudentFilterFields(data, centers);
  const columns: DataGridColumnDef<StudentTableRow>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="text-sm font-medium" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student"
          visibility={true}
        />
      ),
      id: "name",
      meta: {
        compact: "primary",
        headerTitle: "Student",
        icon: COLUMN_ICONS.student,
        kind: "person",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 250,
    },
    {
      id: "center",
      accessorFn: (row) =>
        row.center?.name ??
        centers.find((center) => center.id === row.centerId)?.name ??
        "—",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Center"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Center",
        icon: COLUMN_ICONS.center,
        kind: "text",
        compact: "primary",
        skeleton: <Skeleton className="h-5 w-32" />,
      },
      size: 180,
    },
    {
      accessorFn: (row) => row.humanId,
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.humanId}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="ID" visibility={true} />
      ),
      id: "humanId",
      meta: {
        headerTitle: "ID",
        kind: "id",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 130,
    },
    {
      id: "transportStatus",
      accessorFn: (row) => labels?.get(row.id),
      enableSorting: !pending,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Transport status"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        labels?.has(row.original.id) ? (
          <StatusBadge tone="info">{labels.get(row.original.id)}</StatusBadge>
        ) : (
          <Skeleton
            aria-label="Loading transport status"
            className="h-5 w-28"
          />
        ),
      meta: {
        compact: "primary",
        headerTitle: "Transport status",
        icon: COLUMN_ICONS.transport,
        kind: "status",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 170,
    },
    {
      accessorFn: (row) => row.dateOfBirth,
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.dateOfBirth), DATE)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Date of birth"
          visibility={true}
        />
      ),
      id: "dateOfBirth",
      meta: {
        headerTitle: "Date of birth",
        icon: COLUMN_ICONS.dateOfBirth,
        kind: "date",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 155,
    },
    {
      accessorFn: (row) => row.gender,
      cell: ({ row }) => (
        <span className="text-sm capitalize">{row.original.gender}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Gender"
          visibility={true}
        />
      ),
      id: "gender",
      meta: {
        headerTitle: "Gender",
        icon: COLUMN_ICONS.gender,
        kind: "tag",
        skeleton: <Skeleton className="h-5 w-16" />,
      },
      size: 110,
    },
    {
      accessorFn: (row) => row.ageCategory?.name ?? "",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.ageCategory?.name ?? "Unassigned"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      id: "ageCategory",
      meta: {
        headerTitle: "Age Category",
        icon: COLUMN_ICONS.ageCategory,
        kind: "tag",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 160,
    },
    {
      cell: ({ row }) => (
        <StudentRowActions
          canManage={
            centerPermissions
              ? centerPermissions[row.original.centerId]?.canManage === true
              : canManage
          }
          onView={onView}
          entryRegistrationEnabled={
            centerPermissions
              ? centerPermissions[row.original.centerId]
                  ?.entryRegistrationEnabled === true
              : entryRegistrationEnabled
          }
          onDelete={onDelete}
          onEdit={onEdit}
          student={row.original}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: () => null,
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: <Skeleton className="size-7" />,
        stopRowClick: true,
      },
      size: 52,
    },
  ];

  return (
    <DataTableWrapper
      columns={columns}
      data={data}
      emptyMessage="No Students match the current filters."
      compactOnMobile
      filter={{
        fields: filterFields,
        getValue: getFilterValue,
      }}
      getRowId={getStudentRowId}
      isLoading={isLoading}
      onRowClick={onView}
      searchFn={searchStudents}
      searchPlaceholder="Search Students..."
      storageKey="kalakriti_students_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
