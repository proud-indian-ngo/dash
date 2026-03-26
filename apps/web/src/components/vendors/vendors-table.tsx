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
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { formatINR } from "@/lib/form-schemas";
import type { VendorRow } from "@/lib/vendor-types";

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
const SKELETON_COUNT = <Skeleton className="h-5 w-8" />;
const SKELETON_AMOUNT = <Skeleton className="h-5 w-24" />;

function RowActions({
  onApprove,
  onEdit,
  onRequestDelete,
  onUnapprove,
  onView,
  status,
}: {
  onApprove?: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onUnapprove?: () => void;
  onView: () => void;
  status: string;
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
        <DropdownMenuItem onClick={onView}>View</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        {onApprove && status === "pending" && (
          <DropdownMenuItem onClick={onApprove}>Approve</DropdownMenuItem>
        )}
        {onUnapprove && status === "approved" && (
          <DropdownMenuItem onClick={onUnapprove}>Unapprove</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRequestDelete} variant="destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchVendor(row: VendorRow, query: string): boolean {
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
  data: VendorRow[];
  isLoading?: boolean;
  onApprove?: (vendor: VendorRow) => void;
  onDelete: (id: string) => Promise<{ type: string }>;
  onEdit: (vendor: VendorRow) => void;
  onUnapprove?: (vendor: VendorRow) => void;
  onView: (vendor: VendorRow) => void;
  toolbarActions?: ReactNode;
}

export function VendorsTable({
  data,
  isLoading,
  onApprove,
  onDelete,
  onEdit,
  onUnapprove,
  onView,
  toolbarActions,
}: VendorsTableProps) {
  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      const res = await onDelete(id);
      return res;
    },
    onError: () => toast.error("Failed to delete vendor"),
  });

  const columns: ColumnDef<VendorRow>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate font-medium text-sm">
          {row.original.name}
        </span>
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      id: "contactPhone",
      accessorFn: (row) => row.contactPhone,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Phone" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">{row.original.contactPhone}</span>
      ),
      meta: { headerTitle: "Phone", skeleton: SKELETON_PHONE },
      size: 150,
    },
    {
      id: "contactEmail",
      accessorFn: (row) => row.contactEmail,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Email" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
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
        <span className="truncate text-sm">
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
      id: "pendingCount",
      accessorFn: (row) => row.pendingCount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Pending Payments"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.pendingCount}</span>
      ),
      meta: { headerTitle: "Pending Payments", skeleton: SKELETON_COUNT },
      size: 140,
    },
    {
      id: "approvedCount",
      accessorFn: (row) => row.approvedCount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Approved Payments"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.approvedCount}</span>
      ),
      meta: { headerTitle: "Approved Payments", skeleton: SKELETON_COUNT },
      size: 160,
    },
    {
      id: "pendingAmount",
      accessorFn: (row) => row.pendingAmount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Pending Amount"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{formatINR(row.original.pendingAmount)}</span>
      ),
      meta: { headerTitle: "Pending Amount", skeleton: SKELETON_AMOUNT },
      size: 150,
    },
    {
      id: "approvedAmount",
      accessorFn: (row) => row.approvedAmount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Approved Amount"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {formatINR(row.original.approvedAmount)}
        </span>
      ),
      meta: { headerTitle: "Approved Amount", skeleton: SKELETON_AMOUNT },
      size: 160,
    },
    {
      id: "rejectedCount",
      accessorFn: (row) => row.rejectedCount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Rejected Payments"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.rejectedCount}</span>
      ),
      meta: { headerTitle: "Rejected Payments", skeleton: SKELETON_COUNT },
      size: 150,
    },
    {
      id: "rejectedAmount",
      accessorFn: (row) => row.rejectedAmount,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Rejected Amount"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {formatINR(row.original.rejectedAmount)}
        </span>
      ),
      meta: { headerTitle: "Rejected Amount", skeleton: SKELETON_AMOUNT },
      size: 150,
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
        return (
          <Badge className="max-w-full shrink truncate" variant={badge.variant}>
            <span className="truncate">{badge.label}</span>
          </Badge>
        );
      },
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation wrapper prevents row click when interacting with actions
        // biome-ignore lint/a11y/noStaticElementInteractions: same as above
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same as above
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            onApprove={onApprove ? () => onApprove(row.original) : undefined}
            onEdit={() => onEdit(row.original)}
            onRequestDelete={() => deleteAction.trigger(row.original.id)}
            onUnapprove={
              onUnapprove ? () => onUnapprove(row.original) : undefined
            }
            onView={() => onView(row.original)}
            status={row.original.status ?? "pending"}
          />
        </div>
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: { cellClassName: "text-center" },
      size: 52,
      minSize: 52,
    },
  ];

  return (
    <>
      <DataTableWrapper<VendorRow>
        columns={columns}
        data={data}
        defaultColumnVisibility={{
          approvedCount: false,
          approvedAmount: false,
          rejectedCount: false,
          rejectedAmount: false,
        }}
        emptyMessage="No vendors found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        onRowClick={onView}
        searchFn={searchVendor}
        searchPlaceholder="Search vendors..."
        storageKey="vendors_table_state_v2"
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
