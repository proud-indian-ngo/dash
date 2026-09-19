import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert,
  AlertTitle,
  AlertAction,
} from "@pi-dash/design-system/components/reui/alert";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@pi-dash/design-system/components/ui/empty";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BlankIdCardDownloadDialog } from "@/components/kalakriti/blank-id-card-download-dialog";
import { CenterStandings } from "@/components/kalakriti/center-standings";
import { EditionCloneCard } from "@/components/kalakriti/edition-clone-card";
import {
  EditionLifecycleAction,
  EditionLifecycleAlerts,
} from "@/components/kalakriti/edition-lifecycle-card";
import { IdCardDownloadButton } from "@/components/kalakriti/id-card-download-button";
import { KalakritiLifecycleBadge } from "@/components/kalakriti/kalakriti-lifecycle-badge";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { RegisterIdCardDialog } from "@/components/kalakriti/register-id-card-dialog";
import { RegistrationDashboard } from "@/components/kalakriti/registration-dashboard";
import { useRegistrationExport } from "@/components/kalakriti/registration-export-card";
import { RoleDashboard } from "@/components/kalakriti/role-dashboard";
import {
  loadKalakritiDashboard,
  useDashboardSnapshot,
} from "@/components/kalakriti/use-dashboard-snapshot";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { useApp } from "@/context/app-context";
import { dashboardAccessKey } from "@/lib/kalakriti-dashboard";
import { canRegisterKalakritiIdCards } from "@/lib/kalakriti-volunteer-policy";

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
  loader: ({ params }) => loadKalakritiDashboard(Number(params.year)),
});

