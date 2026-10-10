import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createRoleFilterFields,
  getRoleFilterValue,
  useMigrateLegacyRoleFilterParams,
} from "@/components/roles/role-filters";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineMetaCell } from "@/components/shared/inline-meta-cell";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { Tag } from "@/components/shared/status-badge";
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
    <ResponsiveActionMenu
      title={`${role.name} actions`}
      contentClassName="w-32"
      trigger={<RowActionsButton onClick={stableOnClick0} />}
      actions={[
        {
          id: "edit",
          label: roleId === "admin" ? "View" : "Edit",
          onSelect: stableOnClick1,
        },
        !isSystem && {
          id: "delete",
          label: "Delete",
          onSelect: handleDelete,
          destructive: true,
          group: "destructive",
        },
      ]}
    />
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
  isLoading?: boolean;
  onDelete: (payload: {
    id: string;
    name: string;
  }) => Promise<{ type: "success" | "error"; error?: { message?: string } }>;
  toolbarActions?: ReactNode;
}

export function RolesTable({
  data,
  isLoading,
  onDelete,
  toolbarActions,
}: RolesTableProps) {
  useMigrateLegacyRoleFilterParams();
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

  const columns: DataGridColumnDef<RoleListItem>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <InlineMetaCell
          mono
          primary={row.original.name}
          secondary={row.original.id}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: {
        compact: "primary",
        headerTitle: "Name",
        kind: "text",
        skeleton: SKELETON_NAME,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.description ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
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
      meta: {
        headerTitle: "Description",
        kind: "text",
        skeleton: SKELETON_DESCRIPTION,
      },
      size: 280,
    },
    {
      accessorFn: (row) => (row.isSystem ? "System" : "Custom"),
      cell: ({ row }) => (
        <Tag>{row.original.isSystem ? "System" : "Custom"}</Tag>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      id: "type",
      meta: {
        compact: "primary",
        headerTitle: "Type",
        kind: "tag",
        skeleton: SKELETON_TYPE,
      },
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
      meta: {
        headerTitle: "Permissions",
        kind: "count",
        skeleton: SKELETON_COUNT,
      },
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
      meta: { headerTitle: "Users", kind: "count", skeleton: SKELETON_COUNT },
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
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      maxSize: 52,
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
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
        compactOnMobile
        filter={{
          fields: createRoleFilterFields(),
          getValue: getRoleFilterValue,
        }}
        getRowId={stableGetRowId2}
        isLoading={isLoading}
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
