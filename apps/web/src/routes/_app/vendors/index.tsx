import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
  component: VendorsRouteComponent,
  head: () => ({
    meta: [{ title: `Vendors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.vendor.all());
    context.zero?.preload(queries.vendorPayment.all());
  },
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
  const [viewingVendorId, setViewingVendorId] = useState<string | null>(null);
  const viewingVendor = viewingVendorId
    ? (vendorRows.find((v) => v.id === viewingVendorId) ?? null)
    : null;

  const handleDelete = useEventCallback(async (id: string) => {
    const res = await zero.mutate(mutators.vendor.delete({ id })).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't delete vendor",
      mutation: "vendor.delete",
      successMsg: "Vendor deleted",
    });
    return res;
  });

  const handleApprove = useEventCallback(async (vendor: VendorRow) => {
    const res = await zero.mutate(mutators.vendor.approve({ id: vendor.id }))
      .server;
    handleMutationResult(res, {
      entityId: vendor.id,
      errorMsg: "Couldn't approve vendor",
      mutation: "vendor.approve",
      successMsg: "Vendor approved",
    });
    return res;
  });

  const handleUnapprove = useEventCallback(async (vendor: VendorRow) => {
    const res = await zero.mutate(mutators.vendor.unapprove({ id: vendor.id }))
      .server;
    handleMutationResult(res, {
      entityId: vendor.id,
      errorMsg: "Couldn't unapprove vendor",
      mutation: "vendor.unapprove",
      successMsg: "Vendor unapproved",
    });
    return res;
  });

  const handleEdit = useEventCallback((vendor: VendorRow) => {
    setEditingVendor(vendor);
    setFormOpen(true);
  });

  const handleView = useEventCallback((vendor: VendorRow) => {
    setViewingVendorId(vendor.id);
  });
  const stableOnClick1 = useEventCallback(() => {
    setEditingVendor(null);
    setFormOpen(true);
  });
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditingVendor(null);
    }
  });
  const stableOnOpenChange3 = useEventCallback((open: boolean) => {
    if (!open) {
      setViewingVendorId(null);
    }
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Vendors
      </h1>

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
            <Button onClick={stableOnClick1} size="sm" type="button">
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
        onOpenChange={stableOnOpenChange2}
        open={formOpen}
        vendor={editingVendor}
      />

      <VendorDetailSheet
        onOpenChange={stableOnOpenChange3}
        open={!!viewingVendor}
        vendor={viewingVendor}
      />
    </div>
  );
}
