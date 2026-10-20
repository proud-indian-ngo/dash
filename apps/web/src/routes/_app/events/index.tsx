import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { countReviewableInterests } from "@/components/events/event-row-action";
import { EventsAgenda } from "@/components/events/events-agenda";
import type { PublicEventRow } from "@/components/events/public-events-table";
import { PageHeader } from "@/components/shared/page-header";
import { TipStrip } from "@/components/shared/tip-strip";
import { useApp } from "@/context/app-context";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isTeamLead } from "@/lib/team-utils";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/events/")({
  component: PublicEventsRouteComponent,
  head: () => ({
    meta: [{ title: `Events | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.teamEvent.allAccessible(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.eventInterest.byCurrentUser(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.team.byCurrentUser(),
      abortController.signal
    );
  },
});

function PublicEventsRouteComponent() {
  const { session } = Route.useRouteContext();
  const [data, result] = useQuery(queries.teamEvent.allAccessible());
  const isLoading = data.length === 0 && isAwaitingResult(result);
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const [myTeams] = useQuery(queries.team.byCurrentUser());
  const myTeamIds = useMemo(() => new Set(myTeams.map((t) => t.id)), [myTeams]);
  const { hasPermission } = useApp();
  // Reviewers see how many interest requests each event is waiting on.
  const canReviewInterest =
    hasPermission("events.manage_interest") ||
    myTeams.some((t) => isTeamLead(t.members, session.user.id));
  // The dashboard's query on purpose: it shares the cached sync, and its
  // related event gives the start time the badge needs.
  const [pendingInterests] = useQuery(queries.eventInterest.allPending(), {
    enabled: canReviewInterest,
  });
  const pendingInterestCounts = useMemo(
    () => countReviewableInterests(pendingInterests, Date.now()),
    [pendingInterests]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="What's coming up across Proud Indian."
        title="Events"
      />
      <TipStrip className="mt-4" id="events-interest">
        Show interest in an event, and the team will confirm your spot.
      </TipStrip>
      <div className="mt-4">
        <EventsAgenda
          data={data as PublicEventRow[]}
          isLoading={isLoading}
          myInterests={myInterests}
          myTeamIds={myTeamIds}
          pendingInterestCounts={pendingInterestCounts}
          userId={session.user.id}
        />
      </div>
    </div>
  );
}
