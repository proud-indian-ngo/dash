import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  type PublicEventRow,
  PublicEventsTable,
} from "@/components/events/public-events-table";
import { ShowInterestDialog } from "@/components/teams/events/show-interest-dialog";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";

export const Route = createFileRoute("/_app/events/")({
  head: () => ({
    meta: [{ title: `Events | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.teamEvent.public());
    context.zero?.run(queries.eventInterest.byCurrentUser());
    context.zero?.run(queries.team.byCurrentUser());
  },
  component: PublicEventsRouteComponent,
});

function PublicEventsRouteComponent() {
  const { session } = Route.useRouteContext();
  const [data, result] = useQuery(queries.teamEvent.public());
  const isLoading = useZeroQueryStatus(result);
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const [myTeams] = useQuery(queries.team.byCurrentUser());
  const myTeamIds = new Set(myTeams.map((t) => t.id));

  const [interestEventId, setInterestEventId] = useState<string | null>(null);

  const handleShowInterest = (eventId: string) => {
    setInterestEventId(eventId);
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Events</h1>
      <div className="fade-in-0 mt-4 grid animate-in gap-6 fill-mode-backwards duration-200 *:min-w-0">
        <PublicEventsTable
          data={(data as PublicEventRow[]) ?? []}
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