function KalakritiEditionOverview() {
  const initial = Route.useLoaderData();
  const { kalakritiEditionAccess: routeAccess } = Route.useRouteContext();
  const { hasPermission, user } = useApp();
  const [currentUser] = useQuery(queries.user.one());
  const [membership, membershipResult] = useQuery(
    queries.kalakritiAssignment.myAccess({ editionId: routeAccess.edition.id }),
    { enabled: !routeAccess.isGlobalAdmin }
  );
  const observedAccess =
    membershipResult.type === "complete" && !routeAccess.isGlobalAdmin
      ? {
          ...routeAccess,
          membership: membership
            ? {
                id: membership.id,
                kind: membership.kind,
                assignments: [...membership.assignments],
                responsibilities: membership.assignments.map(
                  (assignment) => assignment.responsibility
                ),
              }
            : null,
        }
      : routeAccess;
  const scopeKey = dashboardAccessKey(observedAccess, user.id);
  const isGuardian = observedAccess.membership?.kind === "guardian";
  const [guardianCenters, guardianCentersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: routeAccess.edition.id }),
    { enabled: isGuardian && !observedAccess.isGlobalAdmin }
  );
  const initialCenterIds =
    initial?.projections.flatMap((projection) =>
      projection.scope.kind === "center" ? projection.scope.centerIds : []
    ) ?? [];
  const centerScope = JSON.stringify(
    [
      ...new Set(
        isGuardian && guardianCentersResult.type === "complete"
          ? guardianCenters.map((center) => center.id)
          : initialCenterIds
      ),
    ].sort()
  );
  const snapshot = useDashboardSnapshot({
    initial:
      scopeKey === dashboardAccessKey(routeAccess, user.id) &&
      centerScope === JSON.stringify([...new Set(initialCenterIds)].sort()) &&
      (currentUser?.role ?? user.role) === user.role
        ? initial
        : undefined,
    scopeKey: `${scopeKey}:${currentUser?.role ?? user.role}:${hasPermission("kalakriti.admin")}:${hasPermission("kalakriti.view")}:${centerScope}`,
    year: routeAccess.edition.year,
    live: routeAccess.edition.lifecycle === "live",
  });
  const access = snapshot.data?.summary.access ?? observedAccess;
  const { edition } = access;
  const dashboard = snapshot.data;
  const canViewLinkedEvent =
    hasPermission("events.view_own") || hasPermission("events.view_all");
  const canManageLifecycle =
    Boolean(dashboard) &&
    (access.isGlobalAdmin ||
      access.membership?.responsibilities.includes("edition_admin") === true);
  const canRegisterIdCards = canRegisterKalakritiIdCards(access);
  const [teamEvent] = useQuery(
    queries.teamEvent.byId({ id: edition.teamEventId }),
    { enabled: canViewLinkedEvent }
  );
  const [editionDetails] = useQuery(
    queries.kalakritiEdition.byYear({ year: edition.year })
  );
  const canExport = Boolean(dashboard && dashboard.projections.length > 0);
  const { exportRegistration, isExporting } = useRegistrationExport(
    edition.year
  );
  const minTotalCompetitions = editionDetails?.minTotalCompetitions ?? 2;

  return (
    <div className="flex flex-col gap-5">
      <KalakritiPageHeader
        actions={
          <>
            <EditionLifecycleAction
              canManage={canManageLifecycle}
              editionId={edition.id}
            />
            <Button
              className="min-h-11 sm:min-h-10"
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
                  <ResponsiveActionMenu
                    title="Edition actions"
                    trigger={
                      <Button
                        aria-label="Admin actions"
                        className="max-sm:min-h-11 max-sm:min-w-11"
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <HugeiconsIcon
                          data-icon="inline-start"
                          icon={MoreVerticalIcon}
                          strokeWidth={2}
                        />
                      </Button>
                    }
                    actions={[
                      canExport && {
                        id: "export",
                        label: isExporting
                          ? "Preparing export..."
                          : "Download registration data",
                        disabled: isExporting,
                        onSelect: exportRegistration,
                      },
                      availability === "query_error" && {
                        id: "retry",
                        label: "Retry clone options",
                        onSelect: retry,
                      },
                      availability === "ready" && {
                        id: "clone",
                        label: "Clone configuration",
                        onSelect: open,
                      },
                      access.isGlobalAdmin && {
                        id: "create",
                        label: "Create Edition",
                        render: <Link to="/kalakriti/new" />,
                      },
                    ]}
                  />
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
            <span>Min {minTotalCompetitions}</span>
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
      <div aria-label="Your roles" className="flex flex-wrap gap-2">
        {access.isGlobalAdmin ? (
          <Badge variant="outline">Kalakriti Administrator</Badge>
        ) : null}
        {access.membership?.kind === "guardian" ? (
          <Badge variant="outline">Guardian</Badge>
        ) : null}
        {[...new Set(access.membership?.responsibilities ?? [])].map((role) => (
          <Badge key={role} variant="outline">
            {KALAKRITI_RESPONSIBILITY_LABELS[role]}
          </Badge>
        ))}
      </div>
      {dashboard ? (
        <RegistrationDashboard
          editionId={edition.id}
          year={edition.year}
          projections={dashboard.projections}
        />
      ) : null}
      {dashboard ? (
        <RoleDashboard
          registerIdCard={
            canRegisterIdCards ? (
              <RegisterIdCardDialog
                className="max-sm:min-h-11"
                editionId={edition.id}
              />
            ) : null
          }
          summary={dashboard.summary}
          fresh={snapshot.fresh}
          error={snapshot.error}
          refresh={snapshot.refresh}
        />
      ) : dashboard === null ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Dashboard access is no longer available</EmptyTitle>
            <EmptyDescription>
              Your Edition assignments may have changed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : snapshot.error ? (
        <Alert variant="warning">
          <AlertTitle>Dashboard could not be loaded</AlertTitle>
          <AlertAction>
            <Button onClick={() => void snapshot.refresh()}>Retry</Button>
          </AlertAction>
        </Alert>
      ) : (
        <div
          aria-label="Loading dashboard"
          className="grid gap-4 sm:grid-cols-2"
        >
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}
      {dashboard ? (
        <>
          {canManageLifecycle ? (
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button className="min-h-11 sm:min-h-10" variant="outline" />
                }
              >
                ID cards and registration tools
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-2 pt-2">
                  <IdCardDownloadButton year={edition.year} />
                  <BlankIdCardDownloadDialog year={edition.year} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          <CenterStandings year={edition.year} />
        </>
      ) : null}
    </div>
  );
}
