import {
  Calendar03Icon,
  Clock01Icon,
  Invoice01Icon,
  MoneyReceiveSquareIcon,
  Store01Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { GhostEmptyState } from "@/components/shared/ghost-empty-state";
import { formatINR } from "@/lib/form-schemas";
import { getStatusBadge, type StatusBadgeVariant } from "@/lib/status-badge";

interface FinancialItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amount: number }[];
  status: string | null;
  title: string;
}

interface EventItem {
  cancelledAt: number | null;
  createdAt: number;
  id: string;
  name: string;
  team?: { name: string } | undefined;
}

interface EventInterestItem {
  createdAt: number;
  event?: { id: string; name: string } | undefined;
  id: string;
  status: string | null;
}

interface VendorPaymentItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amount: number }[];
  status: string | null;
  title: string;
  vendor?: { name: string } | undefined;
}

interface ActivityItem {
  amount?: number;
  createdAt: number;
  entityId: string;
  icon: IconSvgElement;
  id: string;
  label: string;
  route: string;
  status?: string | null;
  title: string;
}

const MAX_ITEMS = 5;

function toFinancialActivities(
  items: readonly FinancialItem[],
  icon: IconSvgElement,
  label: string,
  route: string
): ActivityItem[] {
  return items.map((item) => ({
    amount: item.lineItems.reduce((sum, li) => sum + li.amount, 0),
    createdAt: item.createdAt,
    entityId: item.id,
    icon,
    id: item.id,
    label,
    route,
    status: item.status,
    title: item.title,
  }));
}

function toEventActivities(events: readonly EventItem[]): ActivityItem[] {
  return events.map((event) => {
    const isCancelled = event.cancelledAt != null;
    const teamName = event.team?.name;
    return {
      createdAt: event.cancelledAt ?? event.createdAt,
      entityId: event.id,
      icon: Calendar03Icon,
      id: `event-${event.id}`,
      label: isCancelled
        ? `Cancelled${teamName ? ` · ${teamName}` : ""}`
        : `New Event${teamName ? ` · ${teamName}` : ""}`,
      route: "/events/$id",
      status: null,
      title: event.name,
    };
  });
}

function toRegistrationActivities(
  interests: readonly EventInterestItem[]
): ActivityItem[] {
  return interests.map((interest) => ({
    createdAt: interest.createdAt,
    entityId: interest.event?.id ?? interest.id,
    icon: Ticket01Icon,
    id: `reg-${interest.id}`,
    label: "Registration",
    route: "/events/$id",
    status: interest.status,
    title: interest.event?.name ?? "Event",
  }));
}

function toVendorPaymentActivities(
  payments: readonly VendorPaymentItem[]
): ActivityItem[] {
  return payments.map((payment) => {
    const vendorName = payment.vendor?.name;
    return {
      amount: payment.lineItems.reduce((sum, li) => sum + li.amount, 0),
      createdAt: payment.createdAt,
      entityId: payment.id,
      icon: Store01Icon,
      id: `vp-${payment.id}`,
      label: "Vendor Payment",
      route: "/vendor-payments/$id",
      status: payment.status,
      title: vendorName ? `${vendorName} — ${payment.title}` : payment.title,
    };
  });
}

const GHOST_ACTIVITIES = [
  { title: "Office Supplies", label: "Reimbursement", amount: "2,500" },
  { title: "Team Outing", label: "New Event" },
  { title: "Workshop", label: "Registration" },
  { title: "Catering Services", label: "Vendor Payment", amount: "5,000" },
];

function RecentActivityEmpty() {
  return (
    <GhostEmptyState
      ghostContent={GHOST_ACTIVITIES.map((activity) => (
        <div className="flex items-start gap-3" key={activity.title}>
          <HugeiconsIcon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            icon={Invoice01Icon}
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{activity.title}</p>
            <p className="text-muted-foreground text-xs">
              {activity.label}
              {"amount" in activity && ` · ${activity.amount}`}
            </p>
          </div>
        </div>
      ))}
    >
      <p className="text-muted-foreground text-sm">
        Your activity will appear here
      </p>
    </GhostEmptyState>
  );
}

function RecentActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div className="flex items-center gap-3" key={i}>
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivityList({ activities }: { activities: ActivityItem[] }) {
  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const statusInfo = activity.status
          ? getStatusBadge(activity.status)
          : null;
        return (
          <Link
            className="-mx-2 flex items-start gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
            key={activity.id}
            params={{ id: activity.entityId }}
            to={activity.route}
          >
            <HugeiconsIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              icon={activity.icon}
              strokeWidth={2}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-sm">{activity.title}</p>
                {statusInfo && (
                  <Badge
                    size="xs"
                    variant={statusInfo.variant as StatusBadgeVariant}
                  >
                    {statusInfo.label}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {activity.label}
                {activity.amount != null && ` · ${formatINR(activity.amount)}`}
                {" · "}
                {formatDistanceToNow(activity.createdAt, {
                  addSuffix: true,
                })}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export interface RecentActivityProps {
  advancePayments: readonly FinancialItem[];
  eventInterests: readonly EventInterestItem[];
  events: readonly EventItem[];
  isLoading?: boolean;
  reimbursements: readonly FinancialItem[];
  vendorPayments: readonly VendorPaymentItem[];
}

export function RecentActivity({
  advancePayments,
  eventInterests,
  events,
  isLoading,
  reimbursements,
  vendorPayments,
}: RecentActivityProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <HugeiconsIcon
              className="size-4 text-amber-500"
              icon={Clock01Icon}
              strokeWidth={2}
            />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentActivitySkeleton />
        </CardContent>
      </Card>
    );
  }

  const activities = [
    ...toFinancialActivities(
      reimbursements,
      Invoice01Icon,
      "Reimbursement",
      "/reimbursements/$id"
    ),
    ...toFinancialActivities(
      advancePayments,
      MoneyReceiveSquareIcon,
      "Advance Payment",
      "/reimbursements/$id"
    ),
    ...toEventActivities(events),
    ...toRegistrationActivities(eventInterests),
    ...toVendorPaymentActivities(vendorPayments),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <HugeiconsIcon
            className="size-4 text-amber-500"
            icon={Clock01Icon}
            strokeWidth={2}
          />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)">
          {activities.length === 0 ? (
            <RecentActivityEmpty />
          ) : (
            <RecentActivityList activities={activities} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
