import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StatsCards } from "@/components/stats/stats-cards";
import { computeVendorPaymentStats } from "@/components/vendor-payments/vendor-payment-stats";
import type { VendorPaymentWithRelations } from "@/components/vendor-payments/vendor-payment-types";
import { VendorPaymentsTable } from "@/components/vendor-payments/vendor-payments-table";
import { useApp } from "@/context/app-context";

export const Route = createFileRoute("/_app/vendor-payments/")({
  component: VendorPaymentsRouteComponent,
  head: () => ({
    meta: [{ title: `Vendor Payments | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.vendorPayment.all());
  },
});

function VendorPaymentsRouteComponent() {
  const navigate = useNavigate();
  const zero = useZero();
  const { hasPermission } = useApp();
  const canDelete = hasPermission("requests.delete_all");

  const handleDelete = useEventCallback(
    async (id: string) =>
      await zero.mutate(mutators.vendorPayment.delete({ id })).server
  );
  const [vendorPayments, result] = useQuery(queries.vendorPayment.all());

  const data = vendorPayments as VendorPaymentWithRelations[];
  const isLoading = data.length === 0 && result.type !== "complete";
  const stableOnNavigate1 = useEventCallback((id: string) => {
    navigate({ params: { id }, to: "/vendor-payments/$id" });
  });
  const stableOnClick2 = useEventCallback(() =>
    navigate({ to: "/vendor-payments/new" })
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Vendor Payments
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          items={computeVendorPaymentStats(data)}
        />
        <VendorPaymentsTable
          canDelete={canDelete}
          data={data}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={stableOnNavigate1}
          toolbarActions={
            hasPermission("requests.create") ? (
              <Button onClick={stableOnClick2} size="sm" type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add vendor payment
              </Button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
