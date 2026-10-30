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
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { Link, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { useDataTableGroupBy } from "@/components/data-table/data-table-group";
import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ApproveDialog } from "@/components/form/approve-dialog";
import { RejectDialog } from "@/components/form/reject-dialog";
import {
  createReimbursementFilterFields,
  getReimbursementFilterValue,
  useMigrateLegacyReimbursementFilterParams,
} from "@/components/reimbursements/reimbursement-filters";
import { ReimbursementRowIntentBoundary } from "@/components/reimbursements/reimbursement-row-intent-boundary";
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
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { isVoided, VoidBadge } from "@/components/shared/void";
import { useApp } from "@/context/app-context";
import { useCostCentres } from "@/hooks/use-cost-centres";
import { useSoleFinanceApprover } from "@/hooks/use-sole-finance-approver";
import { authClient } from "@/lib/auth-client";
import { DATE } from "@/lib/date-formats";
import { pendingApprovalLabel, waitingLeadOf } from "@/lib/lead-approval";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";
import { canEditRequestSubmission } from "@/lib/request-edit-permissions";
import {
  requestChargeSummary,
  requestProgrammeName,
} from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";
import { getStatusBadge } from "@/lib/status-badge";

const TOTAL_COLUMNS = ["total"];
const STATUS_GROUP_BY = createStatusGroupBy<RequestRow>([
  "pending",
  "approved",
  "rejected",
]);
const REQUEST_MUTATORS = {
  advance_payment: { name: "advancePayment", ns: mutators.advancePayment },
  reimbursement: { name: "reimbursement", ns: mutators.reimbursement },
} as const;

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_CREATED_BY = USER_CELL_SKELETON;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;
const SKELETON_DATE = <Skeleton className="h-5 w-24" />;
const SKELETON_TYPE = <Skeleton className="h-6 w-24" />;

interface ReimbursementsTableProps {
  /** Count shortcuts beside the status tabs ("Unallocated", "Missing payment proof"). */
  attentionViews?: DataTableAttentionView[];
  data: RequestRow[];
  isLoading?: boolean;
  onDelete: (row: RequestRow) => Promise<void>;
  onNavigate: (id: string) => void;
  /** Voids a request the books hold (finance Option B). */
  onVoid?: (row: RequestRow) => void;
  /** The reimbursements standing in the books: Void replaces Delete on them. */
  postedIds?: ReadonlySet<string>;
  toolbarActions?: ReactNode;
}

