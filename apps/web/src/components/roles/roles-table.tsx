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
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { RoleListItem } from "@/functions/role-admin";
import { useConfirmAction } from "@/hooks/use-confirm-action";

const SKELETON_NAME = <Skeleton className="h-5 w-32" />;
const SKELETON_DESCRIPTION = <Skeleton className="h-5 w-48" />;
const SKELETON_TYPE = <Skeleton className="h-6 w-16" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-8" />;
const SKELETON_ACTIONS = <Skeleton className="size-7" />;

function RowActions({
  isSystem,
  onRequestDelete,
  roleId,
}: {
  isSystem: boolean;
  onRequestDelete: () => void;
  roleId: string;
}) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
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
        <DropdownMenuItem
          onClick={() =>
            navigate({
              to: "/settings/roles/$roleId",
              params: { roleId },
            })
          }
        >
          {roleId === "admin" ? "View" : "Edit"}
        </DropdownMenuItem>
        {!isSystem && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRequestDelete} variant="destructive">
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchRole(row: RoleListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.id, row.description ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface RolesTableProps {
  data: RoleListItem[];
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onClearFilters?: () => void;
  onDelete: (payload: {
    id: string;
    name: string;
  }) => Promise<{ type: "success" | "error"; error?: { message?: string } }>;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

export function RolesTable({
  data,
  isLoading,
  onDelete,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: RolesTableProps) {
  const navigate = useNavigate();
  const deleteAction = useConfirmAction<{ id: string; name: string }>({
    onConfirm: (payload) => onDelete(payload),
    onSuccess: () => toast.success("Role deleted"),
    onError: (msg) => toast.error(msg ?? "Failed to delete role"),
  });

  const columns: ColumnDef<RoleListItem>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">
            {row.original.name}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {row.original.id}
          </div>
        </div>
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      id: "description",
      accessorFn: (row) => row.description ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Description"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.description || "\u2014"}
        </span>
      ),
      meta: { headerTitle: "Description", skeleton: SKELETON_DESCRIPTION },
      size: 280,
    },
    {
      id: "type",
      accessorFn: (row) => (row.isSystem ? "System" : "Custom"),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      cell: ({ row }) =>
        row.original.isSystem ? (
          <Badge variant="info-light">System</Badge>
        ) : (
          <Badge variant="success-light">Custom</Badge>
        ),
      meta: { headerTitle: "Type", skeleton: SKELETON_TYPE },
      size: 110,
    },
    {
      id: "permissionCount",
      accessorFn: (row) => row.permissionCount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Permissions"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.permissionCount}</span>
      ),
      meta: { headerTitle: "Permissions", skeleton: SKELETON_COUNT },
      size: 130,
    },
    {
      id: "userCount",
      accessorFn: (row) => row.userCount,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Users" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.userCount}</span>
      ),
      meta: { headerTitle: "Users", skeleton: SKELETON_COUNT },
      size: 110,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RowActions
          isSystem={row.original.isSystem}
          onRequestDelete={() =>
            deleteAction.trigger({
              id: row.original.id,
              name: row.original.name,
            })
          }
          roleId={row.original.id}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: {
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        cellClassName: "text-center",
      },
      size: 52,
      minSize: 52,
      maxSize: 52,
    },
  ];

  return (
    <>
      <DataTableWrapper<RoleListItem>
        columns={columns}
        data={data}
        emptyMessage="No roles found."
        getRowId={(row) => row.id}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={(row) =>
          navigate({
            to: "/settings/roles/$roleId",
            params: { roleId: row.id },
          })
        }
        searchFn={searchRole}
        searchPlaceholder="Search roles..."
        storageKey="roles_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsMovable: true,
          columnsVisibility: true,
          columnsPinnable: true,
        }}
        toolbarActions={toolbarActions}
        toolbarFilters={toolbarFilters}
      />
      <ConfirmDialog
        confirmLabel="Delete role"
        description={`This will permanently delete the "${deleteAction.payload?.name ?? ""}" role. The role must not be assigned to any users.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete role"
        variant="destructive"
      />
    </>
  );
}
