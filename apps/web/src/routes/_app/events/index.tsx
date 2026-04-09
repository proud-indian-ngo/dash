import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { EventsCalendarView } from "@/components/events/events-calendar-view";
import type { PublicEventRow } from "@/components/events/public-events-table";

export const Route = createFileRoute("/_app/events/")({
  head: () => ({
    meta: [{ title: `Events | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.teamEvent.allAccessible());
    context.zero?.preload(queries.eventInterest.byCurrentUser());
    context.zero?.preload(queries.team.byCurrentUser());
  },
  component: PublicEventsRouteComponent,
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
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Events
      </h1>
      <div className="mt-4">
        <EventsCalendarView
          data={(data as PublicEventRow[]) ?? []}
          isLoading={isLoading}
          myInterests={myInterests}
          myTeamIds={myTeamIds}
          userId={session.user.id}
        />
      </div>
    </div>
  );
}
