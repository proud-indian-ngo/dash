import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Vendor } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";

export const Route = createFileRoute("/_app/vendors/")({
  head: () => ({
    meta: [{ title: `Vendors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.vendor.all());
  },
  component: VendorsRouteComponent,
});

const STATUS_BADGE_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  approved: { label: "Approved", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
};

function searchVendor(row: Vendor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.contactPhone, row.contactEmail ?? "", row.status]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function VendorsRouteComponent() {
  const { isAdmin } = useApp();
  const zero = useZero();
  const [vendors, vendorsResult] = useQuery(queries.vendor.all());
  const isLoading = useZeroQueryStatus(vendorsResult);

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const onDeleteRef = useRef<((vendor: Vendor) => Promise<void>) | undefined>(
    undefined
  );

  const handleDelete = useCallback(
    async (vendor: Vendor) => {
      try {
        await zero.mutate(mutators.vendor.delete({ id: vendor.id }));
        toast.success("Vendor deleted");
      } catch {
        toast.error("Failed to delete vendor");
      }
    },
    [zero]
  );
  onDeleteRef.current = handleDelete;

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      await onDeleteRef.current?.(deleteTarget);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const columns = useMemo<ColumnDef<Vendor>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Name"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-sm">{row.original.name}</span>
        ),
        size: 200,
      },
      {
        id: "contactPhone",
        accessorFn: (row) => row.contactPhone,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Phone"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.contactPhone}</span>
        ),
        size: 150,
      },
      {
        id: "contactEmail",
        accessorFn: (row) => row.contactEmail,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Email"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.contactEmail ?? "—"}
          </span>
        ),
        size: 200,
      },
      {
        id: "bankAccount",
        accessorFn: (row) => row.bankAccountName,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Bank Account"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.bankAccountName} (••••
            {row.original.bankAccountNumber.slice(-4)})
          </span>
        ),
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
          const status = row.original.status ?? "pending";
          const badge = STATUS_BADGE_MAP[status] ?? {
            label: status,
            variant: "secondary" as const,
          };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
        size: 120,
      },
      ...(isAdmin
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: Vendor } }) => (
                <div className="flex gap-1">
                  <Button
                    onClick={() => {
                      setEditingVendor(row.original);
                      setFormOpen(true);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => setDeleteTarget(row.original)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              ),
              enableHiding: false,
              enableResizing: false,
              enableSorting: false,
              size: 120,
            } as ColumnDef<Vendor>,
          ]
        : []),
    ],
    [isAdmin]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Vendors</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {isAdmin
          ? "Manage vendors and their details."
          : "View approved vendors."}
      </p>

      <div className="mt-6">
        <DataTableWrapper<Vendor>
          columns={columns}
          data={(vendors ?? []) as Vendor[]}
          emptyMessage="No vendors found."
          getRowId={(row) => row.id}
          isLoading={isLoading}
          searchFn={searchVendor}
          searchPlaceholder="Search vendors..."
          storageKey="vendors_table_state_v1"
          toolbarActions={
            isAdmin ? (
              <Button
                onClick={() => {
                  setEditingVendor(null);
                  setFormOpen(true);
                }}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add vendor
              </Button>
            ) : undefined
          }
        />
      </div>

      <VendorFormDialog
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingVendor(null);
          }
        }}
        open={formOpen}
        vendor={editingVendor}
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete this vendor and all associated payment requests. This action cannot be undone."
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title="Delete vendor"
      />
    </div>
  );
}
