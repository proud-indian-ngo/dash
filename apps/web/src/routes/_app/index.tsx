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
    context.zero?.run(queries.reimbursement.all());
    context.zero?.run(queries.advancePayment.all());
    context.zero?.run(queries.user.all());
    context.zero?.run(queries.team.byCurrentUser());
    context.zero?.run(queries.teamEvent.byCurrentUser());
    context.zero?.run(queries.vendorPayment.all());
  },
  component: DashboardHome,
});

const SECTION_DELAY_MS = 150;

interface DashboardStatsInput {
  advancePayments: readonly WithStatusAndLineItems[];
  events: readonly { startTime: number | null }[];
  isAdmin: boolean;
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
  isAdmin,
  pendingCount,
}: DashboardStatsInput): StatItem[] {
  const allRequests = [...reimbursements, ...advancePayments];

  return [
    {
      label: isAdmin ? "All Requests" : "My Requests",
      value: allRequests.length,
      description: formatINR(sumTotal(allRequests)),
      icon: Invoice01Icon,
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
      href: "/requests",
    },
    {
      label: isAdmin ? "Pending Reviews" : "My Pending",
      value: pendingCount,
      description: "Awaiting review",
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
      href: "/requests?status=pending",
    },
    ...(isAdmin
      ? [
          {
            label: "Total Users",
            value: users.length,
            icon: UserMultipleIcon,
            accent: "border-l-emerald-500",
            bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
            href: "/users",
          },
          {
            label: "Vendor Payments",
            value: vendorPayments.length,
            description: formatINR(sumTotal(vendorPayments)),
            icon: Store01Icon,
            accent: "border-l-violet-500",
            bgAccent: "bg-violet-500/5 dark:bg-violet-500/10",
            href: "/vendors",
          },
        ]
      : [
          {
            label: "My Teams",
            value: teams.length,
            icon: UserMultipleIcon,
            accent: "border-l-teal-500",
            bgAccent: "bg-teal-500/5 dark:bg-teal-500/10",
            href: "/teams",
          },
          {
            label: "Upcoming Events",
            value: events.filter(
              (e) => e.startTime != null && e.startTime > Date.now()
            ).length,
            icon: Calendar03Icon,
            accent: "border-l-purple-500",
            bgAccent: "bg-purple-500/5 dark:bg-purple-500/10",
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
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Dashboard</h1>
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

function PendingCallout({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  return (
    <Link
      className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 transition-colors hover:bg-amber-50 dark:border-amber-500/20 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
      search={{ status: "pending" }}
      to="/requests"
    >
      <HugeiconsIcon
        className="size-4 shrink-0 text-amber-500"
        icon={Clock01Icon}
        strokeWidth={2}
      />
      <span className="flex-1 text-sm">
        <span className="font-medium">{count}</span>{" "}
        {count === 1 ? "request needs" : "requests need"} your review
      </span>
      <HugeiconsIcon
        className="size-4 shrink-0 text-muted-foreground"
        icon={ArrowRight01Icon}
        strokeWidth={2}
      />
    </Link>
  );
}

function OrientedDashboard() {
  const { isAdmin } = useApp();

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [users, r3] = useQuery(queries.user.all());
  const [teams, r4] = useQuery(queries.team.byCurrentUser());
  const [events, r5] = useQuery(queries.teamEvent.byCurrentUser());
  const [vendorPayments, r6] = useQuery(queries.vendorPayment.all());

  const isLoading =
    r1.type === "unknown" ||
    r2.type === "unknown" ||
    r3.type === "unknown" ||
    r4.type === "unknown" ||
    r5.type === "unknown" ||
    r6.type === "unknown";

  const pendingCount = isLoading
    ? 0
    : byStatus(reimbursements ?? [], "pending").length +
      byStatus(advancePayments ?? [], "pending").length +
      byStatus(vendorPayments ?? [], "pending").length;

  const stats = isLoading
    ? []
    : computeDashboardStats({
        reimbursements: reimbursements ?? [],
        advancePayments: advancePayments ?? [],
        users: users ?? [],
        teams: teams ?? [],
        events: events ?? [],
        vendorPayments: vendorPayments ?? [],
        isAdmin,
        pendingCount,
      });

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold text-2xl">Dashboard</h1>
        <Button
          nativeButton={false}
          render={<Link to="/requests/new" />}
          size="sm"
          variant="outline"
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          New Request
        </Button>
      </div>

      {isAdmin && <PendingCallout count={pendingCount} />}

      <div className="mt-3">
        <StatsCards isLoading={isLoading} items={stats} />
      </div>

      <div
        className="fade-in-0 mt-8 grid animate-in gap-6 fill-mode-backwards duration-200 lg:grid-cols-2"
        style={{ animationDelay: `${SECTION_DELAY_MS}ms` }}
      >
        <div className="space-y-6">
          <MyTeams isLoading={isLoading} teams={teams ?? []} />
          <RecentActivity
            advancePayments={advancePayments ?? []}
            isLoading={isLoading}
            reimbursements={reimbursements ?? []}
          />
        </div>
        <div>
          <UpcomingEvents events={events ?? []} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
