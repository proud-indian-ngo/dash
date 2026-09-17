import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { EditionMetadataDialog } from "@/components/kalakriti/edition-metadata-dialog";
import { EditionParticipationRulesDialog } from "@/components/kalakriti/edition-participation-rules-dialog";

const editionDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});
const editionTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
  timeZoneName: "short",
  year: "numeric",
});

export const Route = createFileRoute("/_app/kalakriti/$year/settings/edition")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (
      !access.isGlobalAdmin &&
      !access.membership?.responsibilities.includes("edition_admin")
    ) {
      throw notFound();
    }
  },
  component: EditionSettingsPage,
});

function EditionSettingsPage() {
  const {
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [editionDetails, result] = useQuery(
    queries.kalakritiEdition.byYear({ year: edition.year })
  );

  if (result.type === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p>Edition settings could not be loaded.</p>
        <Button onClick={() => result.retry()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (!editionDetails) {
    return (
      <p className="text-muted-foreground text-sm">Loading Edition settings…</p>
    );
  }

  const canEditParticipation =
    editionDetails.lifecycle === "draft" ||
    editionDetails.lifecycle === "registration_open";
  const minTotalCompetitions = editionDetails.minTotalCompetitions ?? 2;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Edition details</CardTitle>
          <CardDescription>
            Name and key dates for this Edition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{editionDetails.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Event date</dt>
              <dd>
                {editionDateFormatter.format(
                  new Date(editionDetails.eventDate)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Age cutoff</dt>
              <dd>
                {editionDateFormatter.format(
                  new Date(editionDetails.ageCutoffDate)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Registration closes</dt>
              <dd>
                {editionTimestampFormatter.format(
                  new Date(editionDetails.plannedRegistrationCloseAt)
                )}
              </dd>
            </div>
          </dl>
          {editionDetails.lifecycle === "draft" ? (
            <EditionMetadataDialog edition={editionDetails} />
          ) : null}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Participation rules</CardTitle>
          <CardDescription>
            Minimum Entries required per participating Student.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Minimum Competitions:{" "}
            <span className="font-semibold tabular-nums">
              {minTotalCompetitions}
            </span>
          </p>
          {canEditParticipation ? (
            <EditionParticipationRulesDialog
              editionId={editionDetails.id}
              minTotalCompetitions={minTotalCompetitions}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
