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
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatsCards } from "@/components/stats/stats-cards";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { computeVendorPaymentStats } from "@/components/vendors/vendor-stats";
import { VendorsTable } from "@/components/vendors/vendors-table";
import { deleteVendor } from "@/functions/vendors";
import { handleMutationResult } from "@/lib/mutation-result";
import { preloadRouteQuery } from "@/lib/route-preload";
import { enrichVendorsWithPayments, type VendorRow } from "@/lib/vendor-types";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/vendors/")({
  component: VendorsRouteComponent,
  head: () => ({
    meta: [{ title: `Vendors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.vendor.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.vendorPayment.all(),
      abortController.signal
    );
  },
});

function VendorsRouteComponent() {
  const zero = useZero();
  const removeVendor = useServerFn(deleteVendor);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [vendors, vendorsResult] = useQuery(queries.vendor.all());
  const [vendorPayments, vpResult] = useQuery(queries.vendorPayment.all());
  const isLoading =
    vendors.length === 0 &&
    vendorPayments.length === 0 &&
    isAwaitingResult(vendorsResult) &&
    isAwaitingResult(vpResult);

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
    try {
      await removeVendor({ data: { vendorId: id } });
      toast.success("Vendor deleted");
      setViewingVendorId((current) => (current === id ? null : current));
      return { type: "success" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      log.error({
        action: "vendor.delete",
        caughtError: message,
        component: "VendorsRoute",
        entityId: id,
      });
      return { error: { message }, type: "error" };
    }
  });

  const handleSaved = useEventCallback(() => {
    setDetailsVersion((v) => v + 1);
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
      <PageHeader
        actions={
          <Button onClick={stableOnClick1} type="button">
            <HugeiconsIcon
              className="size-4"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add vendor
          </Button>
        }
        description="Suppliers Proud Indian pays, with their contact and bank details."
        title="Vendors"
      />

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards isLoading={isLoading} items={stats} />
        <VendorsTable
          data={vendorRows}
          detailVendor={viewingVendor}
          detailsVersion={detailsVersion}
          isLoading={isLoading}
          onApprove={handleApprove}
          onDelete={handleDelete}
          onDetailOpenChange={stableOnOpenChange3}
          onEdit={handleEdit}
          onUnapprove={handleUnapprove}
          onView={handleView}
        />
      </div>

      <VendorFormDialog
        onOpenChange={stableOnOpenChange2}
        onSaved={handleSaved}
        open={formOpen}
        vendor={editingVendor}
      />
    </div>
  );
}
