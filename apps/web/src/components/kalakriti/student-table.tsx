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
  type CenterScanStudent,
  getKalakritiStudentTransportLabel,
} from "@pi-dash/zero/kalakriti-center-scan-rules";
import { format } from "date-fns";
import { useCallback, useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createStudentFilterFields,
  getStudentFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${student.name}`}
            className="size-7"
            data-testid="row-actions"
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
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={handleView}>View details</DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canDelete}
              onClick={handleDelete}
              variant="destructive"
            >
              {canDelete ? "Delete" : "Delete (Entries locked)"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
  onRegister: () => void;
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
  onRegister,
  onView,
}: StudentTableProps) {
  const { labels, pending } = useTransportStatusSnapshot({
    data,
    scopeKey: statusSnapshotKey,
    complete: statusSnapshotComplete,
    getStatus: studentTransportLabel,
  });
  const getFilterValue = useCallback(
    (row: StudentTableRow, path: string[]) =>
      getStudentFilterValue(row, path, labels),
    [labels]
  );
  const filterFields = useMemo(
    () => createStudentFilterFields(data, centers),
    [data, centers]
  );
  const columns: DataGridColumnDef<StudentTableRow>[] = [
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
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
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
        headerTitle: "Student",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 230,
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
          <Badge variant="secondary">{labels.get(row.original.id)}</Badge>
        ) : (
          <Skeleton
            aria-label="Loading transport status"
            className="h-5 w-28"
          />
        ),
      meta: {
        headerTitle: "Transport status",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 170,
    },
    {
      accessorFn: (row) => row.dateOfBirth,
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.dateOfBirth), "dd MMM yyyy")}
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
      toolbarActions={
        canManage ? (
          <Button onClick={onRegister}>Register Student</Button>
        ) : null
      }
    />
  );
}
