import { Agreement02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import type { GrantStatus } from "@pi-dash/shared/constants";
import { epochDayToIso, todayInKolkata } from "@pi-dash/shared/income";
import { sumPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { GrantFormDialog } from "@/components/grants/grant-form-dialog";
import { type GrantRow, GrantsTable } from "@/components/grants/grants-table";
import { useGrantUtilisation } from "@/components/grants/use-grant-utilisation";
import { ErrorState } from "@/components/shared/error-state";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { useApp } from "@/context/app-context";
import { assertPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/finance/grants/")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.view"),
  component: GrantsPage,
  head: () => ({
    meta: [{ title: `Grants | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.grant.all(),
      abortController.signal
    );
  },
});

function GrantsPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const [creating, setCreating] = useState(false);
  const [grants, grantsResult] = useQuery(queries.grant.all());
  // Everything recorded for every grant: up to the latest end date, or
  // today once every grant has ended. Each grant's spend stops at its own end.
  const lastDay = grants
    .map((g) => epochDayToIso(g.endsOn))
    .reduce((latest, day) => (day > latest ? day : latest), todayInKolkata());
  // Wait for the grants to sync, so the range is fetched once.
  const synced = !isAwaitingResult(grantsResult);
  const { error, retry, rows } = useGrantUtilisation(
    synced ? { from: null, grantId: null, to: lastDay } : null
  );

  const isLoading = grants.length === 0 && !synced;
  const sumFor = (
    list: readonly { grantId: string; paise: number }[] | undefined,
    grantId: string
  ) =>
    list
      ? sumPaise(list.filter((r) => r.grantId === grantId).map((r) => r.paise))
      : null;
  const data: GrantRow[] = grants.map((g) => ({
    endsOn: g.endsOn,
    grantor: g.party?.displayName ?? "Grantor",
    id: g.id,
    programmeId: g.programmeId,
    programmeName: g.programme?.name ?? "Programme",
    projectName: g.project?.name ?? "Project",
    receivedPaise: sumFor(rows?.receipts, g.id),
    refundedPaise: sumFor(rows?.refunds, g.id),
    sanctionedPaise: g.sanctionedPaise,
    spentPaise: sumFor(rows?.spend, g.id),
    startsOn: g.startsOn,
    status: g.status as GrantStatus,
    title: g.title,
  }));

  const newGrantButton = canManage ? (
    <Button onClick={() => setCreating(true)} type="button">
      <HugeiconsIcon className="size-4" icon={PlusSignIcon} strokeWidth={2} />
      New grant
    </Button>
  ) : null;

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={newGrantButton}
        description="CSR and specific grants: what each sanctioned, received and its project has spent."
        title="Grants"
      />
      {isLoading ? (
        <div className="mt-4">
          <TableSkeleton />
        </div>
      ) : grants.length === 0 ? (
        <NotFoundState
          actions={newGrantButton}
          className="mt-6"
          description="A grant tracks an agreement's money against the project it funds."
          icon={Agreement02Icon}
          title="No grants"
        />
      ) : (
        <div className="mt-4 grid gap-4 *:min-w-0">
          {error ? (
            <ErrorState
              actions={
                <Button onClick={retry} type="button">
                  Try again
                </Button>
              }
              error={error}
            />
          ) : null}
          <GrantsTable
            data={data}
            figuresFailed={Boolean(error)}
            isLoading={false}
          />
        </div>
      )}
      <GrantFormDialog
        grant={null}
        onOpenChange={setCreating}
        open={creating}
      />
    </div>
  );
}
