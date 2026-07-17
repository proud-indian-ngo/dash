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
import { format } from "date-fns";
import { Loader } from "@/components/loader";

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
  const [edition, result] = useQuery(queries.kalakritiEdition.byYear({ year }));

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
        <Button nativeButton={false} render={<Link to="/kalakriti/new" />}>
          Create Edition
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Event date</CardTitle>
          </CardHeader>
          <CardContent>{format(edition.eventDate, "PPP")}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Age cutoff</CardTitle>
          </CardHeader>
          <CardContent>{format(edition.ageCutoffDate, "PPP")}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Registration closes</CardTitle>
          </CardHeader>
          <CardContent>
            {format(edition.plannedRegistrationCloseAt, "PPP p")}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Organization link</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">{edition.teamEvent?.team?.name}</p>
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
    </div>
  );
}
