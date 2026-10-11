import {
  ArrowTurnBackwardIcon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Edit02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { VendorDetailSheet } from "@/components/vendors/vendor-detail-sheet";
import {
  createVendorFilterFields,
  getVendorFilterValue,
  useMigrateLegacyVendorFilterParams,
} from "@/components/vendors/vendor-filters";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { formatINR } from "@/lib/form-schemas";
import type { VendorRow } from "@/lib/vendor-types";

const TOTAL_COLUMNS = [
  "pendingAmount",
  "activeAmount",
  "completedAmount",
  "rejectedAmount",
];

const STATUS_BADGE_MAP: Record<string, { label: string; tone: StatusTone }> = {
  approved: { label: "Approved", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
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
  vendor,
  status,
}: {
  onApprove?: (vendor: VendorRow) => void;
  onEdit: (vendor: VendorRow) => void;
  onRequestDelete: (id: string) => void;
  onUnapprove?: (vendor: VendorRow) => void;
  onView: (vendor: VendorRow) => void;
  status: string;
  vendor: VendorRow;
}) {
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(vendor));
  const handleEdit = useEventCallback(() => onEdit(vendor));
  const handleApprove = useEventCallback(() => {
    if (onApprove) {
      onApprove(vendor);
    }
  });
  const handleUnapprove = useEventCallback(() => {
    if (onUnapprove) {
      onUnapprove(vendor);
    }
  });
  const handleDelete = useEventCallback(() => onRequestDelete(vendor.id));

  return (
    <ResponsiveActionMenu
      title={`${vendor.name} actions`}
      trigger={<RowActionsButton onClick={stableOnClick0} />}
      actions={[
        { id: "view", icon: ViewIcon, label: "View", onSelect: handleView },
        { id: "edit", icon: Edit02Icon, label: "Edit", onSelect: handleEdit },
        Boolean(onApprove && status === "pending") && {
          id: "approve",
          icon: CheckmarkCircle01Icon,
          label: "Approve",
          onSelect: handleApprove,
        },
        Boolean(onUnapprove && status === "approved") && {
          id: "unapprove",
          icon: ArrowTurnBackwardIcon,
          label: "Unapprove",
          onSelect: handleUnapprove,
        },
        {
          id: "delete",
          icon: Delete02Icon,
          label: "Delete",
          onSelect: handleDelete,
          destructive: true,
          group: "destructive",
        },
      ]}
    />
  );
}

