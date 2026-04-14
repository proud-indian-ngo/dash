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
  id,
  onNavigate,
  onRequestDelete,
}: {
  canDelete: boolean;
  id: string;
  onNavigate: (id: string) => void;
  onRequestDelete: () => void;
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
        <DropdownMenuItem onClick={() => onNavigate(id)}>View</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canDelete}
          onClick={onRequestDelete}
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
    row.city ?? "",
    row.status,
    row.user?.name ?? "",
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
  const currentUserId = session?.user?.id ?? "";
  const { hasPermission } = useApp();
  const canDeleteAll = hasPermission("requests.delete_all");

  const [deleteTarget, setDeleteTarget] = useState<{
    row: RequestRow;
    type: "reimbursement" | "advance_payment";
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      await onDeleteRef.current(deleteTarget.row);
    } catch (e) {
      log.error({
        component: "ReimbursementsTable",
        action: "delete",
        entityId: deleteTarget.row.id,
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error("Couldn't delete reimbursement");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const columns: ColumnDef<RequestRow>[] = [
    {
      id: "title",
      accessorFn: (row) => row.title,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Title" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate font-medium text-sm">
          {row.original.title}
        </span>
      ),
      meta: { headerTitle: "Title", skeleton: SKELETON_TITLE },
      size: 240,
      minSize: 200,
    },
    {
      id: "type",
      accessorFn: (row) => REQUEST_TYPE_LABELS[row.type],
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Type" visibility={true} />
      ),
      cell: ({ row }) => (
        <Badge className="max-w-full shrink truncate" variant="outline">
          <span className="truncate">
            {REQUEST_TYPE_LABELS[row.original.type]}
          </span>
        </Badge>
      ),
      meta: { headerTitle: "Type", skeleton: SKELETON_TYPE },
      size: 150,
      minSize: 120,
    },
    {
      id: "city",
      accessorFn: (row) => row.city,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm capitalize">
          {row.original.city ?? "—"}
        </span>
      ),
      meta: { headerTitle: "City", skeleton: SKELETON_TYPE },
      size: 120,
      minSize: 100,
    },
    {
      id: "createdBy",
      accessorFn: (row) => row.user?.name,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Created By"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const user = row.original.user;
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
      meta: { headerTitle: "Created By", skeleton: SKELETON_CREATED_BY },
      size: 220,
      minSize: 180,
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
        const { label, variant } = getStatusBadge(row.original.status);
        return <Badge variant={variant}>{label}</Badge>;
      },
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 120,
    },
    {
      id: "total",
      accessorFn: (row) => computeTotal(row.lineItems),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Total" visibility={true} />
      ),
      cell: ({ row }) => {
        const total = computeTotal(row.original.lineItems);
        return <span className="truncate text-sm">{formatINR(total)}</span>;
      },
      meta: { headerTitle: "Total", skeleton: SKELETON_TOTAL },
      size: 120,
    },
    {
      id: "expenseDate",
      accessorFn: (row) => (isReimbursement(row) ? row.expenseDate : null),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Expense Date"
          visibility={true}
        />
      ),
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
      meta: { headerTitle: "Expense Date", skeleton: SKELETON_DATE },
      size: 130,
    },
    {
      id: "submittedAt",
      accessorFn: (row) =>
        row.submittedAt == null ? "—" : format(row.submittedAt, SHORT_DATE),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Submitted"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.submittedAt == null
            ? "—"
            : format(row.original.submittedAt, SHORT_DATE)}
        </span>
      ),
      meta: { headerTitle: "Submitted", skeleton: SKELETON_DATE },
      size: 130,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        const isOwner = r.userId === currentUserId;
        const canDelete = canDeleteAll || (isOwner && r.status === "pending");
        return (
          <RowActions
            canDelete={canDelete}
            id={r.id}
            onNavigate={onNavigate}
            onRequestDelete={() => setDeleteTarget({ row: r, type: r.type })}
          />
        );
      },
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: { cellClassName: "text-center", stopRowClick: true },
      size: 52,
      minSize: 52,
    },
  ];

  const deleteType = deleteTarget
    ? REQUEST_TYPE_LABELS[deleteTarget.type].toLowerCase()
    : "request";

  return (
    <>
      <DataTableWrapper<RequestRow>
        columns={columns}
        data={data}
        emptyMessage="No reimbursements found."
        getRowId={(row) => row.id}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={(row) => onNavigate(row.id)}
        searchFn={searchReimbursement}
        searchPlaceholder="Search reimbursements..."
        storageKey="reimbursements_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsVisibility: true,
          columnsPinnable: true,
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
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title={`Delete ${deleteType}`}
      />
    </>
  );
}
