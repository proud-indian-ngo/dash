import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { DataTableAttentionView } from "@/components/data-table/data-table-view-tabs";
import { useUnallocatedAttentionView } from "@/components/expenses/unallocated-attention-view";
import { VoidDialog } from "@/components/form/void-dialog";
import { useMissingProofAttentionView } from "@/components/reimbursements/missing-proof-attention-view";
import { computeReimbursementStats } from "@/components/reimbursements/reimbursement-stats";
import { ReimbursementsTable } from "@/components/reimbursements/reimbursements-table";
import { PageHeader } from "@/components/shared/page-header";
import { TipStrip } from "@/components/shared/tip-strip";
import {
  isVoided,
  usePostedSourceIds,
  useVoidedFilter,
} from "@/components/shared/void";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import {
  normalizeToRequestRows,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/reimbursements/")({
  component: ReimbursementsRouteComponent,
  head: () => ({
    meta: [{ title: `Reimbursements | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.reimbursement.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.advancePayment.all(),
      abortController.signal
    );
  },
});

function getMutatorNs(type: RequestRow["type"]) {
  if (type === "reimbursement") {
    return mutators.reimbursement;
  }
  return mutators.advancePayment;
}

function ReimbursementsRouteComponent() {
  const navigate = useNavigate();
  const zero = useZero();
  const { hasPermission } = useApp();

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const isLoading =
    reimbursements.length === 0 &&
    advancePayments.length === 0 &&
    r1.type !== "complete" &&
    r2.type !== "complete";

  const allData = normalizeToRequestRows(
    reimbursements ?? [],
    advancePayments ?? []
  );

  const postedIds = usePostedSourceIds("reimbursement");
  const voidedFilter = useVoidedFilter(allData);
  const unallocatedView = useUnallocatedAttentionView(reimbursements);
  const missingProofView = useMissingProofAttentionView(allData);
  const attentionViews = [unallocatedView, missingProofView].filter(
    (view): view is DataTableAttentionView => view !== null
  );
  const [voidTarget, setVoidTarget] = useState<RequestRow | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  const handleDelete = useEventCallback(async (row: RequestRow) => {
    const typeLabel = REQUEST_TYPE_LABELS[row.type].toLowerCase();
    const mutatorNs = getMutatorNs(row.type);
    const res = await zero.mutate(mutatorNs.delete({ id: row.id })).server;
    // A request the books hold is refused with "Void it instead".
    handleMutationResult(res, {
      entityId: row.id,
      errorMsg: getMutationResultErrorMessage(
        res.type === "error" ? res.error : undefined,
        `Failed to delete ${typeLabel}`
      ),
      mutation: `${row.type}.delete`,
      successMsg: `${REQUEST_TYPE_LABELS[row.type]} deleted`,
    });
  });
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
      .mutate(mutators.reimbursement.void({ id: voidTarget.id, reason }))
      .server.finally(() => setVoidLoading(false));
    handleMutationResult(res, {
      entityId: voidTarget.id,
      errorMsg: getMutationResultErrorMessage(
        res.type === "error" ? res.error : undefined,
        "Couldn't void the reimbursement"
      ),
      mutation: "reimbursement.void",
      successMsg: "Reimbursement voided",
    });
    if (res.type !== "error") {
      setVoidTarget(null);
    }
  });
  const stableOnNavigate1 = useEventCallback((id: string) => {
    navigate({ params: { id }, to: "/reimbursements/$id" });
  });
  const stableOnClick2 = useEventCallback(() => {
    navigate({ to: "/reimbursements/new" });
  });

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
              Add reimbursement
            </Button>
          ) : null
        }
        description="Money spent on Proud Indian work, claimed back or paid in advance."
        title="Reimbursements"
      />
      {hasPermission("requests.create") &&
      hasPermission("bank_accounts.manage_own") ? (
        <TipStrip
          action={
            <Link
              className="underline-offset-2 hover:underline"
              to="/settings/bank-accounts"
            >
              Open bank accounts
            </Link>
          }
          className="mt-4"
          id="reimbursements-bank-account"
        >
          Add your bank account or UPI once in Settings → Bank accounts, and
          every claim fills it in for you.
        </TipStrip>
      ) : null}

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          // A voided request counts in no total.
          items={computeReimbursementStats(
            allData.filter((row) => !isVoided(row))
          )}
        />
        <ReimbursementsTable
          attentionViews={attentionViews}
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
        entityLabel="reimbursement"
        loading={voidLoading}
        onConfirm={handleVoid}
        onOpenChange={handleVoidOpenChange}
        open={voidTarget !== null}
      />
    </div>
  );
}
