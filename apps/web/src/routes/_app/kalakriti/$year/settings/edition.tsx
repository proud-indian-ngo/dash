import { Button } from "@pi-dash/design-system/components/ui/button";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { EditionMetadataDialog } from "@/components/kalakriti/edition-metadata-dialog";
import { EditionParticipationRulesDialog } from "@/components/kalakriti/edition-participation-rules-dialog";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { FormSkeleton } from "@/components/shared/page-skeleton";

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
    return <FormSkeleton className="max-w-3xl" fields={4} />;
  }

  const canEditParticipation =
    editionDetails.lifecycle === "draft" ||
    editionDetails.lifecycle === "registration_open";
  const minTotalCompetitions = editionDetails.minTotalCompetitions ?? 2;

  const value = (text: string) => (
    <span className="text-sm tabular-nums">{text}</span>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <SettingsCard
        action={
          editionDetails.lifecycle === "draft" ? (
            <EditionMetadataDialog edition={editionDetails} />
          ) : null
        }
        description={
          editionDetails.lifecycle === "draft"
            ? "Name and key dates for this Edition."
            : "Name and key dates for this Edition. They lock once the Edition leaves draft."
        }
        title="Edition"
      >
        <SettingsRow title="Name">{value(editionDetails.name)}</SettingsRow>
        <SettingsRow title="Event date">
          {value(
            editionDateFormatter.format(new Date(editionDetails.eventDate))
          )}
        </SettingsRow>
        <SettingsRow
          description="Students' ages are worked out on this date."
          title="Age cutoff"
        >
          {value(
            editionDateFormatter.format(new Date(editionDetails.ageCutoffDate))
          )}
        </SettingsRow>
        <SettingsRow title="Registration closes">
          {value(
            editionTimestampFormatter.format(
              new Date(editionDetails.plannedRegistrationCloseAt)
            )
          )}
        </SettingsRow>
      </SettingsCard>

      <SettingsCard
        action={
          canEditParticipation ? (
            <EditionParticipationRulesDialog
              editionId={editionDetails.id}
              minTotalCompetitions={minTotalCompetitions}
            />
          ) : null
        }
        description={
          canEditParticipation ? undefined : "Locked once registration closes."
        }
        title="Participation rules"
      >
        <SettingsRow
          description="The fewest Competitions a participating Student enters."
          title="Minimum Competitions per Student"
        >
          {value(String(minTotalCompetitions))}
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
