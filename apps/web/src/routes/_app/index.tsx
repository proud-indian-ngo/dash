import {
  Clock01Icon,
  Invoice01Icon,
  PlusSignIcon,
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
  },
  component: DashboardHome,
});

function computeDashboardStats(
  reimbursements: readonly WithStatusAndLineItems[],
  advancePayments: readonly WithStatusAndLineItems[],
  users: readonly { role: string | null }[],
  isAdmin: boolean
): StatItem[] {
  const allRequests = [...reimbursements, ...advancePayments];
  const pendingCount =
    byStatus(reimbursements, "pending").length +
    byStatus(advancePayments, "pending").length;

  return [
    {
      label: isAdmin ? "All Requests" : "My Requests",
      value: allRequests.length,
      description: formatINR(sumTotal(allRequests)),
      icon: Invoice01Icon,
      accent: "border-l-blue-500",
      href: "/requests",
    },
    {
      label: isAdmin ? "Pending Reviews" : "My Pending",
      value: pendingCount,
      description: "Awaiting review",
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      href: "/requests?status=pending",
    },
    ...(isAdmin
      ? [
          {
            label: "Total Users",
            value: users.length,
            icon: UserMultipleIcon,
            accent: "border-l-emerald-500",
            href: "/users",
          },
        ]
      : []),
  ];
}

function DashboardHome() {
  const { isOriented } = useApp();

  if (!isOriented) {
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

function OrientedDashboard() {
  const { session } = Route.useRouteContext();
  const { isAdmin } = useApp();

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [users, r3] = useQuery(queries.user.all());
  const [teams, r4] = useQuery(queries.team.byCurrentUser());
  const [events, r5] = useQuery(queries.teamEvent.byCurrentUser());

  const isLoading =
    r1.type === "unknown" || r2.type === "unknown" || r3.type === "unknown";
  const isWidgetsLoading =
    r4.type === "unknown" || r5.type === "unknown";

  const stats = isLoading
    ? []
    : computeDashboardStats(
        reimbursements ?? [],
        advancePayments ?? [],
        users ?? [],
        isAdmin
      );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Dashboard</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Welcome {session?.user.name}
      </p>

      <div className="mt-6">
        <StatsCards isLoading={isLoading} items={stats} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <MyTeams isLoading={isWidgetsLoading} teams={teams ?? []} />
          <RecentActivity
            advancePayments={advancePayments ?? []}
            isLoading={isLoading}
            reimbursements={reimbursements ?? []}
          />
        </div>
        <div>
          <UpcomingEvents
            events={events ?? []}
            isLoading={isWidgetsLoading}
          />
        </div>
      </div>
    </div>
  );
}
