import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  type PublicEventRow,
  PublicEventsTable,
} from "@/components/events/public-events-table";
import { ShowInterestDialog } from "@/components/teams/events/show-interest-dialog";
import { useApp } from "@/context/app-context";
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
  const { isAdmin } = useApp();
  const [data, result] = useQuery(queries.teamEvent.public());
  const isLoading = useZeroQueryStatus(result);
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const [myTeams] = useQuery(queries.team.byCurrentUser());
  const myTeamIds = useMemo(() => new Set(myTeams.map((t) => t.id)), [myTeams]);

  const [interestEventId, setInterestEventId] = useState<string | null>(null);

  const handleShowInterest = useCallback((eventId: string) => {
    setInterestEventId(eventId);
  }, []);

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Events</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Public events across all teams.
      </p>
      <div className="mt-6 grid gap-6 *:min-w-0">
        <PublicEventsTable
          data={(data as PublicEventRow[]) ?? []}
          isAdmin={isAdmin}
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
