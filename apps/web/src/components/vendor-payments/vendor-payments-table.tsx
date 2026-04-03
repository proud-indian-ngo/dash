import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { SHORT_DATE } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";
import { getStatusBadge } from "@/lib/status-badge";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

function computeTotal(
  lineItems: VendorPaymentWithRelations["lineItems"]
): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

const SKELETON_TITLE = <Skeleton className="h-5 w-40" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-24" />;
const SKELETON_STATUS = <Skeleton className="h-6 w-16" />;
const SKELETON_TOTAL = <Skeleton className="h-5 w-20" />;

function searchFn(row: VendorPaymentWithRelations, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) {
    return true;
  }
  return [
    row.title,
    row.vendor?.name ?? "",
    row.status,
    row.user?.name ?? "",
    row.invoiceNumber ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

interface VendorPaymentsTableProps {
  data: VendorPaymentWithRelations[];
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onClearFilters?: () => void;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

export function VendorPaymentsTable({
  data,
  isLoading,
  onNavigate,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: VendorPaymentsTableProps) {
  const columns: ColumnDef<VendorPaymentWithRelations>[] = [
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
      id: "vendor",
      accessorFn: (row) => row.vendor?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Vendor"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.vendor?.name ?? "—"}
        </span>
      ),
      meta: { headerTitle: "Vendor", skeleton: SKELETON_TEXT },
      size: 180,
      minSize: 120,
    },
    {
      id: "submittedBy",
      accessorFn: (row) => row.user?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Submitted by"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.user?.name ?? "—"}
        </span>
      ),
      meta: { headerTitle: "Submitted by", skeleton: SKELETON_TEXT },
      size: 150,
      minSize: 120,
    },
    {
      id: "total",
      accessorFn: (row) => computeTotal(row.lineItems),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Amount"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm tabular-nums">
          {formatINR(computeTotal(row.original.lineItems))}
        </span>
      ),
      meta: { headerTitle: "Amount", skeleton: SKELETON_TOTAL },
      size: 120,
      minSize: 100,
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
      meta: { headerTitle: "Submitted", skeleton: SKELETON_TEXT },
      size: 130,
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
      size: 130,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
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
            <DropdownMenuItem
              onClick={() => onNavigate(row.original.id as string)}
            >
              View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: { cellClassName: "text-center" },
      size: 52,
      minSize: 52,
    },
  ];

  return (
    <DataTableWrapper<VendorPaymentWithRelations>
      columns={columns}
      data={data}
      emptyMessage="No vendor payments found."
      getRowId={(row) => row.id as string}
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      onClearFilters={onClearFilters}
      onRowClick={(row) => onNavigate(row.id as string)}
      searchFn={searchFn}
      searchPlaceholder="Search vendor payments..."
      storageKey="vendor_payments_table_state_v1"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      toolbarActions={toolbarActions}
      toolbarFilters={toolbarFilters}
    />
  );
}
