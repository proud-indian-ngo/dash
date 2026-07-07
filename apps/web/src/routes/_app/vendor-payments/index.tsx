import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { StatsCards } from "@/components/stats/stats-cards";
import { computeVendorPaymentStats } from "@/components/vendor-payments/vendor-payment-stats";
import type { VendorPaymentWithRelations } from "@/components/vendor-payments/vendor-payment-types";
import { VendorPaymentsTable } from "@/components/vendor-payments/vendor-payments-table";
import { useApp } from "@/context/app-context";
import { cityOptions } from "@/lib/form-schemas";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Partially Paid", value: "partially_paid" },
  { label: "Paid", value: "paid" },
  { label: "Invoice Pending", value: "invoice_pending" },
  { label: "Completed", value: "completed" },
];

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

  const handleDelete = async (id: string) =>
    await zero.mutate(mutators.vendorPayment.delete({ id })).server;
  const [vendorPayments, result] = useQuery(queries.vendorPayment.all());
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsString
  );
  const [cityFilter, setCityFilter] = useQueryState("city", parseAsString);

  const data = vendorPayments as VendorPaymentWithRelations[];

  const filtered = (() => {
    let result = data;
    if (statusFilter) {
      result = result.filter((vp: any) => vp.status === statusFilter);
    }
    if (cityFilter) {
      result = result.filter((vp: any) => vp.city === cityFilter);
    }
    return result;
  })();

  const isLoading = data.length === 0 && result.type !== "complete";
  const stableOnClearFilters0 = () => {
    setStatusFilter(null);
    setCityFilter(null);
  };
  const stableOnNavigate1 = (id: any) => {
    navigate({ params: { id }, to: "/vendor-payments/$id" });
  };
  const stableOnClick2 = () => navigate({ to: "/vendor-payments/new" });
  const stableOnChange3 = (val: any) => setCityFilter(val || null);
  const stableOnChange4 = (val: any) => setStatusFilter(val || null);

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
          data={filtered}
          hasActiveFilters={!!(statusFilter || cityFilter)}
          isLoading={isLoading}
          onClearFilters={stableOnClearFilters0}
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
          toolbarFilters={
            <>
              <TableFilterSelect
                label="City"
                onChange={stableOnChange3}
                options={cityOptions}
                value={cityFilter ?? ""}
              />
              <TableFilterSelect
                label="Status"
                onChange={stableOnChange4}
                options={STATUS_OPTIONS}
                value={statusFilter ?? ""}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
