import {
  Delete02Icon,
  Edit02Icon,
  UnavailableIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { requestCostCentreId } from "@pi-dash/shared/cost-centre";
import { formatPaise } from "@pi-dash/shared/money";
import { formatNoInvoice } from "@pi-dash/shared/vendor-payment";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { useDataTableGroupBy } from "@/components/data-table/data-table-group";
import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
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
import { isVoided, VoidBadge } from "@/components/shared/void";
import {
  createVendorPaymentFilterFields,
  getVendorPaymentFilterValue,
  useMigrateLegacyVendorPaymentFilterParams,
} from "@/components/vendor-payments/vendor-payment-filters";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useCostCentres } from "@/hooks/use-cost-centres";
import { authClient } from "@/lib/auth-client";
import { DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import { canEditVendorPaymentSubmission } from "@/lib/request-edit-permissions";
import {
  requestChargeSummary,
  requestProgrammeName,
} from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";
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

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;
const SKELETON_USER = USER_CELL_SKELETON;

function searchVendorPayment(
  row: VendorPaymentWithRelations,
  query: string,
  cityOf: (row: VendorPaymentWithRelations) => string
): boolean {
  const q = query.toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    row.vendor?.name,
    cityOf(row),
    row.status,
    row.user?.name,
    row.invoiceNumber,
    row.noInvoiceReason ? formatNoInvoice(row.noInvoiceReason) : null,
    row.event?.name,
    requestProgrammeName(row),
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface VendorPaymentsTableProps {
  /** Count shortcuts beside the status tabs ("Unallocated", "Missing payment proof"). */
  attentionViews?: DataTableAttentionView[];
  canDelete?: boolean;
  data: VendorPaymentWithRelations[];
  isLoading?: boolean;
  onDelete?: (
    id: string
  ) => Promise<{ type: string; error?: { message?: string } }>;
  onNavigate: (id: string) => void;
  /** Voids a request the books hold, with its payments (finance Option B). */
  onVoid?: (payment: VendorPaymentWithRelations) => void;
  /** Requests whose expense or a payment stands in the books: Void, not Delete. */
  postedIds?: ReadonlySet<string>;
  toolbarActions?: ReactNode;
}

function VendorPaymentRowActions({
  canDelete,
  canEdit,
  id,
  onDelete,
  onVoid,
  payment,
}: {
  canDelete?: boolean;
  canEdit: boolean;
  id: string;
  onDelete: (payload: { id: string; title: string }) => void;
  onVoid?: (payment: VendorPaymentWithRelations) => void;
  payment: VendorPaymentWithRelations;
}) {
  const handleVoid = useEventCallback(() => onVoid?.(payment));
  const stopPropagation = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id, title: payment.title })
  );

  return (
    <ResponsiveActionMenu
      title={`${payment.title} actions`}
      trigger={<RowActionsButton onClick={stopPropagation} />}
      actions={[
        {
          id: "view",
          icon: ViewIcon,
          label: "View",
          render: <Link params={{ id }} to="/vendor-payments/$id" />,
        },
        canEdit && {
          id: "edit",
          icon: Edit02Icon,
          label: "Edit",
          render: (
            <Link
              params={{ id }}
              search={{ mode: "edit" }}
              to="/vendor-payments/$id"
            />
          ),
        },
        Boolean(onVoid) && {
          id: "void",
          icon: UnavailableIcon,
          label: "Void",
          onSelect: handleVoid,
          destructive: true,
          group: "destructive",
        },
        canDelete && {
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

export function VendorPaymentsTable({
  attentionViews,
  canDelete,
  data,
  isLoading,
  onDelete,
  onNavigate,
  onVoid,
  postedIds,
  toolbarActions,
}: VendorPaymentsTableProps) {
  useMigrateLegacyVendorPaymentFilterParams();
  const costCentres = useCostCentres();
  /** "City": the event's cost centre for a payment on an event, else its own. */
  const cityOf = (row: VendorPaymentWithRelations) =>
    costCentres.nameOf(requestCostCentreId(row));
  const filterFields = createVendorPaymentFilterFields(
    data,
    costCentres.active
  );
  const searchFn = useEventCallback(
    (row: VendorPaymentWithRelations, query: string) =>
      searchVendorPayment(row, query, cityOf)
  );
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const { hasPermission } = useApp();
  const canVoid = hasPermission("requests.void");
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
      meta: {
        headerTitle: "Vendor",
        icon: COLUMN_ICONS.vendor,
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row) => cityOf(row),
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {cityOf(row.original)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      id: "city",
      meta: {
        headerTitle: "City",
        icon: COLUMN_ICONS.city,
        kind: "location",
        skeleton: SKELETON_TEXT,
      },
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
      meta: {
        headerTitle: "Event",
        icon: COLUMN_ICONS.event,
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row) => requestProgrammeName(row),
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {requestProgrammeName(row.original)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Programme"
          visibility={true}
        />
      ),
      id: "programme",
      meta: {
        headerTitle: "Programme",
        icon: COLUMN_ICONS.programme,
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      minSize: 120,
      size: 170,
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
      accessorFn: (row) => sumAmounts(row.lineItems),
      cell: ({ row }) => (
        <span className="truncate text-sm tabular-nums">
          {formatPaise(sumAmounts(row.original.lineItems))}
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
      meta: {
        compact: "trailing",
        headerTitle: "Amount",
        kind: "amount",
        skeleton: SKELETON_TOTAL,
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row) =>
        row.submittedAt === null ? "—" : format(row.submittedAt, DATE),
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.submittedAt === null
            ? "—"
            : format(row.original.submittedAt, DATE)}
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
      meta: {
        headerTitle: "Submitted",
        icon: COLUMN_ICONS.submittedAt,
        kind: "date",
        skeleton: SKELETON_TEXT,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const { label, tone } = getStatusBadge(row.original.status);
        return (
          <span className="inline-flex items-center gap-1">
            <StatusBadge tone={tone}>{label}</StatusBadge>
            {isVoided(row.original) ? <VoidBadge /> : null}
          </span>
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
      size: 170,
    },
    {
      cell: ({ row }) => {
        const request = row.original;
        const id = request.id as string;
        const voided = isVoided(request);
        const posted = postedIds?.has(id) ?? false;
        const canEdit =
          !voided &&
          (currentUserId
            ? canEditVendorPaymentSubmission(
                request,
                currentUserId,
                hasPermission
              )
            : false);

        const actions = (
          <VendorPaymentRowActions
            // In the books or voided: kept as the record, never deleted.
            canDelete={canDelete && Boolean(onDelete) && !(voided || posted)}
            canEdit={canEdit}
            id={id}
            onDelete={handleDeleteRequest}
            onVoid={posted && !voided && canVoid ? onVoid : undefined}
            payment={request}
          />
        );
        if (!(showReview && request.status === "pending" && !voided)) {
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
          attentionViews,
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
        summary={
          review.row ? (
            <>Charged to: {requestChargeSummary(review.row)}</>
          ) : undefined
        }
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
