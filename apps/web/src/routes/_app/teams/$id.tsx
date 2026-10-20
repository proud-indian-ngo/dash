import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/shared/not-found-state";
import { DetailPageSkeleton } from "@/components/shared/page-skeleton";
import { TeamDetail } from "@/components/teams/team-detail";
import { useRecordTitle } from "@/hooks/use-record-title";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/teams/$id")({
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.team.byId({ id: params.id }),
      abortController.signal
    );
  },
  head: () => ({
    meta: [{ title: `Team Details | ${env.VITE_APP_NAME}` }],
  }),
  component: TeamDetailRouteComponent,
});

function TeamDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const [team, result] = useQuery(queries.team.byId({ id }));
  useRecordTitle(team?.name);

  if (!team && isAwaitingResult(result)) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <DetailPageSkeleton />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <RecordNotFound backLabel="Back to teams" backTo="/teams" noun="Team" />
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <TeamDetail team={team} userId={session.user.id} />
    </div>
  );
}
