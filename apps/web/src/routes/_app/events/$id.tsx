import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { queries } from "@pi-dash/zero/queries";
import type { EventInterest, User } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { EventDetail } from "@/components/teams/events/event-detail";
import type { EventRow } from "@/components/teams/events/events-table";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { useApp } from "@/context/app-context";
import { isTeamLead } from "@/lib/team-utils";

export const Route = createFileRoute("/_app/events/$id")({
  head: () => ({
    meta: [{ title: "Event Details | Proud Indian Dashboard" }],
  }),
  loader: ({ context, params }) => {
    context.zero?.run(queries.teamEvent.byId({ id: params.id }));
    context.zero?.run(queries.eventInterest.byEvent({ eventId: params.id }));
    context.zero?.run(queries.eventUpdate.byEvent({ eventId: params.id }));
    context.zero?.run(
      queries.eventPhoto.approvedByEvent({ eventId: params.id })
    );
    context.zero?.run(
      queries.eventPhoto.pendingByEvent({ eventId: params.id })
    );
    context.zero?.run(queries.eventImmichAlbum.byEvent({ eventId: params.id }));
  },
  component: EventDetailRouteComponent,
});

function EventDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const { isAdmin } = useApp();

  const [eventResult, eventStatus] = useQuery(queries.teamEvent.byId({ id }));
  const event = (eventResult ?? null) as EventRow | null;

  const [teamResult] = useQuery(queries.team.byId({ id: event?.teamId ?? "" }));
  const team = (teamResult ?? null) as TeamDetailData | null;

  const [interests] = useQuery(queries.eventInterest.byEvent({ eventId: id }));

  if (eventStatus.type === "unknown") {
    return (
      <div className="flex h-full items-center justify-center pt-8">
        <BrailleSpinner />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="app-container mx-auto max-w-7xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Event not found.</p>
      </div>
    );
  }

  const canManage =
    isAdmin || (team ? isTeamLead(team.members, session.user.id) : false);
  const myInterest = interests.find(
    (i: EventInterest & { user: User | undefined }) =>
      i.userId === session.user.id
  );
  const isMember = event.members.some((m) => m.userId === session.user.id);

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <EventDetail
        canManage={canManage}
        currentUserId={session.user.id}
        event={event}
        interests={
          interests as readonly (EventInterest & {
            user: User | undefined;
          })[]
        }
        isAdmin={isAdmin}
        isMember={isMember}
        myInterest={myInterest ?? null}
        team={team}
      />
    </div>
  );
}
