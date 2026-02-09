import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@pi-dash/design-system/components/ui/avatar";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type {
  ExpenseCategory,
  Reimbursement,
  ReimbursementLineItem,
  User,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { authClient } from "@/lib/auth-client";
import { buildAvatarUrl } from "@/lib/avatar";
import { STATUS_BADGE_MAP } from "@/lib/status-badge";

export type ReimbursementRow = Reimbursement & {
  lineItems: ReadonlyArray<
    ReimbursementLineItem & { category: ExpenseCategory | undefined }
  >;
  user: User | undefined;
};

function computeTotal(lineItems: ReimbursementRow["lineItems"]): number {
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

interface ReimbursementsTableProps {
  data: ReimbursementRow[];
  isLoading?: boolean;
  onDelete: (id: string) => Promise<void>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
}

function ActionsMenu({
  canDelete,
  onNavigate,
  onRequestDelete,
  reimbursementId,
}: {
  canDelete: boolean;
  onNavigate: (id: string) => void;
  onRequestDelete: (id: string) => void;
  reimbursementId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
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
        <DropdownMenuItem
          onClick={() => {
            onNavigate(reimbursementId);
          }}
        >
          View
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canDelete}
          onClick={() => {
            onRequestDelete(reimbursementId);
          }}
          variant="destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchReimbursement(row: ReimbursementRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.title, row.city ?? "", row.status, row.user?.name ?? ""]
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
}: ReimbursementsTableProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "admin";

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRequestDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTargetId) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(deleteTargetId);
      setDeleteTargetId(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId, onDelete]);

  const columns = useMemo<ColumnDef<ReimbursementRow>[]>(
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
              <Avatar className="size-8">
                <AvatarImage
                  alt={user.name}
                  src={buildAvatarUrl(user.email, user.gender)}
                />
                <AvatarFallback>
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
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
          return (
            <span className="text-sm">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
              }).format(total)}
            </span>
          );
        },
        meta: { headerTitle: "Total", skeleton: SKELETON_TOTAL },
        size: 120,
      },
      {
        id: "expenseDate",
        accessorFn: (row) => row.expenseDate,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Expense Date"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.expenseDate
              ? format(new Date(row.original.expenseDate), "dd/MM/yyyy")
              : "—"}
          </span>
        ),
        meta: { headerTitle: "Expense Date", skeleton: SKELETON_DATE },
        size: 130,
      },
      {
        id: "submittedAt",
        accessorFn: (row) =>
          row.submittedAt != null ? format(row.submittedAt, "dd/MM/yyyy") : "—",
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Submitted"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.submittedAt != null
              ? format(row.original.submittedAt, "dd/MM/yyyy")
              : "—"}
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
          const canDelete = isAdmin || (isOwner && r.status === "pending");
          return (
            <ActionsMenu
              canDelete={canDelete}
              onNavigate={onNavigate}
              onRequestDelete={handleRequestDelete}
              reimbursementId={r.id}
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
    [currentUserId, isAdmin, onNavigate, handleRequestDelete]
  );

  return (
    <>
      <DataTableWrapper<ReimbursementRow>
        columns={columns}
        data={data}
        emptyMessage="No reimbursements found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
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
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        open={deleteTargetId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reimbursement</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this reimbursement including all line
              items and attachments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              size="default"
              variant="outline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
