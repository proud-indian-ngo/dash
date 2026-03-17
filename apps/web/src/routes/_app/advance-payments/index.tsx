import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { computeAdvancePaymentStats } from "@/components/advance-payments/advance-payment-stats";
import { AdvancePaymentsTable } from "@/components/advance-payments/advance-payments-table";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import { deleteUploadedAssets } from "@/functions/attachments";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";

export const Route = createFileRoute("/_app/advance-payments/")({
  head: () => ({
    meta: [{ title: "Advance Payments | Proud Indian Dashboard" }],
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

      <div className="mt-6 grid gap-6">
        <StatsCards
          isLoading={isLoading}
          items={computeAdvancePaymentStats(data ?? [])}
        />
        <AdvancePaymentsTable
          data={data ?? []}
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
        />
      </div>
    </div>
  );
}
