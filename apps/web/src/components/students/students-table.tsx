import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
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
import type {
  Center,
  ClassEventStudent,
  Student,
  TeamEvent,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export type StudentRow = Student & {
  center: Center | undefined;
  classEvents: ReadonlyArray<
    ClassEventStudent & { event: TeamEvent | undefined }
  >;
};

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_CENTER = <Skeleton className="h-5 w-32" />;
const SKELETON_CITY = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-20" />;

function RowActions({
  canDeactivate,
  id,
  isActive,
  onNavigate,
  onRequestDeactivate,
}: {
  canDeactivate: boolean;
  id: string;
  isActive: boolean;
  onNavigate: (id: string) => void;
  onRequestDeactivate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
            data-testid="row-actions"
            onClick={(e) => e.stopPropagation()}
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
        <DropdownMenuItem onClick={() => onNavigate(id)}>View</DropdownMenuItem>
        {canDeactivate && isActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onRequestDeactivate}
              variant="destructive"
            >
              Deactivate
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchStudent(row: StudentRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.center?.name ?? ""].join(" ").toLowerCase().includes(q);
}

interface StudentsTableProps {
  data: StudentRow[];
  isLoading?: boolean;
  onDeactivate: (id: string) => Promise<void>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
}

export function StudentsTable({
  data,
  isLoading,
  onDeactivate,
  onNavigate,
  toolbarActions,
}: StudentsTableProps) {
  const { hasPermission } = useApp();
  const canDeactivateStudent = hasPermission("students.manage");

  const deactivateAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      await onDeactivate(id);
      return { type: "ok" };
    },
    onError: () => toast.error("Couldn't deactivate student"),
  });

  const columns: ColumnDef<StudentRow>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      cell: ({ row }) => (
        <button
          className="truncate text-left font-medium text-sm hover:underline"
          data-testid="row-title"
          onClick={() => onNavigate(row.original.id)}
          type="button"
        >
          {row.original.name}
        </button>
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      id: "center",
      accessorFn: (row) => row.center?.name,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Center"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.center?.name || "—"}
        </span>
      ),
      meta: { headerTitle: "Center", skeleton: SKELETON_CENTER },
      size: 180,
    },
    {
      id: "city",
      accessorFn: (row) => row.city,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm capitalize">
          {row.original.city}
        </span>
      ),
      meta: { headerTitle: "City", skeleton: SKELETON_CITY },
      size: 120,
    },
    {
      id: "status",
      accessorFn: (row) => row.isActive ?? true,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <Badge
          variant={(row.original.isActive ?? true) ? "default" : "secondary"}
        >
          {(row.original.isActive ?? true) ? "Active" : "Inactive"}
        </Badge>
      ),
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 100,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RowActions
          canDeactivate={canDeactivateStudent}
          id={row.original.id}
          isActive={row.original.isActive ?? true}
          onNavigate={onNavigate}
          onRequestDeactivate={() => deactivateAction.trigger(row.original.id)}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: { cellClassName: "text-center", stopRowClick: true },
      size: 52,
      minSize: 52,
    },
  ];

  return (
    <>
      <DataTableWrapper<StudentRow>
        columns={columns}
        data={data}
        emptyMessage="No students found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        onRowClick={(row) => onNavigate(row.id)}
        searchFn={searchStudent}
        searchPlaceholder="Search students..."
        storageKey="students_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsVisibility: true,
          columnsPinnable: true,
        }}
        toolbarActions={toolbarActions}
      />
      <ConfirmDialog
        confirmLabel="Deactivate"
        description="This student will be marked as inactive. This action can be undone by editing the student."
        loading={deactivateAction.isLoading}
        loadingLabel="Deactivating..."
        onConfirm={deactivateAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deactivateAction.cancel();
          }
        }}
        open={deactivateAction.isOpen}
        title="Deactivate student"
      />
    </>
  );
}
