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
import { formatEnumLabel } from "@pi-dash/shared/constants";
import type {
  Center,
  CenterCoordinator,
  Student,
  User,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export type CenterRow = Center & {
  coordinators: readonly (CenterCoordinator & { user: User | undefined })[];
  students: readonly Student[];
};

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_CITY = <Skeleton className="h-5 w-24" />;
const SKELETON_ADDRESS = <Skeleton className="h-5 w-48" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-12" />;

function RowActions({
  canDelete,
  id,
  onNavigate,
  onRequestDelete,
}: {
  canDelete: boolean;
  id: string;
  onNavigate: (id: string) => void;
  onRequestDelete: () => void;
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
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRequestDelete} variant="destructive">
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchCenter(row: CenterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.city ?? "", row.address ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface CentersTableProps {
  data: CenterRow[];
  isLoading?: boolean;
  onDelete: (id: string) => Promise<void>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
}

export function CentersTable({
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
}: CentersTableProps) {
  const { hasPermission } = useApp();
  const canDeleteCenter = hasPermission("centers.manage");

  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      await onDelete(id);
      return { type: "ok" };
    },
    onError: () => toast.error("Couldn't delete center"),
  });

  const columns: ColumnDef<CenterRow>[] = [
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
      id: "city",
      accessorFn: (row) => row.city,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.city ? formatEnumLabel(row.original.city) : "—"}
        </span>
      ),
      meta: { headerTitle: "City", skeleton: SKELETON_CITY },
      size: 120,
    },
    {
      id: "address",
      accessorFn: (row) => row.address,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Address"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.address || "—"}
        </span>
      ),
      meta: { headerTitle: "Address", skeleton: SKELETON_ADDRESS },
      size: 280,
    },
    {
      id: "coordinators",
      accessorFn: (row) => row.coordinators.length,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Coordinators"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.coordinators.length}</span>
      ),
      meta: { headerTitle: "Coordinators", skeleton: SKELETON_COUNT },
      size: 100,
    },
    {
      id: "students",
      accessorFn: (row) => row.students.length,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Students"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.students.length}</span>
      ),
      meta: { headerTitle: "Students", skeleton: SKELETON_COUNT },
      size: 100,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RowActions
          canDelete={canDeleteCenter}
          id={row.original.id}
          onNavigate={onNavigate}
          onRequestDelete={() => deleteAction.trigger(row.original.id)}
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
      <DataTableWrapper<CenterRow>
        columns={columns}
        data={data}
        emptyMessage="No centers found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        onRowClick={(row) => onNavigate(row.id)}
        searchFn={searchCenter}
        searchPlaceholder="Search centers..."
        storageKey="centers_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsVisibility: true,
          columnsPinnable: true,
        }}
        toolbarActions={toolbarActions}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete this center. This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete center"
      />
    </>
  );
}
