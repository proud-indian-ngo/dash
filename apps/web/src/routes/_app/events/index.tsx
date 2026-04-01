import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  type PublicEventRow,
  PublicEventsTable,
} from "@/components/events/public-events-table";
import { ShowInterestDialog } from "@/components/teams/events/show-interest-dialog";

export const Route = createFileRoute("/_app/events/")({
  head: () => ({
    meta: [{ title: `Events | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.teamEvent.public());
    context.zero?.preload(queries.teamEvent.byCurrentUser());
    context.zero?.preload(queries.eventInterest.byCurrentUser());
    context.zero?.preload(queries.team.byCurrentUser());
  },
  component: PublicEventsRouteComponent,
});

function PublicEventsRouteComponent() {
  const { session } = Route.useRouteContext();
  const [publicEvents, publicResult] = useQuery(queries.teamEvent.public());
  const [myEvents] = useQuery(queries.teamEvent.byCurrentUser());
  const isLoading =
    publicEvents.length === 0 && publicResult.type !== "complete";
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const [myTeams] = useQuery(queries.team.byCurrentUser());
  const myTeamIds = new Set(myTeams.map((t) => t.id));

  // Merge public events + private events user has access to, deduplicate by ID
  const mergedEvents = useMemo(() => {
    const seen = new Set<string>();
    const result: PublicEventRow[] = [];
    for (const e of publicEvents) {
      seen.add(e.id);
      result.push(e as PublicEventRow);
    }
    for (const e of myEvents) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e as PublicEventRow);
      }
    }
    return result;
  }, [publicEvents, myEvents]);

  const [interestEventId, setInterestEventId] = useState<string | null>(null);

  const handleShowInterest = (eventId: string) => {
    setInterestEventId(eventId);
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Events
      </h1>
      <div className="mt-4 grid gap-6 *:min-w-0">
        <PublicEventsTable
          data={mergedEvents}
          isLoading={isLoading}
          myInterests={myInterests}
          myTeamIds={myTeamIds}
          onShowInterest={handleShowInterest}
          userId={session.user.id}
        />
      </div>

      <ShowInterestDialog
        eventId={interestEventId ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setInterestEventId(null);
          }
        }}
        open={interestEventId !== null}
      />
    </div>
  );
}
