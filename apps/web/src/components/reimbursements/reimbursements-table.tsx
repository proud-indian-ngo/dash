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
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { log } from "evlog";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { useApp } from "@/context/app-context";
import { authClient } from "@/lib/auth-client";
import { SHORT_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";
import { canEditRequestSubmission } from "@/lib/request-edit-permissions";
import { getStatusBadge } from "@/lib/status-badge";

function computeTotal(lineItems: RequestRow["lineItems"]): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_CREATED_BY = (
  <div className="flex items-center gap-3">
    <Skeleton className="size-8 rounded-full" />
    <div className="space-y-1">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  </div>
);
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;
const SKELETON_DATE = <Skeleton className="h-5 w-24" />;
const SKELETON_TYPE = <Skeleton className="h-6 w-24" />;

interface ReimbursementsTableProps {
  data: RequestRow[];
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onClearFilters?: () => void;
  onDelete: (row: RequestRow) => Promise<void>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

function RowActions({
  canDelete,
  canEdit,
  id,
  request,
  onRequestDelete,
}: {
  canDelete: boolean;
  canEdit: boolean;
  id: string;
  request: RequestRow;
  onRequestDelete: (row: RequestRow) => void;
}) {
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const handleDelete = useEventCallback(() => onRequestDelete(request));

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
        <DropdownMenuItem
          render={<Link params={{ id }} to="/reimbursements/$id" />}
        >
          View
        </DropdownMenuItem>
        {canEdit ? (
          <DropdownMenuItem
            render={
              <Link
                params={{ id }}
                search={{ mode: "edit" }}
                to="/reimbursements/$id"
              />
            }
          >
            Edit
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canDelete}
          onClick={handleDelete}
          variant="destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchReimbursement(row: RequestRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    row.city,
    row.status,
    row.user?.name,
    "event" in row ? row.event?.name : "",
    REQUEST_TYPE_LABELS[row.type],
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function ReimbursementsTable({
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: ReimbursementsTableProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const { hasPermission } = useApp();
  const canDeleteAll = hasPermission("requests.delete_all");

  const [deleteTarget, setDeleteTarget] = useState<{
    row: RequestRow;
    type: "reimbursement" | "advance_payment";
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const handleDeleteRequest = useEventCallback((row: RequestRow) =>
    setDeleteTarget({ row, type: row.type })
  );

  const confirmDelete = useEventCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      await onDeleteRef.current(deleteTarget.row);
    } catch (e) {
      log.error({
        action: "delete",
        component: "ReimbursementsTable",
        entityId: deleteTarget.row.id,
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error("Couldn't delete reimbursement");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  });

  const columns: ColumnDef<RequestRow>[] = [
    {
      accessorFn: (row) => row.title,
      cell: ({ row }) => (
        <span className="truncate font-medium text-sm">
          {row.original.title}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Title" visibility={true} />
      ),
      id: "title",
      meta: { headerTitle: "Title", skeleton: SKELETON_TITLE },
      minSize: 200,
      size: 240,
    },
    {
      accessorFn: (row: RequestRow) => REQUEST_TYPE_LABELS[row.type],
      cell: ({ row }) => (
        <Badge className="max-w-full shrink truncate" variant="outline">
          <span className="truncate">
            {REQUEST_TYPE_LABELS[row.original.type]}
          </span>
        </Badge>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      id: "type",
      meta: { headerTitle: "Type", skeleton: SKELETON_TYPE },
      minSize: 120,
      size: 150,
    },
    {
      accessorFn: (row) => row.city,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm capitalize">
          {row.original.city}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      id: "city",
      meta: { headerTitle: "City", skeleton: SKELETON_TYPE },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row) => (isReimbursement(row) ? row.event?.name : ""),
      cell: ({ row }) => {
        const r = row.original;
        const name = isReimbursement(r) ? r.event?.name : undefined;
        return (
          <span className="truncate text-muted-foreground text-sm">{name}</span>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "event",
      meta: { headerTitle: "Event", skeleton: SKELETON_TYPE },
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
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar className="size-8" user={user} />
              <div className="min-w-0 space-y-px">
                <div className="truncate font-medium text-foreground text-sm">
                  {user.name}
                </div>
                <div className="truncate text-muted-foreground text-xs">
                  {user.email}
                </div>
              </div>
            </div>
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
      meta: { headerTitle: "Created By", skeleton: SKELETON_CREATED_BY },
      minSize: 180,
      size: 220,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const { label, variant } = getStatusBadge(row.original.status);
        return <Badge variant={variant}>{label}</Badge>;
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
      accessorFn: (row) => computeTotal(row.lineItems),
      cell: ({ row }) => {
        const total = computeTotal(row.original.lineItems);
        return <span className="truncate text-sm">{formatINR(total)}</span>;
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Total" visibility={true} />
      ),
      id: "total",
      meta: { headerTitle: "Total", skeleton: SKELETON_TOTAL },
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
            {format(new Date(r.expenseDate), SHORT_DATE)}
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
      meta: { headerTitle: "Expense Date", skeleton: SKELETON_DATE },
      size: 130,
    },
    {
      accessorFn: (row) =>
        row.submittedAt === null ? "—" : format(row.submittedAt, SHORT_DATE),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
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
      meta: { headerTitle: "Submitted", skeleton: SKELETON_DATE },
      size: 130,
    },
    {
      cell: ({ row }) => {
        const r = row.original;
        const isOwner = r.userId === currentUserId;
        const canDelete = canDeleteAll || (isOwner && r.status === "pending");
        const canEdit = currentUserId
          ? canEditRequestSubmission(r, currentUserId, hasPermission)
          : false;
        return (
          <RowActions
            canDelete={canDelete}
            canEdit={canEdit}
            id={r.id}
            onRequestDelete={handleDeleteRequest}
            request={r}
          />
        );
      },
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

  const deleteType = deleteTarget
    ? REQUEST_TYPE_LABELS[deleteTarget.type].toLowerCase()
    : "request";
  const stableGetRowId1 = useEventCallback((row: { id: string }) => row.id);
  const stableOnRowClick2 = useEventCallback((row: { id: string }) =>
    onNavigate(row.id)
  );
  const stableOnOpenChange3 = useEventCallback((open: boolean) => {
    if (!open) {
      setDeleteTarget(null);
    }
  });

  return (
    <>
      <DataTableWrapper<RequestRow>
        columns={columns}
        data={data}
        defaultColumnVisibility={{ event: false }}
        emptyMessage="No reimbursements found."
        getRowId={stableGetRowId1}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={stableOnRowClick2}
        searchFn={searchReimbursement}
        searchPlaceholder="Search reimbursements..."
        storageKey="reimbursements_table_state_v1"
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
        description={`This will permanently delete this ${deleteType} including all line items and attachments. This action cannot be undone.`}
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={confirmDelete}
        onOpenChange={stableOnOpenChange3}
        open={deleteTarget !== null}
        title={`Delete ${deleteType}`}
      />
    </>
  );
}
