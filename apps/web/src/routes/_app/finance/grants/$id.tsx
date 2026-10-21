import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { GrantDetail } from "@/components/grants/grant-detail";
import { RecordNotFound } from "@/components/shared/not-found-state";
import { RecordDetailSkeleton } from "@/components/shared/page-skeleton";
import { useApp } from "@/context/app-context";
import { useRecordTitle } from "@/hooks/use-record-title";
import { assertPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/finance/grants/$id")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.view"),
  component: GrantRoute,
  head: () => ({
    meta: [{ title: `Grant | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.grant.byId({ id: params.id }),
      abortController.signal
    );
  },
});

function GrantRoute() {
  const { id } = Route.useParams();
  const { hasPermission } = useApp();
  const [grant, result] = useQuery(queries.grant.byId({ id }));
  useRecordTitle(grant?.title);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      {grant ? (
        <GrantDetail
          canManage={hasPermission("finance.manage")}
          grant={grant}
          key={grant.id}
        />
      ) : isAwaitingResult(result) ? (
        <RecordDetailSkeleton />
      ) : (
        <RecordNotFound
          backLabel="Back to grants"
          backTo="/finance/grants"
          noun="Grant"
        />
      )}
    </div>
  );
}
