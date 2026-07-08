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
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
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
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onApprove?: (vendor: VendorRow) => void;
  onClearFilters?: () => void;
  onDelete: (id: string) => Promise<{ type: string }>;
  onEdit: (vendor: VendorRow) => void;
  onUnapprove?: (vendor: VendorRow) => void;
  onView: (vendor: VendorRow) => void;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
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
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: VendorsTableProps) {
  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      const res = await onDelete(id);
      return res;
    },
    onError: () => toast.error("Couldn't delete vendor"),
  });

  const columns: ColumnDef<VendorRow>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="truncate font-medium text-sm">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      accessorFn: (row) => row.contactPhone,
      cell: ({ row }) => (
        <span className="truncate text-sm">{row.original.contactPhone}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Phone" visibility={true} />
      ),
      id: "contactPhone",
      meta: { headerTitle: "Phone", skeleton: SKELETON_PHONE },
      size: 150,
    },
    {
      accessorFn: (row) => row.contactEmail,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.contactEmail ?? "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Email" visibility={true} />
      ),
      id: "contactEmail",
      meta: { headerTitle: "Email", skeleton: SKELETON_EMAIL },
      size: 200,
    },
    {
      accessorFn: (row) => row.bankAccountName,
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {row.original.bankAccountName} (••••
          {row.original.bankAccountNumber.length >= 4
            ? row.original.bankAccountNumber.slice(-4)
            : row.original.bankAccountNumber}
          )
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Bank Account"
          visibility={true}
        />
      ),
      id: "bankAccount",
      meta: { headerTitle: "Bank Account", skeleton: SKELETON_BANK },
      size: 220,
    },
    {
      accessorFn: (row) => row.pendingCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.pendingCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Pending Payments"
          visibility={true}
        />
      ),
      id: "pendingCount",
      meta: { headerTitle: "Pending Payments", skeleton: SKELETON_COUNT },
      size: 140,
    },
    {
      accessorFn: (row) => row.activeCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.activeCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Active Payments"
          visibility={true}
        />
      ),
      id: "activeCount",
      meta: { headerTitle: "Active Payments", skeleton: SKELETON_COUNT },
      size: 140,
    },
    {
      accessorFn: (row) => row.completedCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.completedCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Completed"
          visibility={true}
        />
      ),
      id: "completedCount",
      meta: { headerTitle: "Completed", skeleton: SKELETON_COUNT },
      size: 120,
    },
    {
      accessorFn: (row) => row.pendingAmount,
      cell: ({ row }) => (
        <span className="text-sm">{formatINR(row.original.pendingAmount)}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Pending Amount"
          visibility={true}
        />
      ),
      id: "pendingAmount",
      meta: { headerTitle: "Pending Amount", skeleton: SKELETON_AMOUNT },
      size: 150,
    },
    {
      accessorFn: (row) => row.activeAmount,
      cell: ({ row }) => (
        <span className="text-sm">{formatINR(row.original.activeAmount)}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Active Amount"
          visibility={true}
        />
      ),
      id: "activeAmount",
      meta: { headerTitle: "Active Amount", skeleton: SKELETON_AMOUNT },
      size: 140,
    },
    {
      accessorFn: (row) => row.completedAmount,
      cell: ({ row }) => (
        <span className="text-sm">
          {formatINR(row.original.completedAmount)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Completed Amount"
          visibility={true}
        />
      ),
      id: "completedAmount",
      meta: { headerTitle: "Completed Amount", skeleton: SKELETON_AMOUNT },
      size: 160,
    },
    {
      accessorFn: (row) => row.rejectedCount,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.rejectedCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Rejected Payments"
          visibility={true}
        />
      ),
      id: "rejectedCount",
      meta: { headerTitle: "Rejected Payments", skeleton: SKELETON_COUNT },
      size: 150,
    },
    {
      accessorFn: (row) => row.rejectedAmount,
      cell: ({ row }) => (
        <span className="text-sm">
          {formatINR(row.original.rejectedAmount)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Rejected Amount"
          visibility={true}
        />
      ),
      id: "rejectedAmount",
      meta: { headerTitle: "Rejected Amount", skeleton: SKELETON_AMOUNT },
      size: 150,
    },
    {
      accessorFn: (row) => row.status,
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
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 120,
    },
    {
      cell: ({ row }) => (
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
      ),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: { cellClassName: "text-center", stopRowClick: true },
      minSize: 52,
      size: 52,
    },
  ];
  const stableGetRowId1 = useEventCallback((row: { id: string }) => row.id);
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <>
      <DataTableWrapper<VendorRow>
        columns={columns}
        data={data}
        defaultColumnVisibility={{
          activeAmount: false,
          activeCount: false,
          completedAmount: false,
          completedCount: false,
          rejectedAmount: false,
          rejectedCount: false,
        }}
        emptyMessage="No vendors found."
        getRowId={stableGetRowId1}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={onView}
        searchFn={searchVendor}
        searchPlaceholder="Search vendors..."
        storageKey="vendors_table_state_v3"
        tableLayout={{
          columnsDraggable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={toolbarActions}
        toolbarFilters={toolbarFilters}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete this vendor. This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={stableOnOpenChange2}
        open={deleteAction.isOpen}
        title="Delete vendor"
      />
    </>
  );
}
