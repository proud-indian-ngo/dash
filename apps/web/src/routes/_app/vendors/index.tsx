import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Vendor } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StatsCards } from "@/components/stats/stats-cards";
import { VendorDetailSheet } from "@/components/vendors/vendor-detail-sheet";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { computeVendorPaymentStats } from "@/components/vendors/vendor-stats";
import { VendorsTable } from "@/components/vendors/vendors-table";
import { handleMutationResult } from "@/lib/mutation-result";
import { enrichVendorsWithPayments, type VendorRow } from "@/lib/vendor-types";

export const Route = createFileRoute("/_app/vendors/")({
  head: () => ({
    meta: [{ title: `Vendors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.vendor.all());
    context.zero?.run(queries.vendorPayment.all());
  },
  component: VendorsRouteComponent,
});

function VendorsRouteComponent() {
  const zero = useZero();
  const [vendors, vendorsResult] = useQuery(queries.vendor.all());
  const [vendorPayments, vpResult] = useQuery(queries.vendorPayment.all());
  const isLoading =
    vendors.length === 0 &&
    vendorPayments.length === 0 &&
    vendorsResult.type !== "complete" &&
    vpResult.type !== "complete";

  const vendorRows = enrichVendorsWithPayments(
    vendors ?? [],
    vendorPayments ?? []
  );
  const stats = computeVendorPaymentStats(vendorPayments ?? []);

  const [formOpen, setFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<VendorRow | null>(null);

  const handleDelete = async (id: string) => {
    const res = await zero.mutate(mutators.vendor.delete({ id })).server;
    handleMutationResult(res, {
      mutation: "vendor.delete",
      entityId: id,
      successMsg: "Vendor deleted",
      errorMsg: "Failed to delete vendor",
    });
    return res;
  };

  const handleApprove = async (vendor: VendorRow) => {
    const res = await zero.mutate(mutators.vendor.approve({ id: vendor.id }))
      .server;
    handleMutationResult(res, {
      mutation: "vendor.approve",
      entityId: vendor.id,
      successMsg: "Vendor approved",
      errorMsg: "Failed to approve vendor",
    });
    return res;
  };

  const handleUnapprove = async (vendor: VendorRow) => {
    const res = await zero.mutate(mutators.vendor.unapprove({ id: vendor.id }))
      .server;
    handleMutationResult(res, {
      mutation: "vendor.unapprove",
      entityId: vendor.id,
      successMsg: "Vendor unapproved",
      errorMsg: "Failed to unapprove vendor",
    });
    return res;
  };

  const handleEdit = (vendor: VendorRow) => {
    setEditingVendor(vendor);
    setFormOpen(true);
  };

  const handleView = (vendor: VendorRow) => {
    setViewingVendor(vendor);
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Vendors</h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards isLoading={isLoading} items={stats} />
        <VendorsTable
          data={vendorRows}
          isLoading={isLoading}
          onApprove={handleApprove}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onUnapprove={handleUnapprove}
          onView={handleView}
          toolbarActions={
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

      <VendorDetailSheet
        onOpenChange={(open) => {
          if (!open) {
            setViewingVendor(null);
          }
        }}
        open={!!viewingVendor}
        vendor={viewingVendor}
      />
    </div>
  );
}
