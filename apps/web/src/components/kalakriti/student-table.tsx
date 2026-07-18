import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
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
import { format } from "date-fns";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import type { KalakritiStudentRow } from "./student-form-dialog";

function searchStudents(row: KalakritiStudentRow, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [row.humanId, row.name, row.gender, row.ageCategory?.name]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function StudentRowActions({
  onDelete,
  onEdit,
  student,
}: {
  onDelete: (student: KalakritiStudentRow) => void;
  onEdit: (student: KalakritiStudentRow) => void;
  student: KalakritiStudentRow;
}) {
  const handleEdit = useEventCallback(() => onEdit(student));
  const handleDelete = useEventCallback(() => onDelete(student));
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
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} variant="destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface StudentTableProps {
  canManage: boolean;
  data: KalakritiStudentRow[];
  isLoading: boolean;
  onDelete: (student: KalakritiStudentRow) => void;
  onEdit: (student: KalakritiStudentRow) => void;
  onRegister: () => void;
}

function getStudentRowId(student: KalakritiStudentRow): string {
  return student.id;
}

export function StudentTable({
  canManage,
  data,
  isLoading,
  onDelete,
  onEdit,
  onRegister,
}: StudentTableProps) {
  const columns = useMemo<ColumnDef<KalakritiStudentRow>[]>(
    () => [
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
          <span className="font-medium text-sm">{row.original.name}</span>
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
      ...(canManage
        ? [
            {
              cell: ({ row }: { row: { original: KalakritiStudentRow } }) => (
                <StudentRowActions
                  onDelete={onDelete}
                  onEdit={onEdit}
                  student={row.original}
                />
              ),
              enableHiding: false,
              header: () => null,
              id: "actions",
              meta: {
                headerTitle: "",
                skeleton: <Skeleton className="size-7" />,
              },
              size: 48,
            } satisfies ColumnDef<KalakritiStudentRow>,
          ]
        : []),
    ],
    [canManage, onDelete, onEdit]
  );

  return (
    <DataTableWrapper
      columns={columns}
      data={data}
      emptyMessage="No Students have been registered for this Center."
      getRowId={getStudentRowId}
      isLoading={isLoading}
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