function VendorSheetActions({
  onApprove,
  onDelete,
  onEdit,
  onUnapprove,
  vendor,
}: {
  onApprove?: (vendor: VendorRow) => void;
  onDelete: (id: string) => void;
  onEdit: (vendor: VendorRow) => void;
  onUnapprove?: (vendor: VendorRow) => void;
  vendor: VendorRow;
}) {
  const status = vendor.status ?? "pending";
  return (
    <>
      {onApprove && status === "pending" ? (
        <Button onClick={() => onApprove(vendor)} type="button">
          <HugeiconsIcon
            className="size-4"
            icon={CheckmarkCircle01Icon}
            strokeWidth={2}
          />
          Approve
        </Button>
      ) : null}
      <Button onClick={() => onEdit(vendor)} type="button" variant="outline">
        <HugeiconsIcon className="size-4" icon={Edit02Icon} strokeWidth={2} />
        Edit
      </Button>
      <PageHeaderMenu
        actions={[
          Boolean(onUnapprove && status === "approved") && {
            icon: ArrowTurnBackwardIcon,
            id: "unapprove",
            label: "Unapprove",
            onSelect: () => onUnapprove?.(vendor),
          },
          {
            destructive: true,
            icon: Delete02Icon,
            id: "delete",
            label: "Delete vendor",
            onSelect: () => onDelete(vendor.id),
          },
        ]}
        title={`${vendor.name} actions`}
      />
    </>
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
  /** The vendor whose detail sheet is open; its header reuses the row actions. */
  detailVendor?: VendorRow | null;
  isLoading?: boolean;
  onApprove?: (vendor: VendorRow) => void;
  onDelete: (id: string) => Promise<{ type: string }>;
  onDetailOpenChange?: (open: boolean) => void;
  onEdit: (vendor: VendorRow) => void;
  onUnapprove?: (vendor: VendorRow) => void;
  onView: (vendor: VendorRow) => void;
  toolbarActions?: ReactNode;
}

export function VendorsTable({
  data,
  detailVendor = null,
  isLoading,
  onApprove,
  onDelete,
  onDetailOpenChange,
  onEdit,
  onUnapprove,
  onView,
  toolbarActions,
}: VendorsTableProps) {
  useMigrateLegacyVendorFilterParams();
  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      const res = await onDelete(id);
      return res;
    },
    onError: () => toast.error("Couldn't delete vendor"),
  });
  const handleDeleteRequest = useEventCallback((id: string) =>
    deleteAction.trigger(id)
  );

  const columns: DataGridColumnDef<VendorRow>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="truncate text-sm font-medium">
          {row.original.name}
        </span>
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
      accessorFn: (row) => row.contactPhone,
      cell: ({ row }) => (
        <span className="truncate text-sm">{row.original.contactPhone}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Phone" visibility={true} />
      ),
      id: "contactPhone",
      meta: { headerTitle: "Phone", kind: "phone", skeleton: SKELETON_PHONE },
      size: 150,
    },
    {
      accessorFn: (row) => row.contactEmail,
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.contactEmail ?? "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Email" visibility={true} />
      ),
      id: "contactEmail",
      meta: { headerTitle: "Email", kind: "email", skeleton: SKELETON_EMAIL },
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
      meta: {
        headerTitle: "Bank Account",
        kind: "text",
        skeleton: SKELETON_BANK,
      },
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
      meta: {
        headerTitle: "Pending Payments",
        kind: "count",
        skeleton: SKELETON_COUNT,
      },
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
      meta: {
        headerTitle: "Active Payments",
        kind: "count",
        skeleton: SKELETON_COUNT,
      },
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
      meta: {
        headerTitle: "Pending Amount",
        kind: "amount",
        skeleton: SKELETON_AMOUNT,
      },
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
      meta: {
        headerTitle: "Active Amount",
        kind: "amount",
        skeleton: SKELETON_AMOUNT,
      },
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
      meta: {
        headerTitle: "Completed Amount",
        kind: "amount",
        skeleton: SKELETON_AMOUNT,
      },
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
      meta: {
        headerTitle: "Rejected Payments",
        kind: "count",
        skeleton: SKELETON_COUNT,
      },
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
      meta: {
        headerTitle: "Rejected Amount",
        kind: "amount",
        skeleton: SKELETON_AMOUNT,
      },
      size: 150,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const status = row.original.status ?? "pending";
        const badge = STATUS_BADGE_MAP[status] ?? {
          label: status,
          tone: "neutral" as const,
        };
        return (
          <StatusBadge className="max-w-full shrink truncate" tone={badge.tone}>
            <span className="truncate">{badge.label}</span>
          </StatusBadge>
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
      meta: {
        compact: "primary",
        headerTitle: "Status",
        kind: "status",
        skeleton: SKELETON_STATUS,
      },
      size: 140,
    },
    {
      cell: ({ row }) => (
        <RowActions
          onApprove={onApprove}
          onEdit={onEdit}
          onRequestDelete={handleDeleteRequest}
          onUnapprove={onUnapprove}
          onView={onView}
          status={row.original.status ?? "pending"}
          vendor={row.original}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        stopRowClick: true,
      },
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
        compactOnMobile
        filter={{
          fields: createVendorFilterFields(),
          getValue: getVendorFilterValue,
          viewField: "status",
        }}
        getRowId={stableGetRowId1}
        isLoading={isLoading}
        onRowClick={onView}
        searchFn={searchVendor}
        searchPlaceholder="Search vendors..."
        totals={TOTAL_COLUMNS}
        storageKey="vendors_table_state_v3"
        tableLayout={{
          columnsDraggable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={toolbarActions}
      />
      <VendorDetailSheet
        actions={
          detailVendor ? (
            <VendorSheetActions
              onApprove={onApprove}
              onDelete={handleDeleteRequest}
              onEdit={onEdit}
              onUnapprove={onUnapprove}
              vendor={detailVendor}
            />
          ) : null
        }
        onOpenChange={(open) => onDetailOpenChange?.(open)}
        open={Boolean(detailVendor)}
        vendor={detailVendor}
      />
      <ConfirmDialog
        confirmLabel="Delete vendor"
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
