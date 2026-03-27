import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { StatsCards } from "@/components/stats/stats-cards";
import type { VendorPaymentWithRelations } from "@/components/vendor-payments/vendor-payment-types";
import { VendorPaymentsTable } from "@/components/vendor-payments/vendor-payments-table";
import { useApp } from "@/context/app-context";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Partially Paid", value: "partially_paid" },
  { label: "Paid", value: "paid" },
];

export const Route = createFileRoute("/_app/vendor-payments/")({
  head: () => ({
    meta: [{ title: `Vendor Payments | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.vendorPayment.all());
  },
  component: VendorPaymentsRouteComponent,
});

function VendorPaymentsRouteComponent() {
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const [vendorPayments, result] = useQuery(queries.vendorPayment.all());
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsString
  );

  const data = (vendorPayments ?? []) as VendorPaymentWithRelations[];

  const filtered = statusFilter
    ? data.filter((vp) => vp.status === statusFilter)
    : data;

  const stats = [
    { label: "Total", value: data.length },
    {
      label: "Pending",
      value: data.filter((vp) => vp.status === "pending").length,
    },
    {
      label: "Approved",
      value: data.filter((vp) => vp.status === "approved").length,
    },
    {
      label: "Partially Paid",
      value: data.filter((vp) => vp.status === "partially_paid").length,
    },
    {
      label: "Paid",
      value: data.filter((vp) => vp.status === "paid").length,
    },
  ];

  const isLoading = data.length === 0 && result.type !== "complete";

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Vendor Payments
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards isLoading={isLoading} items={stats} />
        <VendorPaymentsTable
          data={filtered}
          isLoading={isLoading}
          onNavigate={(id) => {
            navigate({ to: "/vendor-payments/$id", params: { id } });
          }}
          toolbarActions={
            hasPermission("requests.create") ? (
              <Button
                onClick={() => navigate({ to: "/vendor-payments/new" })}
                size="sm"
                type="button"
              >
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
            <TableFilterSelect
              label="Status"
              onChange={(val) => setStatusFilter(val || null)}
              options={STATUS_OPTIONS}
              value={statusFilter ?? ""}
            />
          }
        />
      </div>
    </div>
  );
}
