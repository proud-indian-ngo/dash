import {
  Clock01Icon,
  Invoice01Icon,
  UserMultipleIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import type { StatItem } from "@/components/stats/stats-cards";
import { StatsCards } from "@/components/stats/stats-cards";
import { formatINR } from "@/lib/form-schemas";
import { byStatus, sumTotal, type WithStatusAndLineItems } from "@/lib/stats";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [{ title: "Dashboard | Proud Indian Dashboard" }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.reimbursement.all());
    context.zero?.run(queries.advancePayment.all());
    context.zero?.run(queries.user.all());
  },
  component: DashboardHome,
});

function computeDashboardStats(
  reimbursements: readonly WithStatusAndLineItems[],
  advancePayments: readonly WithStatusAndLineItems[],
  users: readonly { role: string | null }[]
): StatItem[] {
  const pendingReimbursements = byStatus(reimbursements, "pending");
  const pendingAdvancePayments = byStatus(advancePayments, "pending");

  return [
    {
      label: "Reimbursements",
      value: reimbursements.length,
      description: formatINR(sumTotal(reimbursements)),
      icon: Invoice01Icon,
      accent: "border-l-blue-500",
    },
    {
      label: "Advance Payments",
      value: advancePayments.length,
      description: formatINR(sumTotal(advancePayments)),
      icon: Wallet01Icon,
      accent: "border-l-violet-500",
    },
    {
      label: "Pending Requests",
      value: pendingReimbursements.length + pendingAdvancePayments.length,
      description: "Awaiting review",
      icon: Clock01Icon,
      accent: "border-l-amber-500",
    },
    {
      label: "Total Users",
      value: users.length,
      icon: UserMultipleIcon,
      accent: "border-l-emerald-500",
    },
  ];
}

function DashboardHome() {
  const { session } = Route.useRouteContext();

  const [reimbursements] = useQuery(queries.reimbursement.all());
  const [advancePayments] = useQuery(queries.advancePayment.all());
  const [users] = useQuery(queries.user.all());

  const stats = computeDashboardStats(
    reimbursements ?? [],
    advancePayments ?? [],
    users ?? []
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Dashboard</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Welcome {session?.user.name}
      </p>

      <div className="mt-6">
        <StatsCards items={stats} />
      </div>
    </div>
  );
}
