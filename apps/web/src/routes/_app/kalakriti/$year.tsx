import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { VolunteerAssignmentsCard } from "@/components/kalakriti/volunteer-assignments-card";
import { Loader } from "@/components/loader";
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

function formatEditionTimestamp(timestamp: number): string {
  return editionTimestampFormatter.format(new Date(timestamp));
}

export const Route = createFileRoute("/_app/kalakriti/$year")({
  component: KalakritiEditionRoute,
  parseParams: (params) => {
    const year = Number(params.year);
    if (!Number.isInteger(year)) {
      throw notFound();
    }
    return { year };
  },
  stringifyParams: ({ year }) => ({ year: String(year) }),
});

function KalakritiEditionRoute() {
  const { year } = Route.useParams();
  const { hasPermission } = useApp();
  const canViewLinkedEvent =
    hasPermission("events.view_own") || hasPermission("events.view_all");
  const [edition, result] = useQuery(queries.kalakritiEdition.byYear({ year }));
  const [teamEvent] = useQuery(
    queries.teamEvent.byId({ id: edition?.teamEventId ?? "" }),
    {
      enabled: Boolean(edition) && canViewLinkedEvent,
    }
  );

  if (result.type !== "complete") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (!edition) {
    throw notFound();
  }

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-semibold text-3xl tracking-tight">
              {edition.name}
            </h1>
            <Badge variant="outline">
              {edition.lifecycle?.replaceAll("_", " ") ?? "draft"}
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            Edition workspace for {edition.year}
          </p>
        </div>
        {hasPermission("kalakriti.admin") ? (
          <Button nativeButton={false} render={<Link to="/kalakriti/new" />}>
            Create Edition
          </Button>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            {formatEditionTimestamp(edition.plannedRegistrationCloseAt)}
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

      <VolunteerAssignmentsCard editionId={edition.id} />
    </div>
  );
}
