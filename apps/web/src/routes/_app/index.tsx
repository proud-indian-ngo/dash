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
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MyTeams } from "@/components/dashboard/my-teams";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingEvents } from "@/components/dashboard/upcoming-events";
import type { StatItem } from "@/components/stats/stats-cards";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import { formatINR } from "@/lib/form-schemas";
import { byStatus, sumTotal, type WithStatusAndLineItems } from "@/lib/stats";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [{ title: `Dashboard | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.reimbursement.all());
    context.zero?.preload(queries.advancePayment.all());
    context.zero?.preload(queries.user.all());
    context.zero?.preload(queries.team.byCurrentUser());
    context.zero?.preload(queries.teamEvent.byCurrentUser());
    context.zero?.preload(queries.vendorPayment.all());
  },
  component: DashboardHome,
});

interface DashboardStatsInput {
  advancePayments: readonly WithStatusAndLineItems[];
  canApprove: boolean;
  canViewAllRequests: boolean;
  canViewUsers: boolean;
  canViewVendors: boolean;
  events: readonly { startTime: number | null }[];
  pendingCount: number;
  reimbursements: readonly WithStatusAndLineItems[];
  teams: readonly { id: string }[];
  users: readonly { role: string | null }[];
  vendorPayments: readonly WithStatusAndLineItems[];
}

function computeDashboardStats({
  reimbursements,
  advancePayments,
  users,
  teams,
  events,
  vendorPayments,
  canViewAllRequests,
  canApprove,
  canViewUsers,
  canViewVendors,
  pendingCount,
}: DashboardStatsInput): StatItem[] {
  const allRequests = [...reimbursements, ...advancePayments];

  return [
    {
      label: canViewAllRequests ? "All Reimbursements" : "My Reimbursements",
      value: allRequests.length,
      description: formatINR(sumTotal(allRequests)),
      icon: Invoice01Icon,
      accent: "border-l-brand",
      bgAccent: "bg-brand/5 dark:bg-brand/10",
      href: "/reimbursements",
    },
    {
      label: canApprove ? "Pending Reviews" : "My Pending",
      value: pendingCount,
      description: "Awaiting review",
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
      href: "/reimbursements?status=pending",
    },
    ...(canViewUsers
      ? [
          {
            label: "Total Users",
            value: users.length,
            icon: UserMultipleIcon,
            accent: "border-l-brand",
            bgAccent: "bg-brand/5 dark:bg-brand/10",
            href: "/users",
          },
        ]
      : [
          {
            label: "My Teams",
            value: teams.length,
            icon: UserMultipleIcon,
            accent: "border-l-brand",
            bgAccent: "bg-brand/5 dark:bg-brand/10",
            href: "/teams",
          },
        ]),
    ...(canViewVendors
      ? [
          {
            label: "Vendor Payments",
            value: vendorPayments.length,
            description: formatINR(sumTotal(vendorPayments)),
            icon: Store01Icon,
            accent: "border-l-brand",
            bgAccent: "bg-brand/5 dark:bg-brand/10",
            href: "/vendors",
          },
        ]
      : [
          {
            label: "Upcoming Events",
            value: events.filter(
              (e) => e.startTime != null && e.startTime > Date.now()
            ).length,
            icon: Calendar03Icon,
            accent: "border-l-brand",
            bgAccent: "bg-brand/5 dark:bg-brand/10",
            href: "/events",
          },
        ]),
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
    <div className="app-container fade-in-0 mx-auto max-w-7xl animate-in px-4 py-6 duration-150 ease-(--ease-out-expo)">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Dashboard
      </h1>
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
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            Browse Events
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PendingActions({
  canApprove,
  draftCount,
  pendingCount,
}: {
  canApprove: boolean;
  draftCount: number;
  pendingCount: number;
}) {
  if (pendingCount === 0 && draftCount === 0) {
    return null;
  }

  return (
    <div className="fade-in-0 slide-in-from-bottom-1 mt-4 animate-in space-y-2 fill-mode-backwards duration-200 ease-(--ease-out-expo)">
      {canApprove && pendingCount > 0 && (
        <Link
          className="flex items-center gap-3 border-amber-500 border-l-2 bg-amber-50/50 px-4 py-3 transition-colors hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
          search={{ status: "pending" }}
          to="/reimbursements"
        >
          <HugeiconsIcon
            className="size-4 shrink-0 text-amber-500"
            icon={Clock01Icon}
            strokeWidth={2}
          />
          <span className="flex-1 text-sm">
            <span className="font-display font-semibold text-lg tracking-tight">
              {pendingCount}
            </span>{" "}
            {pendingCount === 1 ? "reimbursement needs" : "reimbursements need"}{" "}
            your review
          </span>
          <Button
            className="shrink-0"
            nativeButton={false}
            render={<span />}
            size="xs"
            variant="outline"
          >
            Review
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </Link>
      )}
      {draftCount > 0 && (
        <Link
          className="flex items-center gap-3 border-muted-foreground/30 border-l-2 bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
          search={{ status: "draft" }}
          to="/reimbursements"
        >
          <HugeiconsIcon
            className="size-4 shrink-0 text-muted-foreground"
            icon={Invoice01Icon}
            strokeWidth={2}
          />
          <span className="flex-1 text-muted-foreground text-sm">
            <span className="font-display font-semibold text-foreground text-lg tracking-tight">
              {draftCount}
            </span>{" "}
            draft {draftCount === 1 ? "reimbursement" : "reimbursements"} to
            complete
          </span>
          <Button
            className="shrink-0"
            nativeButton={false}
            render={<span />}
            size="xs"
            variant="outline"
          >
            Continue
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </Link>
      )}
    </div>
  );
}

function OrientedDashboard() {
  const { hasPermission } = useApp();
  const canViewAllRequests = hasPermission("requests.view_all");
  const canApprove = hasPermission("requests.approve");
  const canViewUsers = hasPermission("users.view");
  const canViewVendors = hasPermission("vendors.view_all");

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [users] = useQuery(queries.user.all());
  const [teams] = useQuery(queries.team.byCurrentUser());
  const [events] = useQuery(queries.teamEvent.byCurrentUser());
  const [vendorPayments] = useQuery(queries.vendorPayment.all());
  // Skeleton only on first load — once Zero has cached data, it stays during re-sync
  const isLoading =
    reimbursements.length === 0 &&
    advancePayments.length === 0 &&
    r1.type !== "complete" &&
    r2.type !== "complete";

  const pendingCount =
    byStatus(reimbursements, "pending").length +
    byStatus(advancePayments, "pending").length +
    byStatus(vendorPayments, "pending").length;

  const draftCount =
    byStatus(reimbursements, "draft").length +
    byStatus(advancePayments, "draft").length;

  const stats = computeDashboardStats({
    reimbursements,
    advancePayments,
    users,
    teams,
    events,
    vendorPayments,
    canViewAllRequests,
    canApprove,
    canViewUsers,
    canViewVendors,
    pendingCount,
  });

  return (
    <div className="app-container fade-in-0 mx-auto max-w-7xl animate-in px-4 py-6 duration-150 ease-(--ease-out-expo)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          Dashboard
        </h1>
        <Button
          nativeButton={false}
          render={<Link to="/reimbursements/new" />}
          size="sm"
          variant="outline"
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          New Reimbursement
        </Button>
      </div>

      <PendingActions
        canApprove={canApprove}
        draftCount={draftCount}
        pendingCount={pendingCount}
      />

      <div className="mt-4">
        <StatsCards isLoading={isLoading} items={stats} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <MyTeams isLoading={isLoading} teams={teams} />
          <RecentActivity
            advancePayments={advancePayments}
            isLoading={isLoading}
            reimbursements={reimbursements}
          />
        </div>
        <div>
          <UpcomingEvents events={events} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
