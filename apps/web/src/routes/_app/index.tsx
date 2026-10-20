import {
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Invoice01Icon,
  PlusSignIcon,
  Store01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Kbd } from "@pi-dash/design-system/components/ui/kbd";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { env } from "@pi-dash/env/web";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";

import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { AwaitingMyVote } from "@/components/dashboard/awaiting-my-vote";
import { DeclareInterests } from "@/components/dashboard/governance-to-do";
import { MyTeams } from "@/components/dashboard/my-teams";
import {
  countPendingReviews,
  PendingReviews,
} from "@/components/dashboard/pending-reviews";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingEvents } from "@/components/dashboard/upcoming-events";
import { useShortcutModifier } from "@/components/layout/sidebar-toggle";
import { PageHeader } from "@/components/shared/page-header";
import { TipStrip } from "@/components/shared/tip-strip";
import type { StatItem } from "@/components/stats/stats-cards";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  dateRangeSearchParams,
  filterByDateRange,
  resolveDateRange,
} from "@/lib/date-range";
import { preloadRouteQuery } from "@/lib/route-preload";
import { spentAt, sumTotal, type WithStatusAndLineItems } from "@/lib/stats";
import { isTeamLead } from "@/lib/team-utils";
import { isAwaitingResult } from "@/lib/zero-result";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/")({
  beforeLoad: ({ context }) => {
    if (context.session.user.role === "external_user") {
      throw redirect({ to: "/kalakriti" });
    }
  },
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.reimbursement.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.advancePayment.all(),
      abortController.signal
    );
    preloadRouteQuery(context.zero, queries.user.all(), abortController.signal);
    preloadRouteQuery(
      context.zero,
      queries.team.byCurrentUser(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.teamEvent.allAccessible(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.teamEvent.byCurrentUserAll(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.vendorPayment.all(),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.eventInterest.byCurrentUser(),
      abortController.signal
    );
  },
  head: () => ({
    meta: [{ title: `Dashboard | ${env.VITE_APP_NAME}` }],
  }),
  component: DashboardHome,
});

interface DashboardStatsInput {
  advancePayments: readonly WithStatusAndLineItems[];
  canReview: boolean;
  canViewAllRequests: boolean;
  canViewUsers: boolean;
  canViewVendors: boolean;
  events: readonly { startTime: number | null }[];
  /** The person's own pending requests, for people who don't review. */
  ownPendingCount: number;
  reimbursements: readonly WithStatusAndLineItems[];
  teams: readonly { id: string }[];
  users: readonly { role: string | null }[];
  vendorPayments: readonly WithStatusAndLineItems[];
  /** Everything in the review panel below, counted the same way. */
  waitingCount: number;
}

function computeDashboardStats({
  reimbursements,
  advancePayments,
  users,
  teams,
  events,
  vendorPayments,
  canReview,
  canViewAllRequests,
  canViewUsers,
  canViewVendors,
  ownPendingCount,
  waitingCount,
}: DashboardStatsInput): StatItem[] {
  const allRequests = [...reimbursements, ...advancePayments];

  return [
    canReview
      ? {
          icon: Clock01Icon,
          label: "Waiting for you",
          tone: waitingCount > 0 ? ("warning" as const) : undefined,
          value: waitingCount,
        }
      : {
          href: "/reimbursements?status=pending",
          icon: Clock01Icon,
          label: "My pending",
          value: ownPendingCount,
        },
    {
      description: formatPaise(sumTotal(allRequests)),
      href: "/reimbursements",
      icon: Invoice01Icon,
      label: canViewAllRequests ? "Reimbursements" : "My reimbursements",
      value: allRequests.length,
    },
    ...(canViewVendors
      ? [
          {
            description: formatPaise(sumTotal(vendorPayments)),
            href: "/vendor-payments",
            icon: Store01Icon,
            label: "Vendor payments",
            value: vendorPayments.length,
          },
        ]
      : [
          {
            href: "/events",
            icon: Calendar03Icon,
            label: "Upcoming events",
            value: events.filter(
              (e) => e.startTime !== null && e.startTime > Date.now()
            ).length,
          },
        ]),
    canViewUsers
      ? {
          href: "/users",
          icon: UserMultipleIcon,
          label: "Users",
          value: users.length,
        }
      : {
          href: "/teams",
          icon: UserMultipleIcon,
          label: "My teams",
          value: teams.length,
        },
  ];
}

function DashboardHome() {
  const { hasPermission } = useApp();

  // Unoriented volunteers only have events.view_own — show welcome dashboard
  if (!hasPermission("requests.view_own")) {
    return <WelcomeDashboard />;
  }

  return <OrientedDashboard />;
}

