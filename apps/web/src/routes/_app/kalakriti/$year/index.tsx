import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EditionCloneCard } from "@/components/kalakriti/edition-clone-card";
import {
  EditionLifecycleAction,
  EditionLifecycleAlerts,
} from "@/components/kalakriti/edition-lifecycle-card";
import { EditionMetadataDialog } from "@/components/kalakriti/edition-metadata-dialog";
import { EditionParticipationRulesDialog } from "@/components/kalakriti/edition-participation-rules-dialog";
import { KalakritiLifecycleBadge } from "@/components/kalakriti/kalakriti-lifecycle-badge";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { RegistrationDashboard } from "@/components/kalakriti/registration-dashboard";
import { useRegistrationExport } from "@/components/kalakriti/registration-export-card";
import { VolunteerAssignmentsCard } from "@/components/kalakriti/volunteer-assignments-card";
import { useApp } from "@/context/app-context";
import { getKalakritiRegistrationDashboard } from "@/functions/kalakriti-registration-dashboard";

const editionTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
  timeZoneName: "short",
  year: "numeric",
});

const editionDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

export const Route = createFileRoute("/_app/kalakriti/$year/")({
  component: KalakritiEditionOverview,
  loader: ({ params }) =>
    getKalakritiRegistrationDashboard({
      data: { year: Number(params.year) },
    }),
});

function KalakritiEditionOverview() {
  const dashboard = Route.useLoaderData();
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
  const [editionDetails] = useQuery(
    queries.kalakritiEdition.byYear({ year: edition.year })
  );
  const canEditParticipationRules =
    canManageLifecycle &&
    editionDetails !== undefined &&
    editionDetails.lifecycle !== "registration_locked" &&
    editionDetails.lifecycle !== "live" &&
    editionDetails.lifecycle !== "archived";
  const canExport = Boolean(dashboard && dashboard.projections.length > 0);
  const { exportRegistration, isExporting } = useRegistrationExport(
    edition.year
  );
  const minTotalCompetitions = editionDetails?.minTotalCompetitions ?? 2;

  return (
    <div className="space-y-8">
      <KalakritiPageHeader
        actions={
          <>
            <EditionLifecycleAction
              canManage={canManageLifecycle}
              editionId={edition.id}
            />
            {canManageLifecycle && editionDetails?.lifecycle === "draft" ? (
              <EditionMetadataDialog edition={editionDetails} />
            ) : null}
            <Button
              nativeButton={false}
              render={
                <Link
                  params={{ year: String(edition.year) }}
                  to="/kalakriti/$year/schedule"
                />
              }
              variant="outline"
            >
              View schedule
            </Button>
            <EditionCloneCard
              editionId={edition.id}
              lifecycle={edition.lifecycle}
            >
              {({ availability, open, retry }) => {
                const showAdmin =
                  canExport ||
                  availability === "ready" ||
                  availability === "query_error" ||
                  access.isGlobalAdmin;
                if (!showAdmin) {
                  return null;
                }
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" variant="outline" />}
                    >
                      <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
                      <span className="sr-only">Admin actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canExport ? (
                        <DropdownMenuItem
                          disabled={isExporting}
                          onClick={exportRegistration}
                        >
                          {isExporting
                            ? "Preparing export..."
                            : "Download registration data"}
                        </DropdownMenuItem>
                      ) : null}
                      {availability === "query_error" ? (
                        <DropdownMenuItem onClick={retry}>
                          Retry clone options
                        </DropdownMenuItem>
                      ) : null}
                      {availability === "ready" ? (
                        <DropdownMenuItem onClick={open}>
                          Clone configuration
                        </DropdownMenuItem>
                      ) : null}
                      {access.isGlobalAdmin ? (
                        <DropdownMenuItem render={<Link to="/kalakriti/new" />}>
                          Create Edition
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }}
            </EditionCloneCard>
          </>
        }
        badge={<KalakritiLifecycleBadge lifecycle={edition.lifecycle} />}
        kicker={`Kalakriti · ${edition.year}`}
        meta={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time dateTime={edition.eventDate}>
              {editionDateFormatter.format(new Date(edition.eventDate))}
            </time>
            <span aria-hidden="true">·</span>
            <span>
              Age cutoff{" "}
              {editionDateFormatter.format(new Date(edition.ageCutoffDate))}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Closes{" "}
              {editionTimestampFormatter.format(
                new Date(edition.plannedRegistrationCloseAt)
              )}
            </span>
            <span aria-hidden="true">·</span>
            {canEditParticipationRules && editionDetails ? (
              <EditionParticipationRulesDialog
                editionId={editionDetails.id}
                minTotalCompetitions={minTotalCompetitions}
                variant="inline"
              />
            ) : (
              <span>Min {minTotalCompetitions}</span>
            )}
            {canViewLinkedEvent && teamEvent ? (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  className="text-foreground underline-offset-4 hover:underline"
                  params={{ id: edition.teamEventId }}
                  to="/events/$id"
                >
                  {teamEvent.team?.name ?? "Linked event"}
                </Link>
              </>
            ) : null}
          </p>
        }
        title={edition.name}
        variant="edition"
      />

      <EditionLifecycleAlerts
        canManage={canManageLifecycle}
        editionId={edition.id}
      />
      <RegistrationDashboard projections={dashboard?.projections ?? []} />
      <VolunteerAssignmentsCard editionId={edition.id} />
    </div>
  );
}
