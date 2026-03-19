import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { computeAdvancePaymentStats } from "@/components/advance-payments/advance-payment-stats";
import { AdvancePaymentsTable } from "@/components/advance-payments/advance-payments-table";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import { deleteUploadedAssets } from "@/functions/attachments";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export const Route = createFileRoute("/_app/advance-payments/")({
  head: () => ({
    meta: [{ title: `Advance Payments | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.advancePayment.all());
  },
  component: AdvancePaymentsRouteComponent,
});

function AdvancePaymentsRouteComponent() {
  const { isAdmin } = useApp();
  const navigate = useNavigate();
  const zero = useZero();

  const [data, result] = useQuery(queries.advancePayment.all());
  const isLoading = useZeroQueryStatus(result);

  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsString.withDefault("")
  );

  const filteredData = useMemo(() => {
    if (!statusFilter) {
      return data ?? [];
    }
    return (data ?? []).filter((r) => r.status === statusFilter);
  }, [data, statusFilter]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const item = await zero.run(queries.advancePayment.byId({ id }));
        const r2Keys =
          item?.attachments
            ?.filter((a) => a.type === "file" && a.objectKey)
            .map((a) => a.objectKey as string) ?? [];

        if (r2Keys.length > 0) {
          await deleteUploadedAssets({ data: { keys: r2Keys } });
        }

        await zero.mutate(mutators.advancePayment.delete({ id }));
        toast.success("Advance payment deleted");
      } catch {
        toast.error("Failed to delete advance payment");
      }
    },
    [zero]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Advance Payments</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {isAdmin
          ? "Review and manage all advance payment requests."
          : "Submit and track your advance payment requests."}
      </p>

      <div className="mt-6 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          items={computeAdvancePaymentStats(data ?? [])}
        />
        <AdvancePaymentsTable
          data={filteredData}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/advance-payments/$id", params: { id } });
          }}
          toolbarActions={
            <Button
              onClick={() => {
                navigate({ to: "/advance-payments/new" });
              }}
              size="sm"
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              New request
            </Button>
          }
          toolbarFilters={
            <TableFilterSelect
              label="Status"
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              value={statusFilter}
            />
          }
        />
      </div>
    </div>
  );
}
