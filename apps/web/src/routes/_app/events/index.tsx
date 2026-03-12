import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
  type PublicEventRow,
  PublicEventsTable,
} from "@/components/events/public-events-table";
import { ShowInterestDialog } from "@/components/teams/events/show-interest-dialog";

export const Route = createFileRoute("/_app/events/")({
  head: () => ({
    meta: [{ title: "Events | Proud Indian Dashboard" }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.teamEvent.public());
    context.zero?.run(queries.eventInterest.byCurrentUser());
  },
  component: PublicEventsRouteComponent,
});

function PublicEventsRouteComponent() {
  const { session } = Route.useRouteContext();
  const [data, result] = useQuery(queries.teamEvent.public());
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const isLoading = result.type === "unknown";

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
      <div className="mt-6 grid gap-6">
        <PublicEventsTable
          data={(data as PublicEventRow[]) ?? []}
          isLoading={isLoading}
          myInterests={myInterests}
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
