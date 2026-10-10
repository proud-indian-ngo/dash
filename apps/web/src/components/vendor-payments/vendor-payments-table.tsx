import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { toast } from "sonner";

import { useDataTableGroupBy } from "@/components/data-table/data-table-group";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  USER_CELL_SKELETON,
  UserCell,
} from "@/components/shared/inline-meta-cell";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import {
  createStatusGroupBy,
  REVIEW_ACTIONS_SIZE,
  RowReviewButtons,
  useRowReview,
} from "@/components/shared/row-review";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import {
  createVendorPaymentFilterFields,
  getVendorPaymentFilterValue,
  useMigrateLegacyVendorPaymentFilterParams,
} from "@/components/vendor-payments/vendor-payment-filters";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { authClient } from "@/lib/auth-client";
import { SHORT_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { canEditVendorPaymentSubmission } from "@/lib/request-edit-permissions";
import { getStatusBadge } from "@/lib/status-badge";

import type { VendorPaymentWithRelations } from "./vendor-payment-types";

const TOTAL_COLUMNS = ["total"];
const STATUS_GROUP_BY = createStatusGroupBy<VendorPaymentWithRelations>([
  "pending",
  "approved",
  "invoice_pending",
  "partially_paid",
  "paid",
  "completed",
  "rejected",
]);

function computeTotal(
  lineItems: VendorPaymentWithRelations["lineItems"]
): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;
const SKELETON_USER = USER_CELL_SKELETON;

function searchFn(row: VendorPaymentWithRelations, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    row.vendor?.name,
    row.status,
    row.user?.name,
    row.invoiceNumber,
    row.event?.name,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface VendorPaymentsTableProps {
  canDelete?: boolean;
  data: VendorPaymentWithRelations[];
  isLoading?: boolean;
  onDelete?: (
    id: string
  ) => Promise<{ type: string; error?: { message?: string } }>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
}

function VendorPaymentRowActions({
  canDelete,
  canEdit,
  id,
  onDelete,
  payment,
}: {
  canDelete?: boolean;
  canEdit: boolean;
  id: string;
  onDelete: (payload: { id: string; title: string }) => void;
  payment: VendorPaymentWithRelations;
}) {
  const stopPropagation = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id, title: payment.title })
  );

  return (
    <ResponsiveActionMenu
      title={`${payment.title} actions`}
      contentClassName="w-32"
      trigger={<RowActionsButton onClick={stopPropagation} />}
      actions={[
        {
          id: "view",
          label: "View",
          render: <Link params={{ id }} to="/vendor-payments/$id" />,
        },
        canEdit && {
          id: "edit",
          label: "Edit",
          render: (
            <Link
              params={{ id }}
              search={{ mode: "edit" }}
              to="/vendor-payments/$id"
            />
          ),
        },
        canDelete && {
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

export function VendorPaymentsTable({
  canDelete,
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
}: VendorPaymentsTableProps) {
  useMigrateLegacyVendorPaymentFilterParams();
  const filterFields = useMemo(
    () => createVendorPaymentFilterFields(data),
    [data]
  );
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const { hasPermission } = useApp();
  const zero = useZero();
  const review = useRowReview<VendorPaymentWithRelations>();
  const [groupColumnId] = useDataTableGroupBy();
  const showReview =
    hasPermission("requests.approve") &&
    groupColumnId === STATUS_GROUP_BY.columnId;
  const handleApprove = useEventCallback(async (message: string) => {
    const { row } = review;
    if (!row) {
      return false;
    }
    const res = await zero.mutate(
      mutators.vendorPayment.approve({
        id: row.id,
        note: message || undefined,
      })
    ).server;
    handleMutationResult(res, {
      entityId: row.id,
      errorMsg: "Couldn't approve vendor payment",
      mutation: "vendorPayment.approve",
      successMsg: "Vendor payment approved",
    });
    return res.type !== "error";
  });
  const handleReject = useEventCallback(async (reason: string) => {
    const { row } = review;
    if (!row) {
      return;
    }
    const res = await zero.mutate(
      mutators.vendorPayment.reject({ id: row.id, reason })
    ).server;
    handleMutationResult(res, {
      entityId: row.id,
      errorMsg: "Couldn't reject vendor payment",
      mutation: "vendorPayment.reject",
      successMsg: "Vendor payment rejected",
    });
    if (res.type !== "error") {
      review.close();
    }
  });
  const deleteAction = useConfirmAction<{ id: string; title: string }>({
    onConfirm: async (payload) =>
      onDelete ? onDelete(payload.id) : { type: "success" },
    onError: (msg) => toast.error(msg),
    onSuccess: () => toast.success("Vendor payment removed"),
  });
  const handleDeleteRequest = useEventCallback(
    (payload: { id: string; title: string }) => deleteAction.trigger(payload)
  );
  const columns: DataGridColumnDef<VendorPaymentWithRelations>[] = [
    {
      accessorFn: (row) => row.title,
      cell: ({ row }) => (
        <span className="truncate text-sm font-medium">
          {row.original.title}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Title" visibility={true} />
      ),
      id: "title",
      meta: {
        compact: "primary",
        headerTitle: "Title",
        kind: "text",
        skeleton: SKELETON_TITLE,
      },
      minSize: 200,
      size: 240,
    },
    {
      accessorFn: (row) => row.vendor?.name,
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.vendor?.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Vendor"
          visibility={true}
        />
      ),
      id: "vendor",
      meta: { headerTitle: "Vendor", kind: "text", skeleton: SKELETON_TEXT },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row) => row.city,
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm capitalize">
          {row.original.city}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      id: "city",
      meta: { headerTitle: "City", kind: "location", skeleton: SKELETON_TEXT },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row) => row.event?.name,
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.event?.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "event",
      meta: { headerTitle: "Event", kind: "text", skeleton: SKELETON_TEXT },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row) => row.user?.name,
      cell: ({ row }) => {
        const { user } = row.original;
        if (!user) {
          return <span className="text-muted-foreground text-sm">—</span>;
        }
        return (
          <UserHoverCard user={user}>
            <UserCell user={user} />
          </UserHoverCard>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Submitted by"
          visibility={true}
        />
      ),
      id: "submittedBy",
      meta: {
        headerTitle: "Submitted by",
        kind: "person",
        skeleton: SKELETON_USER,
      },
      minSize: 180,
      size: 220,
    },
    {
      accessorFn: (row) => computeTotal(row.lineItems),
      cell: ({ row }) => (
        <span className="truncate text-sm tabular-nums">
          {formatINR(computeTotal(row.original.lineItems))}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Amount"
          visibility={true}
        />
      ),
      id: "total",
      meta: { headerTitle: "Amount", kind: "amount", skeleton: SKELETON_TOTAL },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row) =>
        row.submittedAt === null ? "—" : format(row.submittedAt, SHORT_DATE),
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.submittedAt === null
            ? "—"
            : format(row.original.submittedAt, SHORT_DATE)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Submitted"
          visibility={true}
        />
      ),
      id: "submittedAt",
      meta: { headerTitle: "Submitted", kind: "date", skeleton: SKELETON_TEXT },
      size: 130,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const { label, tone } = getStatusBadge(row.original.status);
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
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
      size: 170,
    },
    {
      cell: ({ row }) => {
        const request = row.original;
        const id = request.id as string;
        const canEdit = currentUserId
          ? canEditVendorPaymentSubmission(
              request,
              currentUserId,
              hasPermission
            )
          : false;

        const actions = (
          <VendorPaymentRowActions
            canDelete={canDelete && Boolean(onDelete)}
            canEdit={canEdit}
            id={id}
            onDelete={handleDeleteRequest}
            payment={request}
          />
        );
        if (!(showReview && request.status === "pending")) {
          return actions;
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <RowReviewButtons
              name={request.title}
              onApprove={() => review.approve(request)}
              onReject={() => review.reject(request)}
            />
            {actions}
          </div>
        );
      },
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: showReview ? "text-end" : "text-center",
        enableColumnOrdering: false,
        stopRowClick: true,
      },
      minSize: 52,
      size: showReview ? REVIEW_ACTIONS_SIZE : 52,
    },
  ];
  const stableGetRowId0 = useEventCallback(
    (row: { id: string }) => row.id as string
  );
  const stableOnRowClick1 = useEventCallback((row: { id: string }) =>
    onNavigate(row.id as string)
  );
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <>
      <DataTableWrapper<VendorPaymentWithRelations>
        columns={columns}
        data={data}
        defaultColumnVisibility={{ event: false }}
        emptyMessage="No vendor payments found."
        compactOnMobile
        filter={{
          fields: filterFields,
          getValue: getVendorPaymentFilterValue,
          viewField: "status",
        }}
        getRowId={stableGetRowId0}
        groupBy={STATUS_GROUP_BY}
        isLoading={isLoading}
        onRowClick={stableOnRowClick1}
        searchFn={searchFn}
        searchPlaceholder="Search vendor payments..."
        totals={TOTAL_COLUMNS}
        storageKey="vendor_payments_table_state_v1"
        tableLayout={{
          columnsDraggable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={toolbarActions}
      />
      <ConfirmDialog
        confirmLabel="Delete payment"
        description={`This will permanently delete "${deleteAction.payload?.title}". This action cannot be undone.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={stableOnOpenChange2}
        open={deleteAction.isOpen}
        title="Delete vendor payment"
        variant="destructive"
      />
      <ApproveDialog
        entityId={review.row?.id ?? ""}
        entityLabel="vendor payment"
        hideScreenshot
        onConfirm={handleApprove}
        onOpenChange={review.handleOpenChange}
        open={review.approveOpen}
      />
      <RejectDialog
        entityLabel="vendor payment"
        onConfirm={handleReject}
        onOpenChange={review.handleOpenChange}
        open={review.rejectOpen}
      />
    </>
  );
}
