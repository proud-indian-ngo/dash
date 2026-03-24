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
import { useMemo } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { authClient } from "@/lib/auth-client";
import { formatINR } from "@/lib/form-schemas";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/request-types";
import { STATUS_BADGE_MAP } from "@/lib/status-badge";

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

interface RequestsTableProps {
  data: RequestRow[];
  isLoading?: boolean;
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

function searchRequest(row: RequestRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    row.type === "vendor_payment" ? "" : (row.city ?? ""),
    row.status,
    row.user?.name ?? "",
    REQUEST_TYPE_LABELS[row.type],
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function RequestsTable({
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
  toolbarFilters,
}: RequestsTableProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "admin";

  const deleteAction = useConfirmAction<{ row: RequestRow }>({
    onConfirm: async ({ row }) => {
      try {
        await onDelete(row);
        return { type: "success" };
      } catch (error) {
        log.error({
          component: "RequestsTable",
          action: "delete",
          requestId: row.id,
          type: row.type,
          error: error instanceof Error ? error.message : String(error),
        });
        return { type: "error" };
      }
    },
    onError: () => toast.error("Failed to delete request"),
  });

  const columns = useMemo<ColumnDef<RequestRow>[]>(
    () => [
      {
        id: "title",
        accessorFn: (row) => row.title,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Title"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <button
            className="text-left font-medium text-sm hover:underline"
            data-testid="row-title"
            onClick={() => onNavigate(row.original.id)}
            type="button"
          >
            {row.original.title}
          </button>
        ),
        meta: { headerTitle: "Title", skeleton: SKELETON_TITLE },
        size: 240,
      },
      {
        id: "type",
        accessorFn: (row) => REQUEST_TYPE_LABELS[row.type],
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Type"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">
            {REQUEST_TYPE_LABELS[row.original.type]}
          </Badge>
        ),
        meta: { headerTitle: "Type", skeleton: SKELETON_TYPE },
        size: 150,
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
            <div className="flex items-center gap-3">
              <UserAvatar className="size-8" user={user} />
              <div className="space-y-px">
                <div className="font-medium text-foreground text-sm">
                  {user.name}
                </div>
                <div className="truncate text-muted-foreground text-xs">
                  {user.email}
                </div>
              </div>
            </div>
          );
        },
        meta: { headerTitle: "Created By", skeleton: SKELETON_CREATED_BY },
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
          const { label, variant } =
            STATUS_BADGE_MAP[row.original.status ?? "draft"] ??
            STATUS_BADGE_MAP.draft;
          return <Badge variant={variant}>{label}</Badge>;
        },
        meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
        size: 120,
      },
      {
        id: "total",
        accessorFn: (row) => computeTotal(row.lineItems),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Total"
            visibility={true}
          />
        ),
        cell: ({ row }) => {
          const total = computeTotal(row.original.lineItems);
          return <span className="text-sm">{formatINR(total)}</span>;
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
            <span className="text-sm">
              {format(new Date(r.expenseDate), "dd/MM/yyyy")}
            </span>
          );
        },
        meta: { headerTitle: "Expense Date", skeleton: SKELETON_DATE },
        size: 130,
      },
      {
        id: "submittedAt",
        accessorFn: (row) =>
          row.submittedAt == null ? "—" : format(row.submittedAt, "dd/MM/yyyy"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Submitted"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.submittedAt == null
              ? "—"
              : format(row.original.submittedAt, "dd/MM/yyyy")}
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
          const canDelete =
            isAdmin ||
            (isOwner && (r.status === "pending" || r.status === "draft"));
          return (
            <RowActions
              canDelete={canDelete}
              id={r.id}
              onNavigate={onNavigate}
              onRequestDelete={() => deleteAction.trigger({ row: r })}
            />
          );
        },
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        enableColumnOrdering: false,
        meta: { cellClassName: "text-center" },
        size: 52,
        minSize: 52,
      },
    ],
    [currentUserId, isAdmin, onNavigate, deleteAction.trigger]
  );

  const deleteType = deleteAction.payload
    ? REQUEST_TYPE_LABELS[deleteAction.payload.row.type].toLowerCase()
    : "request";

  return (
    <>
      <DataTableWrapper<RequestRow>
        columns={columns}
        data={data}
        emptyMessage="No requests found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        searchFn={searchRequest}
        searchPlaceholder="Search requests..."
        storageKey="requests_table_state_v1"
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
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title={`Delete ${deleteType}`}
      />
    </>
  );
}
