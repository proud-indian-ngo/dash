import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { EventDetail } from "@/components/teams/events/event-detail";
import type { EventRow } from "@/components/teams/events/events-table";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { isTeamLead } from "@/lib/team-utils";

export const Route = createFileRoute("/_app/events/$id")({
  loader: ({ context, params }) => {
    context.zero?.run(queries.teamEvent.byId({ id: params.id }));
  },
  component: EventDetailRouteComponent,
});

function EventDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const isAdmin = session.user.role === "admin";

  const [eventResult, eventStatus] = useQuery(queries.teamEvent.byId({ id }));
  const event = (eventResult ?? null) as EventRow | null;

  const [teamResult] = useQuery(queries.team.byId({ id: event?.teamId ?? "" }));
  const team = (teamResult ?? null) as TeamDetailData | null;

  if (eventStatus.type === "unknown") {
    return (
      <div className="app-container mx-auto max-w-7xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Loading...</p>
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

  if (!team) {
    return (
      <div className="app-container mx-auto max-w-7xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  const canManage = isAdmin || isTeamLead(team.members, session.user.id);

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <EventDetail
        canManage={canManage}
        event={event}
        isAdmin={isAdmin}
        team={team}
      />
    </div>
  );
}
