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
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { authClient } from "@/lib/auth-client";
import { SHORT_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { canEditVendorPaymentSubmission } from "@/lib/request-edit-permissions";
import { getStatusBadge } from "@/lib/status-badge";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

function computeTotal(
  lineItems: VendorPaymentWithRelations["lineItems"]
): number {
  return lineItems.reduce(
    (sum: any, item: any) => sum + Number(item.amount),
    0
  );
}

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;
const SKELETON_USER = (
  <div className="flex items-center gap-3">
    <Skeleton className="size-8 rounded-full" />
    <div className="space-y-1">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  </div>
);

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
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onClearFilters?: () => void;
  onDelete?: (
    id: string
  ) => Promise<{ type: string; error?: { message?: string } }>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

export function VendorPaymentsTable({
  canDelete,
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: VendorPaymentsTableProps) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const { hasPermission } = useApp();
  const deleteAction = useConfirmAction<{ id: string; title: string }>({
    onConfirm: async (payload) =>
      onDelete ? onDelete(payload.id) : { type: "success" },
    onError: (msg: any) => toast.error(msg),
    onSuccess: () => toast.success("Vendor payment removed"),
  });
  const columns: ColumnDef<VendorPaymentWithRelations>[] = [
    {
      accessorFn: (row: any) => row.title,
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
      accessorFn: (row: any) => row.vendor?.name,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
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
      meta: { headerTitle: "Vendor", skeleton: SKELETON_TEXT },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row: any) => row.city,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm capitalize">
          {row.original.city}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      id: "city",
      meta: { headerTitle: "City", skeleton: SKELETON_TEXT },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row: any) => row.event?.name,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.event?.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "event",
      meta: { headerTitle: "Event", skeleton: SKELETON_TEXT },
      minSize: 120,
      size: 180,
    },
    {
      accessorFn: (row: any) => row.user?.name,
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
          title="Submitted by"
          visibility={true}
        />
      ),
      id: "submittedBy",
      meta: { headerTitle: "Submitted by", skeleton: SKELETON_USER },
      minSize: 180,
      size: 220,
    },
    {
      accessorFn: (row: any) => computeTotal(row.lineItems),
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
      meta: { headerTitle: "Amount", skeleton: SKELETON_TOTAL },
      minSize: 100,
      size: 120,
    },
    {
      accessorFn: (row: any) =>
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
      meta: { headerTitle: "Submitted", skeleton: SKELETON_TEXT },
      size: 130,
    },
    {
      accessorFn: (row: any) => row.status,
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
      size: 130,
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

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Row actions"
                  className="size-8"
                  data-testid="row-actions"
                  onClick={(e: any) => e.stopPropagation()}
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
                render={<Link params={{ id }} to="/vendor-payments/$id" />}
              >
                View
              </DropdownMenuItem>
              {canEdit ? (
                <DropdownMenuItem
                  render={
                    <Link
                      params={{ id }}
                      search={{ mode: "edit" }}
                      to="/vendor-payments/$id"
                    />
                  }
                >
                  Edit
                </DropdownMenuItem>
              ) : null}
              {canDelete && onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      deleteAction.trigger({
                        id,
                        title: request.title,
                      })
                    }
                    variant="destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
  const stableGetRowId0 = (row: any) => row.id as string;
  const stableOnRowClick1 = (row: any) => onNavigate(row.id as string);
  const stableOnOpenChange2 = (open: any) => {
    if (!open) {
      deleteAction.cancel();
    }
  };

  return (
    <>
      <DataTableWrapper<VendorPaymentWithRelations>
        columns={columns}
        data={data}
        defaultColumnVisibility={{ event: false }}
        emptyMessage="No vendor payments found."
        getRowId={stableGetRowId0}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onRowClick={stableOnRowClick1}
        searchFn={searchFn}
        searchPlaceholder="Search vendor payments..."
        storageKey="vendor_payments_table_state_v1"
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
    </>
  );
}
