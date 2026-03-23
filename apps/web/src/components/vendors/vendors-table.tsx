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
import type { Vendor } from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

const STATUS_BADGE_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  approved: { label: "Approved", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
};

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_PHONE = <Skeleton className="h-5 w-28" />;
const SKELETON_EMAIL = <Skeleton className="h-5 w-36" />;
const SKELETON_BANK = <Skeleton className="h-5 w-44" />;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;

function RowActions({
  onEdit,
  onRequestDelete,
}: {
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
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
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRequestDelete} variant="destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchVendor(row: Vendor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.contactPhone, row.contactEmail ?? "", row.status]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface VendorsTableProps {
  data: Vendor[];
  isLoading?: boolean;
  onDelete: (id: string) => Promise<{ type: string }>;
  onEdit: (vendor: Vendor) => void;
  toolbarActions?: ReactNode;
}

export function VendorsTable({
  data,
  isLoading,
  onDelete,
  onEdit,
  toolbarActions,
}: VendorsTableProps) {
  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      const res = await onDelete(id);
      return res;
    },
    onError: () => toast.error("Failed to delete vendor"),
  });

  const columns = useMemo<ColumnDef<Vendor>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Name"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-sm">{row.original.name}</span>
        ),
        meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
        size: 200,
      },
      {
        id: "contactPhone",
        accessorFn: (row) => row.contactPhone,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Phone"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.contactPhone}</span>
        ),
        meta: { headerTitle: "Phone", skeleton: SKELETON_PHONE },
        size: 150,
      },
      {
        id: "contactEmail",
        accessorFn: (row) => row.contactEmail,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Email"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.contactEmail ?? "—"}
          </span>
        ),
        meta: { headerTitle: "Email", skeleton: SKELETON_EMAIL },
        size: 200,
      },
      {
        id: "bankAccount",
        accessorFn: (row) => row.bankAccountName,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Bank Account"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.bankAccountName} (••••
            {row.original.bankAccountNumber.length >= 4
              ? row.original.bankAccountNumber.slice(-4)
              : row.original.bankAccountNumber}
            )
          </span>
        ),
        meta: { headerTitle: "Bank Account", skeleton: SKELETON_BANK },
        size: 220,
      },
      {
        id: "status",
        accessorFn: (row) => row.status,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Status"
            visibility={true}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status ?? "pending";
          const badge = STATUS_BADGE_MAP[status] ?? {
            label: status,
            variant: "secondary" as const,
          };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
        meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
        size: 120,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            onEdit={() => onEdit(row.original)}
            onRequestDelete={() => deleteAction.trigger(row.original.id)}
          />
        ),
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        enableColumnOrdering: false,
        meta: { cellClassName: "text-center" },
        size: 52,
        minSize: 52,
      },
    ],
    [onEdit, deleteAction.trigger]
  );

  return (
    <>
      <DataTableWrapper<Vendor>
        columns={columns}
        data={data}
        emptyMessage="No vendors found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        searchFn={searchVendor}
        searchPlaceholder="Search vendors..."
        storageKey="vendors_table_state_v1"
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
        description="This will permanently delete this vendor. This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete vendor"
      />
    </>
  );
}
