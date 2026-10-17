import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useUnallocatedAttentionView } from "@/components/expenses/unallocated-attention-view";
import { VoidDialog } from "@/components/form/void-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { TipStrip } from "@/components/shared/tip-strip";
import {
  isVoided,
  usePostedSourceIds,
  useVoidedFilter,
} from "@/components/shared/void";
import { StatsCards } from "@/components/stats/stats-cards";
import { computeVendorPaymentStats } from "@/components/vendor-payments/vendor-payment-stats";
import type { VendorPaymentWithRelations } from "@/components/vendor-payments/vendor-payment-types";
import { VendorPaymentsTable } from "@/components/vendor-payments/vendor-payments-table";
import { useApp } from "@/context/app-context";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/vendor-payments/")({
  component: VendorPaymentsRouteComponent,
  head: () => ({
    meta: [{ title: `Vendor Payments | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.vendorPayment.all(),
      abortController.signal
    );
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
  // In the books: its expense or any of its payments stands there.
  const postedRequests = usePostedSourceIds("vendor_payment");
  const postedPayments = usePostedSourceIds("vendor_payment_transaction");
  const postedIds = new Set(
    data
      .filter(
        (vp) =>
          postedRequests.has(vp.id) ||
          (vp.transactions ?? []).some((t) => postedPayments.has(t.id))
      )
      .map((vp) => vp.id)
  );
  const voidedFilter = useVoidedFilter(data);
  const unallocatedView = useUnallocatedAttentionView(data);
  const [voidTarget, setVoidTarget] =
    useState<VendorPaymentWithRelations | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const handleVoidOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setVoidTarget(null);
    }
  });
  const handleVoid = useEventCallback(async (reason: string) => {
    if (!voidTarget) {
      return;
    }
    setVoidLoading(true);
    const res = await zero
      .mutate(mutators.vendorPayment.void({ id: voidTarget.id, reason }))
      .server.finally(() => setVoidLoading(false));
    handleMutationResult(res, {
      entityId: voidTarget.id,
      errorMsg: getMutationResultErrorMessage(
        res.type === "error" ? res.error : undefined,
        "Couldn't void the vendor payment"
      ),
      mutation: "vendorPayment.void",
      successMsg: "Vendor payment voided",
    });
    if (res.type !== "error") {
      setVoidTarget(null);
    }
  });
  const stableOnNavigate1 = useEventCallback((id: string) => {
    navigate({ params: { id }, to: "/vendor-payments/$id" });
  });
  const stableOnClick2 = useEventCallback(() =>
    navigate({ to: "/vendor-payments/new" })
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          hasPermission("requests.create") ? (
            <Button onClick={stableOnClick2} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add vendor payment
            </Button>
          ) : null
        }
        description="Payments to vendors, from quotation through approval to invoice."
        title="Vendor Payments"
      />
      {hasPermission("requests.create") ? (
        <TipStrip className="mt-4" id="vendor-payments-flow">
          Start with the vendor's quotation. Once it's approved and paid, you'll
          upload their invoice to close it out.
        </TipStrip>
      ) : null}

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          // A voided request counts in no total.
          items={computeVendorPaymentStats(data.filter((vp) => !isVoided(vp)))}
        />
        <VendorPaymentsTable
          attentionViews={unallocatedView ? [unallocatedView] : undefined}
          canDelete={canDelete}
          data={voidedFilter.rows}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={stableOnNavigate1}
          onVoid={setVoidTarget}
          postedIds={postedIds}
          toolbarActions={voidedFilter.button}
        />
      </div>
      <VoidDialog
        entityLabel="vendor payment and its payments"
        loading={voidLoading}
        onConfirm={handleVoid}
        onOpenChange={handleVoidOpenChange}
        open={voidTarget !== null}
      />
    </div>
  );
}
