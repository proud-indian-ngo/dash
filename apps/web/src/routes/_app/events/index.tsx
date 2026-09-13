import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { EventsCalendarView } from "@/components/events/events-calendar-view";
import type { PublicEventRow } from "@/components/events/public-events-table";
import { preloadRouteQuery } from "@/lib/route-preload";

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
  const isLoading = data.length === 0 && result.type !== "complete";
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const [myTeams] = useQuery(queries.team.byCurrentUser());
  const myTeamIds = new Set(myTeams.map((t) => t.id));

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Events
      </h1>
      <div className="mt-4">
        <EventsCalendarView
          data={data as PublicEventRow[]}
          isLoading={isLoading}
          myInterests={myInterests}
          myTeamIds={myTeamIds}
          userId={session.user.id}
        />
      </div>
    </div>
  );
}
