import { ArrowRight01Icon, QrCodeScanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@pi-dash/design-system/components/reui/alert";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@pi-dash/design-system/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@pi-dash/design-system/components/ui/item";
import { getKalakritiGoLiveReadiness } from "@pi-dash/zero/kalakriti-go-live-readiness";
import { getKalakritiRegistrationReadiness } from "@pi-dash/zero/kalakriti-registration-readiness";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { DashboardSectionMetrics } from "@/components/kalakriti/dashboard-section-metrics";
import { ScanDialog } from "@/components/kalakriti/scan-dialog";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import {
  DASHBOARD_DESTINATIONS,
  DASHBOARD_PHASE_COPY,
  getDashboardActions,
  getDashboardScanActions,
  prioritizeDashboardAttention,
  type DashboardAction,
  type DashboardAttention,
  type DashboardDestination,
} from "@/lib/kalakriti-dashboard";
import {
  getKalakritiScanActivities,
  type ScanActivity,
} from "@/lib/kalakriti-event-day-policy";
import { createStationRecordingLedger } from "@/lib/kalakriti-scan-recording";
import type {
  KalakritiDashboardSection,
  KalakritiDashboardSummary,
} from "@/lib/server/kalakriti-dashboard-summary";

import { KALAKRITI_SUMMARY_COLORS } from "./summary-colors";

const snapshotTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function DashboardActionButton({
  action,
  year,
  onScan,
}: {
  action: DashboardAction;
  year: number;
  onScan: (activity: ScanActivity) => void;
}) {
  const className = "max-sm:min-h-11";
  if (action.activity) {
    const activity = action.activity;
    return (
      <Button
        className={className}
        disabled={Boolean(action.unavailable)}
        onClick={() => onScan(activity)}
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          data-icon="inline-start"
          icon={QrCodeScanIcon}
          strokeWidth={2}
        />
        {action.label}
      </Button>
    );
  }
  if (!action.destination) return null;
  return (
    <Button
      className={className}
      nativeButton={false}
      render={
        <Link
          to={DASHBOARD_DESTINATIONS[action.destination]}
          params={{ year: String(year) }}
          search={action.filter ? { dashboardFilter: action.filter } : {}}
        />
      }
      variant="outline"
    >
      {action.label}
      <HugeiconsIcon
        data-icon="inline-end"
        icon={ArrowRight01Icon}
        strokeWidth={2}
      />
    </Button>
  );
}

const READINESS_DESTINATIONS: Record<string, DashboardDestination> = {
  no_active_centers: "centers",
  center_registration_open: "centers",
  missing_age_categories: "eligibility",
  overlapping_age_categories: "eligibility",
  missing_student_limits: "eligibility",
  no_active_competitions: "competitions",
  competition_missing_division: "competitions",
  competition_missing_session: "competitions",
  no_active_venues: "venues",
  invalid_active_sessions: "competitions",
  missing_overall_events_lead: "volunteers",
  missing_transport_lead: "volunteers",
  missing_food_lead: "volunteers",
  missing_transport_assignment: "transport",
};

function useDashboardReadiness(
  access: KalakritiEditionAccess
): DashboardAttention[] {
  const canManage =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true;
  const [snapshot] = useQuery(
    queries.kalakritiEdition.readiness({ editionId: access.edition.id }),
    {
      enabled:
        canManage &&
        access.edition.lifecycle !== "archived" &&
        access.edition.lifecycle !== "live",
    }
  );
  if (
    !snapshot ||
    !canManage ||
    access.edition.lifecycle === "live" ||
    access.edition.lifecycle === "archived"
  )
    return [];
  const input = {
    ageCategories: snapshot.ageCategories.map((category) => ({
      ...category,
      femaleStudentLimit: category.femaleStudentLimit ?? 0,
      maleStudentLimit: category.maleStudentLimit ?? 0,
    })),
    centers: snapshot.centers,
    competitionCategories: snapshot.competitionCategories,
    competitions: snapshot.competitions,
    divisions: snapshot.competitionDivisions,
    edition: { ...snapshot, lifecycle: snapshot.lifecycle ?? "" },
    sessions: snapshot.competitionSessions,
    venues: snapshot.venues,
    assignments: snapshot.assignments,
    transportAssignments: snapshot.transportAssignments,
  };
  const blockers =
    access.edition.lifecycle === "registration_locked"
      ? getKalakritiGoLiveReadiness(input)
      : getKalakritiRegistrationReadiness(input);
  return blockers.map((blocker) => ({
    id: `readiness-${blocker.code}`,
    label: blocker.message,
    count: 1,
    priority: 0,
    destination: READINESS_DESTINATIONS[blocker.code],
  }));
}

function sectionActions(
  section: KalakritiDashboardSection,
  actions: DashboardAction[],
  scans: DashboardAction[]
) {
  const destination = section.id === "registration" ? "students" : section.id;
  const activities: Partial<
    Record<KalakritiDashboardSection["id"], ScanActivity[]>
  > = {
    food: ["meals"],
    transport: ["transport"],
    inventory: ["dispatch", "return"],
    hospitality: ["check_in"],
    attendance: ["attendance"],
  };
  return [
    ...scans.filter(
      (action) =>
        action.activity && activities[section.id]?.includes(action.activity)
    ),
    ...actions.filter(
      (action) =>
        action.destination === destination ||
        (section.id === "hospitality" && action.destination === "guests") ||
        (section.id === "attendance" && action.destination === "competitions")
    ),
  ];
}

export function RoleDashboard({
  registerIdCard,
  summary,
  fresh,
  error,
  refresh,
}: {
  registerIdCard?: ReactNode;
  summary: KalakritiDashboardSummary;
  fresh: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}) {
  const { access } = summary;
  const { edition } = access;
  const [activity, setActivity] = useState<ScanActivity>();
  const [ledger] = useState(createStationRecordingLedger);
  const actions = getDashboardActions(access);
  const scans = getDashboardScanActions(access);
  const readiness = useDashboardReadiness(access);
  const operationalAttention: DashboardAttention[] = summary.sections.flatMap(
    (section) => {
      const liveOnly =
        section.id === "food" ||
        section.id === "attendance" ||
        section.id === "hospitality";
      if (liveOnly && edition.lifecycle !== "live") return [];
      return section.attention.map((item) => ({
        ...item,
        destination: item.destination === "scan" ? undefined : item.destination,
        priority: section.id === "registration" ? 1 : 2,
      }));
    }
  );
  const attention = prioritizeDashboardAttention(
    [...readiness, ...operationalAttention],
    edition.lifecycle
  );
  const sections = [...summary.sections].sort((a, b) => {
    const order =
      edition.lifecycle === "live"
        ? [
            "attendance",
            "hospitality",
            "food",
            "transport",
            "inventory",
            "competitions",
            "registration",
            "volunteers",
          ]
        : [
            "registration",
            "competitions",
            "volunteers",
            "transport",
            "inventory",
            "attendance",
            "hospitality",
            "food",
          ];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  const usedActionIds = new Set(
    sections.flatMap((section) =>
      sectionActions(section, actions, scans).map((action) => action.id)
    )
  );
  const remainingActions = [...scans, ...actions].filter(
    (action) => !usedActionIds.has(action.id)
  );
  const hasVolunteersSection = sections.some(
    (section) => section.id === "volunteers"
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-balance">
          {DASHBOARD_PHASE_COPY[edition.lifecycle]}
        </h2>
        <p className="text-muted-foreground text-xs tabular-nums">
          Updated{" "}
          <time dateTime={new Date(summary.updatedAt).toISOString()}>
            {snapshotTimeFormatter.format(summary.updatedAt)}
          </time>
        </p>
      </div>
      {!fresh ? (
        <Alert variant={error ? "warning" : "info"}>
          <AlertTitle>
            {error
              ? "Dashboard could not be refreshed"
              : "Showing the last dashboard snapshot"}
          </AlertTitle>
          <AlertDescription>
            Counts may have changed. Reconnect and refresh before recording
            activity.
          </AlertDescription>
          <AlertAction>
            <Button
              className="max-sm:min-h-11"
              onClick={() => void refresh()}
              variant="outline"
            >
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {attention.length ? (
        <Card className={KALAKRITI_SUMMARY_COLORS.attention} size="sm">
          <CardHeader>
            <CardTitle>
              <h3>Needs attention</h3>
            </CardTitle>
            <CardDescription>
              Start with these items in your assigned scope.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="grid gap-1 md:grid-cols-2">
              {attention.map((item) => (
                <Item key={item.id} role="listitem" size="xs">
                  <ItemContent>
                    <ItemTitle>{item.label}</ItemTitle>
                    {item.priority > 0 ? (
                      <ItemDescription>{item.count} to review</ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    {item.destination || item.activity ? (
                      <DashboardActionButton
                        action={{
                          ...item,
                          label: "Review",
                          unavailable:
                            item.activity && !fresh
                              ? "Reconnect to record"
                              : undefined,
                        }}
                        year={edition.year}
                        onScan={setActivity}
                      />
                    ) : (
                      <Badge variant="outline">
                        Use Edition controls above
                      </Badge>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      ) : null}
      {remainingActions.length || (registerIdCard && !hasVolunteersSection) ? (
        <nav aria-label="Your work areas" className="flex flex-wrap gap-2">
          {hasVolunteersSection ? null : registerIdCard}
          {remainingActions.map((action) => (
            <DashboardActionButton
              key={action.id}
              action={{
                ...action,
                unavailable:
                  action.activity && !fresh
                    ? "Reconnect to record"
                    : action.unavailable,
              }}
              year={edition.year}
              onScan={setActivity}
            />
          ))}
        </nav>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {sections.map((section) => {
          const workActions = sectionActions(section, actions, scans);
          return (
            <Card
              className={KALAKRITI_SUMMARY_COLORS.work}
              key={section.id}
              size="sm"
            >
              <CardHeader>
                <CardTitle>
                  <h3>{section.title}</h3>
                </CardTitle>
                <CardDescription>{section.scopeLabel}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <DashboardSectionMetrics section={section} />
                {workActions.length ||
                (section.id === "volunteers" && registerIdCard) ? (
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {section.id === "volunteers" ? registerIdCard : null}
                    {workActions.map((action) => (
                      <DashboardActionButton
                        key={action.id}
                        action={{
                          ...action,
                          unavailable:
                            action.activity && !fresh
                              ? "Reconnect to record"
                              : action.unavailable,
                        }}
                        year={edition.year}
                        onScan={setActivity}
                      />
                    ))}
                    {workActions.some((action) => action.unavailable) ? (
                      <p className="text-muted-foreground w-full text-xs">
                        Event-day recording is available when the Edition is
                        Live.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!sections.length && !remainingActions.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Your Edition at a glance</EmptyTitle>
            <EmptyDescription>
              Use the schedule to plan your day and follow published Center
              results below.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {activity &&
      getKalakritiScanActivities(access).includes(activity) &&
      fresh ? (
        <ScanDialog
          key={activity}
          activities={getKalakritiScanActivities(access)}
          editionId={edition.id}
          year={edition.year}
          initialActivity={activity}
          ledger={ledger}
          onOpenChange={(open) => {
            if (!open) {
              setActivity(undefined);
              void refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}