function WelcomeDashboard() {
  const { session } = Route.useRouteContext();

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader title="Dashboard" />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Welcome, {session?.user.name}!</CardTitle>
          <CardDescription>
            Complete your orientation to access all features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            To get started, attend an orientation session. Browse available
            events and express your interest.
          </p>
          <Button nativeButton={false} render={<Link to="/events" />}>
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
            Browse events
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function OrientedDashboard() {
  const { hasPermission } = useApp();
  const { session } = Route.useRouteContext();
  const canViewAllRequests = hasPermission("requests.view_all");
  const canApprove = hasPermission("requests.approve");
  const canViewUsers = hasPermission("users.manage");
  const canViewVendors = hasPermission("vendors.view_all");

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [users] = useQuery(queries.user.all());
  const [teams] = useQuery(queries.team.byCurrentUser());
  const [events] = useQuery(queries.teamEvent.allAccessible());
  const [myEvents] = useQuery(queries.teamEvent.byCurrentUserAll());
  const [vendorPayments] = useQuery(queries.vendorPayment.all());
  const [eventInterests] = useQuery(queries.eventInterest.byCurrentUser());

  // Team leads can approve event photos/updates/interest for their teams
  const isLeadOfAnyTeam = teams.some((t) =>
    isTeamLead(t.members, session?.user.id ?? "")
  );
  const canManagePhotos =
    hasPermission("events.manage_photos") || isLeadOfAnyTeam;
  const canApproveUpdates =
    hasPermission("event_updates.approve") || isLeadOfAnyTeam;
  const canManageInterest =
    hasPermission("events.manage_interest") || isLeadOfAnyTeam;

  const [pendingPhotos] = useQuery(queries.eventPhoto.allPending(), {
    enabled: canManagePhotos,
  });
  const [pendingUpdates] = useQuery(queries.eventUpdate.allPending(), {
    enabled: canApproveUpdates,
  });
  const [pendingInterests] = useQuery(queries.eventInterest.allPending(), {
    enabled: canManageInterest,
  });
  // Skeleton only on first load — once Zero has cached data, it stays during re-sync
  const isLoading =
    reimbursements.length === 0 &&
    advancePayments.length === 0 &&
    isAwaitingResult(r1) &&
    isAwaitingResult(r2);

  const [dateParams] = useQueryStates(dateRangeSearchParams);
  const dateRange = resolveDateRange(
    dateParams.range,
    dateParams.from,
    dateParams.to
  );

  // Spend counts under the date the money was spent, as on Analytics.
  const filteredReimbursements = filterByDateRange(
    reimbursements,
    dateRange,
    spentAt
  );
  const filteredAdvancePayments = filterByDateRange(
    advancePayments,
    dateRange,
    spentAt
  );
  const filteredVendorPayments = filterByDateRange(
    vendorPayments,
    dateRange,
    spentAt
  );

  // Pending work uses unfiltered data: it's actionable regardless of age.
  const pendingReimbursements = reimbursements.filter(
    (item) => item.status === "pending"
  );
  const pendingAdvancePayments = advancePayments.filter(
    (item) => item.status === "pending"
  );
  const pendingVendorPayments = vendorPayments.filter(
    (item) => item.status === "pending"
  );
  const reviewPermissions = {
    canApproveRequests: canApprove,
    canApproveUpdates,
    canManageInterest,
    canManagePhotos,
  };
  const canReview = Object.values(reviewPermissions).some(Boolean);
  const waitingCount = countPendingReviews({
    advancePayments: pendingAdvancePayments,
    eventInterests: pendingInterests,
    eventPhotos: pendingPhotos,
    eventUpdates: pendingUpdates,
    permissions: reviewPermissions,
    reimbursements: pendingReimbursements,
    vendorPayments: pendingVendorPayments,
  });

  const stats = computeDashboardStats({
    advancePayments: filteredAdvancePayments,
    canReview,
    canViewAllRequests,
    canViewUsers,
    canViewVendors,
    events,
    ownPendingCount:
      pendingReimbursements.length + pendingAdvancePayments.length,
    reimbursements: filteredReimbursements,
    teams,
    users,
    vendorPayments: filteredVendorPayments,
    waitingCount,
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            <DateRangeFilter />
            <Button
              nativeButton={false}
              render={<Link to="/reimbursements/new" />}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              New reimbursement
            </Button>
          </>
        }
        title="Dashboard"
      />
      <SidebarShortcutTip />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <StatsCards
          className="min-w-0 flex-1 max-sm:basis-full"
          isLoading={isLoading}
          items={stats}
        />
        {canViewAllRequests && (
          <Button
            className="text-muted-foreground"
            nativeButton={false}
            render={<Link to="/analytics" />}
            size="sm"
            variant="ghost"
          >
            Analytics
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <AwaitingMyVote />
        <DeclareInterests />
        <PendingReviews
          advancePayments={pendingAdvancePayments}
          eventInterests={pendingInterests}
          eventPhotos={pendingPhotos}
          eventUpdates={pendingUpdates}
          isLoading={isLoading}
          permissions={reviewPermissions}
          reimbursements={pendingReimbursements}
          vendorPayments={pendingVendorPayments}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <MyTeams isLoading={isLoading} teams={teams} />
          <RecentActivity
            advancePayments={advancePayments}
            eventInterests={eventInterests}
            events={myEvents}
            isLoading={isLoading}
            reimbursements={reimbursements}
            vendorPayments={vendorPayments}
          />
        </div>
        <div className="min-w-0">
          <UpcomingEvents events={events} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

/** Desktop only: phones have no sidebar shortcut. */
function SidebarShortcutTip() {
  const isMobile = useIsMobile();
  const modifier = useShortcutModifier();
  if (isMobile) {
    return null;
  }
  return (
    <TipStrip className="mt-4" id="sidebar-shortcut">
      Press <Kbd>{modifier}B</Kbd> to collapse or expand the sidebar.
    </TipStrip>
  );
}
