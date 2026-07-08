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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
  role,
  roleId,
}: {
  isSystem: boolean;
  onRequestDelete: (role: RoleListItem) => void;
  role: RoleListItem;
  roleId: string;
}) {
  const navigate = useNavigate();
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const stableOnClick1 = useEventCallback(() =>
    navigate({
      params: { roleId },
      to: "/settings/roles/$roleId",
    })
  );
  const handleDelete = useEventCallback(() => onRequestDelete(role));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            data-testid="row-actions"
            onClick={stableOnClick0}
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
        <DropdownMenuItem onClick={stableOnClick1}>
          {roleId === "admin" ? "View" : "Edit"}
        </DropdownMenuItem>
        {!isSystem && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} variant="destructive">
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
    onError: (msg) => toast.error(msg ?? "Couldn't delete role"),
    onSuccess: () => toast.success("Role removed"),
  });
  const handleDeleteRequest = useEventCallback((role: RoleListItem) =>
    deleteAction.trigger({
      id: role.id,
      name: role.name,
    })
  );

  const columns: ColumnDef<RoleListItem>[] = [
    {
      accessorFn: (row) => row.name,
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
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      accessorFn: (row) => row.description ?? "",
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.description || "\u2014"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Description"
          visibility={true}
        />
      ),
      id: "description",
      meta: { headerTitle: "Description", skeleton: SKELETON_DESCRIPTION },
      size: 280,
    },
    {
      accessorFn: (row) => (row.isSystem ? "System" : "Custom"),
      cell: ({ row }) =>
        row.original.isSystem ? (
          <Badge variant="info-light">System</Badge>
        ) : (
          <Badge variant="success-light">Custom</Badge>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      id: "type",
      meta: { headerTitle: "Type", skeleton: SKELETON_TYPE },
      size: 110,
    },
    {
      accessorFn: (row) => row.permissionCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.permissionCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Permissions"
          visibility={true}
        />
      ),
      id: "permissionCount",
      meta: { headerTitle: "Permissions", skeleton: SKELETON_COUNT },
      size: 130,
    },
    {
      accessorFn: (row) => row.userCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.userCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Users" visibility={true} />
      ),
      id: "userCount",
      meta: { headerTitle: "Users", skeleton: SKELETON_COUNT },
      size: 110,
    },
    {
      cell: ({ row }) => (
        <RowActions
          isSystem={row.original.isSystem}
          onRequestDelete={handleDeleteRequest}
          role={row.original}
          roleId={row.original.id}
        />
      ),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      maxSize: 52,
      meta: {
        cellClassName: "text-center",
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    },
  ];
  const stableGetRowId2 = useEventCallback((row: { id: string }) => row.id);
  const stableOnRowClick3 = useEventCallback((row: { id: string }) =>
    navigate({
      params: { roleId: row.id },
      to: "/settings/roles/$roleId",
    })
  );
  const stableOnOpenChange4 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <>
      <DataTableWrapper<RoleListItem>
        columns={columns}
        data={data}
        emptyMessage="No roles found."
        getRowId={stableGetRowId2}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={stableOnRowClick3}
        searchFn={searchRole}
        searchPlaceholder="Search roles..."
        storageKey="roles_table_state_v1"
        tableLayout={{
          columnsDraggable: true,
          columnsMovable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
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
        onOpenChange={stableOnOpenChange4}
        open={deleteAction.isOpen}
        title="Delete role"
        variant="destructive"
      />
    </>
  );
}