function RowActions({
  canDelete,
  canEdit,
  id,
  inBooks,
  request,
  onRequestDelete,
  onVoid,
}: {
  canDelete: boolean;
  canEdit: boolean;
  id: string;
  /** Posted or voided: kept as the record, so never deleted. */
  inBooks: boolean;
  request: RequestRow;
  onRequestDelete: (row: RequestRow) => void;
  onVoid?: (row: RequestRow) => void;
}) {
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const handleDelete = useEventCallback(() => onRequestDelete(request));
  const handleVoid = useEventCallback(() => onVoid?.(request));

  return (
    <ResponsiveActionMenu
      title={`${request.title} actions`}
      trigger={
        <RowActionsButton
          data-reimbursement-intent-id={id}
          onClick={stableOnClick0}
        />
      }
      actions={[
        {
          id: "view",
          icon: ViewIcon,
          label: "View",
          render: <Link params={{ id }} to="/reimbursements/$id" />,
        },
        canEdit && {
          id: "edit",
          icon: Edit02Icon,
          label: "Edit",
          render: (
            <Link
              params={{ id }}
              search={{ mode: "edit" }}
              to="/reimbursements/$id"
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
        !inBooks && {
          id: "delete",
          icon: Delete02Icon,
          label: "Delete",
          disabled: !canDelete,
          onSelect: handleDelete,
          destructive: true,
          group: "destructive",
        },
      ]}
    />
  );
}

function searchReimbursement(
  row: RequestRow,
  query: string,
  cityOf: (row: RequestRow) => string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    cityOf(row),
    row.status,
    row.user?.name,
    "event" in row ? row.event?.name : "",
    isReimbursement(row) ? requestProgrammeName(row) : "",
    REQUEST_TYPE_LABELS[row.type],
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function ReimbursementsTable({
  attentionViews,
  data,
  isLoading,
  onDelete,
  onNavigate,
  onVoid,
  postedIds,
  toolbarActions,
}: ReimbursementsTableProps) {
  useMigrateLegacyReimbursementFilterParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const soleFinanceApprover = useSoleFinanceApprover();
  const { hasPermission } = useApp();
  const canDeleteAll = hasPermission("requests.delete_all");
  const canDeleteOwn = hasPermission("requests.delete_own");
  const canVoid = hasPermission("requests.void");
  const zero = useZero();
  const review = useRowReview<RequestRow>();
  const [groupColumnId] = useDataTableGroupBy();
  const showReview =
    hasPermission("requests.approve") &&
    groupColumnId === STATUS_GROUP_BY.columnId;
  const reviewLabel = review.row
    ? REQUEST_TYPE_LABELS[review.row.type].toLowerCase()
    : "request";

  const handleApprove = useEventCallback(
    async (
      message: string,
      screenshotKey?: string,
      leadSkipReason?: string
    ) => {
      const { row } = review;
      if (!row) {
        return false;
      }
      const { name, ns } = REQUEST_MUTATORS[row.type];
      const typeLabel = REQUEST_TYPE_LABELS[row.type];
      const res = await zero.mutate(
        ns.approve({
          approvalScreenshotKey: screenshotKey,
          id: row.id,
          leadSkipReason,
          note: message || undefined,
        })
      ).server;
      handleMutationResult(res, {
        entityId: row.id,
        errorMsg: `Couldn't approve ${typeLabel.toLowerCase()}`,
        mutation: `${name}.approve`,
        successMsg: `${typeLabel} approved`,
      });
      return res.type !== "error";
    }
  );
  const handleReject = useEventCallback(async (reason: string) => {
    const { row } = review;
    if (!row) {
      return;
    }
    const { name, ns } = REQUEST_MUTATORS[row.type];
    const typeLabel = REQUEST_TYPE_LABELS[row.type];
    const res = await zero.mutate(ns.reject({ id: row.id, reason })).server;
    handleMutationResult(res, {
      entityId: row.id,
      errorMsg: `Couldn't reject ${typeLabel.toLowerCase()}`,
      mutation: `${name}.reject`,
      successMsg: `${typeLabel} rejected`,
    });
    if (res.type !== "error") {
      review.close();
    }
  });

  const [deleteTarget, setDeleteTarget] = useState<{
    row: RequestRow;
    type: "reimbursement" | "advance_payment";
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteRequest = useEventCallback((row: RequestRow) =>
    setDeleteTarget({ row, type: row.type })
  );

  const confirmDelete = useEventCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    // Promise handlers rather than try/finally, which the React Compiler cannot compile.
    await onDelete(deleteTarget.row).catch((e: unknown) => {
      log.error({
        action: "delete",
        component: "ReimbursementsTable",
        entityId: deleteTarget.row.id,
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error("Couldn't delete reimbursement");
    });
    setDeleteLoading(false);
    setDeleteTarget(null);
  });

  const costCentres = useCostCentres();
  /** "City": the event's cost centre for a claim on an event, else its own. */
  const cityOf = (row: RequestRow) =>
    costCentres.nameOf(requestCostCentreId(row));

  const columns: DataGridColumnDef<RequestRow>[] = [
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
      accessorFn: (row: RequestRow) => REQUEST_TYPE_LABELS[row.type],
      cell: ({ row }) => (
        <Tag className="max-w-full shrink truncate">
          <span className="truncate">
            {REQUEST_TYPE_LABELS[row.original.type]}
          </span>
        </Tag>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      id: "type",
      meta: { headerTitle: "Type", kind: "tag", skeleton: SKELETON_TYPE },
      minSize: 120,
      size: 150,
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
        skeleton: SKELETON_TYPE,
      },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row) => (isReimbursement(row) ? row.event?.name : ""),
      cell: ({ row }) => {
        const r = row.original;
        const name = isReimbursement(r) ? r.event?.name : undefined;
        return (
          <span className="text-muted-foreground truncate text-sm">{name}</span>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "event",
      meta: {
        headerTitle: "Event",
        icon: COLUMN_ICONS.event,
        kind: "text",
        skeleton: SKELETON_TYPE,
      },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row) =>
        isReimbursement(row) ? requestProgrammeName(row) : "",
      cell: ({ row }) => {
        const r = row.original;
        // Advances are charged to nothing, so no programme applies.
        return (
          <span className="text-muted-foreground truncate text-sm">
            {isReimbursement(r) ? requestProgrammeName(r) : "\u2014"}
          </span>
        );
      },
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
        skeleton: SKELETON_TYPE,
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
          title="Created By"
          visibility={true}
        />
      ),
      id: "createdBy",
      meta: {
        compact: "primary",
        headerTitle: "Created By",
        kind: "person",
        skeleton: SKELETON_CREATED_BY,
      },
      minSize: 180,
      size: 220,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const { label, tone } = getStatusBadge(row.original.status);
        // A pending request says who it waits for ("Approval policy").
        return (
          <span className="inline-flex items-center gap-1">
            <StatusBadge tone={tone}>
              {pendingApprovalLabel(row.original) ?? label}
            </StatusBadge>
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
      accessorFn: (row) => sumAmounts(row.lineItems),
      cell: ({ row }) => {
        const total = sumAmounts(row.original.lineItems);
        return <span className="truncate text-sm">{formatPaise(total)}</span>;
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Total" visibility={true} />
      ),
      id: "total",
      meta: {
        compact: "trailing",
        headerTitle: "Total",
        kind: "amount",
        skeleton: SKELETON_TOTAL,
      },
      size: 120,
    },
    {
      accessorFn: (row) => (isReimbursement(row) ? row.expenseDate : null),
      cell: ({ row }) => {
        const r = row.original;
        if (!(isReimbursement(r) && r.expenseDate)) {
          return <span className="text-muted-foreground text-sm">—</span>;
        }
        return (
          <span className="truncate text-sm">
            {format(new Date(r.expenseDate), DATE)}
          </span>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Expense Date"
          visibility={true}
        />
      ),
      id: "expenseDate",
      meta: {
        compact: "primary",
        headerTitle: "Expense Date",
        kind: "date",
        skeleton: SKELETON_DATE,
      },
      size: 130,
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
        skeleton: SKELETON_DATE,
      },
      size: 130,
    },
    {
      cell: ({ row }) => {
        const r = row.original;
        const isOwner = r.userId === currentUserId;
        const canDelete =
          canDeleteAll || (canDeleteOwn && isOwner && r.status === "pending");
        const voided = isVoided(r);
        const posted = postedIds?.has(r.id) ?? false;
        const canEdit =
          !voided &&
          (currentUserId
            ? canEditRequestSubmission(r, currentUserId, hasPermission)
            : false);
        const actions = (
          <RowActions
            canDelete={canDelete}
            canEdit={canEdit}
            id={r.id}
            inBooks={posted || voided}
            onRequestDelete={handleDeleteRequest}
            onVoid={posted && !voided && canVoid ? onVoid : undefined}
            request={r}
          />
        );
        // Nobody approves a request they raised or claim, unless they are
        // the sole finance approver.
        const isOwn =
          !soleFinanceApprover &&
          (isOwner || ("createdBy" in r && r.createdBy === currentUserId));
        if (!(showReview && r.status === "pending" && !voided && !isOwn)) {
          return actions;
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <RowReviewButtons
              name={r.title}
              onApprove={() => review.approve(r)}
              onReject={() => review.reject(r)}
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

  const deleteType = deleteTarget
    ? REQUEST_TYPE_LABELS[deleteTarget.type].toLowerCase()
    : "request";
  const stableGetRowId1 = useEventCallback((row: { id: string }) => row.id);
  const stableOnRowClick2 = useEventCallback((row: { id: string }) =>
    onNavigate(row.id)
  );
  const stableOnRowIntent = useEventCallback((id: string) => {
    void router
      .preloadRoute({
        params: { id },
        to: "/reimbursements/$id",
      })
      .catch((error: unknown) => {
        log.warn({
          action: "preload",
          component: "ReimbursementsTable",
          entityId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });
  const stableOnOpenChange3 = useEventCallback((open: boolean) => {
    if (!open) {
      setDeleteTarget(null);
    }
  });
  const filterFields = createReimbursementFilterFields(
    data,
    costCentres.active,
    hasPermission("requests.view_all")
  );
  const stableGetFilterValue = useEventCallback(
    (row: RequestRow, path: string[]) =>
      getReimbursementFilterValue(row, path, currentUserId)
  );
  const reviewLeadWaiting = review.row ? waitingLeadOf(review.row) : undefined;
  const stableSearch = useEventCallback((row: RequestRow, query: string) =>
    searchReimbursement(row, query, cityOf)
  );

  return (
    <>
      <ReimbursementRowIntentBoundary onIntent={stableOnRowIntent}>
        <DataTableWrapper<RequestRow>
          columns={columns}
          data={data}
          defaultColumnVisibility={{ event: false }}
          emptyMessage="No reimbursements found."
          compactOnMobile
          filter={{
            attentionViews,
            fields: filterFields,
            getValue: stableGetFilterValue,
            viewField: "status",
          }}
          getRowId={stableGetRowId1}
          groupBy={STATUS_GROUP_BY}
          isLoading={isLoading}
          onRowClick={stableOnRowClick2}
          searchFn={stableSearch}
          searchPlaceholder="Search reimbursements..."
          totals={TOTAL_COLUMNS}
          storageKey="reimbursements_table_state_v1"
          tableLayout={{
            columnsDraggable: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsVisibility: true,
          }}
          toolbarActions={toolbarActions}
        />
      </ReimbursementRowIntentBoundary>
      <ConfirmDialog
        confirmLabel={`Delete ${deleteType}`}
        description={`This will permanently delete this ${deleteType} including all line items and attachments. This action cannot be undone.`}
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={confirmDelete}
        onOpenChange={stableOnOpenChange3}
        open={deleteTarget !== null}
        title={`Delete ${deleteType}`}
      />
      <ApproveDialog
        entityId={review.row?.id ?? ""}
        entityLabel={reviewLabel}
        hasExistingScreenshot={Boolean(review.row?.approvalScreenshotKey)}
        leadWaiting={reviewLeadWaiting}
        onConfirm={handleApprove}
        onOpenChange={review.handleOpenChange}
        open={review.approveOpen}
        summary={
          review.row && isReimbursement(review.row) ? (
            <>Charged to: {requestChargeSummary(review.row)}</>
          ) : undefined
        }
      />
      <RejectDialog
        entityLabel={reviewLabel}
        onConfirm={handleReject}
        onOpenChange={review.handleOpenChange}
        open={review.rejectOpen}
      />
    </>
  );
}
