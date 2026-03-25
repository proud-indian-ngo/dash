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
import { VendorDetailSheet } from "@/components/vendors/vendor-detail-sheet";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import { VendorsTable } from "@/components/vendors/vendors-table";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import { handleMutationResult } from "@/lib/mutation-result";

export const Route = createFileRoute("/_app/vendors/")({
  head: () => ({
    meta: [{ title: `Vendors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.vendor.all());
  },
  component: VendorsRouteComponent,
});

function VendorsRouteComponent() {
  const zero = useZero();
  const [vendors, vendorsResult] = useQuery(queries.vendor.all());
  const isLoading = useZeroQueryStatus(vendorsResult);

  const [formOpen, setFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);

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

  const handleApprove = async (vendor: Vendor) => {
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

  const handleUnapprove = async (vendor: Vendor) => {
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

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormOpen(true);
  };

  const handleView = (vendor: Vendor) => {
    setViewingVendor(vendor);
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Vendors</h1>

      <div className="fade-in-0 mt-4 grid animate-in gap-6 fill-mode-backwards duration-200 *:min-w-0">
        <VendorsTable
          data={(vendors ?? []) as Vendor[]}
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
