import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EditionCloneCard } from "@/components/kalakriti/edition-clone-card";
import { EditionLifecycleCard } from "@/components/kalakriti/edition-lifecycle-card";
import { VolunteerAssignmentsCard } from "@/components/kalakriti/volunteer-assignments-card";
import { useApp } from "@/context/app-context";

const editionTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Kolkata",
  timeZoneName: "short",
  year: "numeric",
});

const editionDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

export const Route = createFileRoute("/_app/kalakriti/$year/")({
  component: KalakritiEditionOverview,
});

function KalakritiEditionOverview() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const { hasPermission } = useApp();
  const canViewLinkedEvent =
    hasPermission("events.view_own") || hasPermission("events.view_all");
  const canManageLifecycle =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true;
  const [teamEvent] = useQuery(
    queries.teamEvent.byId({ id: edition.teamEventId }),
    { enabled: canViewLinkedEvent }
  );

  return (
    <div className="pt-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Event date</CardTitle>
          </CardHeader>
          <CardContent>
            {editionDateFormatter.format(new Date(edition.eventDate))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Age cutoff</CardTitle>
          </CardHeader>
          <CardContent>
            {editionDateFormatter.format(new Date(edition.ageCutoffDate))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Registration closes</CardTitle>
          </CardHeader>
          <CardContent>
            {editionTimestampFormatter.format(
              new Date(edition.plannedRegistrationCloseAt)
            )}
          </CardContent>
        </Card>
      </div>

      {canViewLinkedEvent && teamEvent ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Organization link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">{teamEvent.team?.name}</p>
              <p className="text-muted-foreground text-sm">
                The event record is read-only outside Kalakriti.
              </p>
            </div>
            <Button
              nativeButton={false}
              render={
                <Link params={{ id: edition.teamEventId }} to="/events/$id" />
              }
              variant="outline"
            >
              View linked event
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <EditionLifecycleCard
        canManage={canManageLifecycle}
        editionId={edition.id}
      />
      {canManageLifecycle ? (
        <EditionCloneCard
          editionId={edition.id}
          lifecycle={edition.lifecycle}
        />
      ) : null}

      <VolunteerAssignmentsCard editionId={edition.id} />
    </div>
  );
}
