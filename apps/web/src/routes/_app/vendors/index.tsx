import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Vendor } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
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

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await zero.mutate(mutators.vendor.delete({ id })).server;
      handleMutationResult(res, {
        mutation: "vendor.delete",
        entityId: id,
        successMsg: "Vendor deleted",
        errorMsg: "Failed to delete vendor",
      });
      return res;
    },
    [zero]
  );

  const handleEdit = useCallback((vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormOpen(true);
  }, []);

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Vendors</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Manage vendors and their details.
      </p>

      <div className="mt-6 grid gap-6 *:min-w-0">
        <VendorsTable
          data={(vendors ?? []) as Vendor[]}
          isLoading={isLoading}
          onDelete={handleDelete}
          onEdit={handleEdit}
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
    </div>
  );
}
