import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import type { EventInterest, User } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Loader } from "@/components/loader";
import { EventDetail } from "@/components/teams/events/event-detail";
import type { EventRow } from "@/components/teams/events/events-table";
import { applyOccurrenceDate } from "@/components/teams/events/events-table-helpers";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { useApp } from "@/context/app-context";
import { isTeamLead } from "@/lib/team-utils";

export const Route = createFileRoute("/_app/events/$id")({
  validateSearch: z.object({
    occDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  head: () => ({
    meta: [{ title: `Event Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.teamEvent.byId({ id: params.id }));
    context.zero?.preload(
      queries.eventInterest.byEvent({ eventId: params.id })
    );
    context.zero?.preload(
      queries.eventUpdate.approvedByEvent({ eventId: params.id })
    );
    // Pending update/photo preloads omitted — conditionally fetched based on
    // permissions inside EventDetail (approvers get all, others get own only).
    context.zero?.preload(
      queries.eventPhoto.approvedByEvent({ eventId: params.id })
    );
    context.zero?.preload(
      queries.eventImmichAlbum.byEvent({ eventId: params.id })
    );
  },
  component: EventDetailRouteComponent,
});

function EventDetailRouteComponent() {
  const { id } = Route.useParams();
  const { occDate } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const { hasPermission } = useApp();

  const [eventResult, eventStatus] = useQuery(queries.teamEvent.byId({ id }));
  const event = (eventResult ?? null) as EventRow | null;

  const [teamResult] = useQuery(
    queries.team.byId({ id: event?.teamId ?? "" }),
    {
      enabled: !!event?.teamId,
    }
  );
  const team = (teamResult ?? null) as TeamDetailData | null;

  const [interests] = useQuery(queries.eventInterest.byEvent({ eventId: id }));

  if (!event && eventStatus.type !== "complete") {
    return (
      <div className="flex h-full items-center justify-center pt-8">
        <Loader />
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

  const isLead = team ? isTeamLead(team.members, session.user.id) : false;
  const canManage = hasPermission("events.edit") || isLead;
  const canManageAttendance =
    hasPermission("events.manage_attendance") || isLead;
  const canManageFeedback = hasPermission("events.manage_feedback") || isLead;
  const canManagePhotos = hasPermission("events.manage_photos") || isLead;
  const canApproveUpdates = hasPermission("event_updates.approve") || isLead;
  const myInterest = interests.find(
    (i: EventInterest & { user: User | undefined }) =>
      i.userId === session.user.id
  );
  const isMember = event.members.some((m) => m.userId === session.user.id);

  // For virtual occurrences, override the displayed start/end with the occurrence date
  const displayEvent =
    occDate && event.recurrenceRule
      ? {
          ...event,
          ...applyOccurrenceDate(event.startTime, event.endTime, occDate),
        }
      : event;

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <EventDetail
        canApproveUpdates={canApproveUpdates}
        canManage={canManage}
        canManageAttendance={canManageAttendance}
        canManageFeedback={canManageFeedback}
        canManagePhotos={canManagePhotos}
        canManageVolunteers={canManage}
        event={displayEvent}
        interests={
          interests as readonly (EventInterest & {
            user: User | undefined;
          })[]
        }
        isMember={isMember}
        myInterest={myInterest ?? null}
        occDate={occDate}
        team={team}
      />
    </div>
  );
}
