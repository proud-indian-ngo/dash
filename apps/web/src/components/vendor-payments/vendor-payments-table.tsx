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
  isLoading?: boolean;
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
}: VendorPaymentsTableProps) {
  const columns: ColumnDef<VendorPaymentWithRelations>[] = [
    {
      id: "title",
      accessorKey: "title",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Title" visibility />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
      meta: { headerTitle: "Title", skeleton: SKELETON_TITLE },
      size: 250,
    },
    {
      id: "vendor",
      accessorFn: (row) => row.vendor?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Vendor" visibility />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.vendor?.name ?? "—"}
        </span>
      ),
      meta: { headerTitle: "Vendor", skeleton: SKELETON_TEXT },
      size: 180,
    },
    {
      id: "submittedBy",
      accessorFn: (row) => row.user?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Submitted by" visibility />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.user?.name ?? "—"}
        </span>
      ),
      meta: { headerTitle: "Submitted by", skeleton: SKELETON_TEXT },
      size: 150,
    },
    {
      id: "total",
      accessorFn: (row) => computeTotal(row.lineItems),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Amount" visibility />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatINR(computeTotal(row.original.lineItems))}
        </span>
      ),
      meta: { headerTitle: "Amount", skeleton: SKELETON_TOTAL },
      size: 120,
    },
    {
      id: "date",
      accessorKey: "submittedAt",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Date" visibility />
      ),
      cell: ({ row }) =>
        row.original.submittedAt ? (
          <span className="text-muted-foreground">
            {format(row.original.submittedAt, SHORT_DATE)}
          </span>
        ) : (
          "—"
        ),
      meta: { headerTitle: "Date", skeleton: SKELETON_TEXT },
      size: 120,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Status" visibility />
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
      header: () => null,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Row actions"
                className="size-8"
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
              onClick={() => onNavigate(row.original.id as string)}
            >
              View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ];

  return (
    <DataTableWrapper<VendorPaymentWithRelations>
      columns={columns}
      data={data}
      getRowId={(row) => row.id as string}
      isLoading={isLoading}
      onRowClick={(row) => onNavigate(row.id as string)}
      searchFn={searchFn}
      searchPlaceholder="Search vendor payments..."
      searchQueryKey="s"
      storageKey="vendor_payments_table_state_v1"
      toolbarActions={toolbarActions}
      toolbarFilters={toolbarFilters}
    />
  );
}
