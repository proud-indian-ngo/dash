import {
  Clock01Icon,
  Invoice01Icon,
  MoneyReceiveSquareIcon,
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
import { STATUS_BADGE_MAP, type StatusBadgeVariant } from "@/lib/status-badge";

interface RequestItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amount: number }[];
  status: string | null;
  title: string;
}

interface ActivityItem {
  amount: number;
  createdAt: number;
  icon: IconSvgElement;
  id: string;
  label: string;
  status: string | null;
  title: string;
  type: "reimbursement" | "advance_payment";
}

const MAX_ITEMS = 5;

function toActivityItems(
  items: readonly RequestItem[],
  type: ActivityItem["type"],
  icon: IconSvgElement,
  label: string
): ActivityItem[] {
  return items.map((item) => ({
    amount: item.lineItems.reduce((sum, li) => sum + li.amount, 0),
    createdAt: item.createdAt,
    icon,
    id: item.id,
    label,
    status: item.status,
    title: item.title,
    type,
  }));
}

const GHOST_ACTIVITIES = [
  { title: "Office Supplies", label: "Reimbursement", amount: "2,500" },
  { title: "Travel Allowance", label: "Advance Payment", amount: "5,000" },
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
              {activity.label} &middot; {activity.amount}
            </p>
          </div>
        </div>
      ))}
    >
      <p className="text-muted-foreground text-sm">
        Your requests and updates will appear here
      </p>
      <Link
        className="mt-1.5 inline-block font-medium text-primary text-sm underline underline-offset-4"
        to="/requests"
      >
        Submit a request
      </Link>
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

function RecentActivityContent({
  advancePayments,
  isLoading,
  reimbursements,
}: {
  advancePayments: readonly RequestItem[];
  isLoading?: boolean;
  reimbursements: readonly RequestItem[];
}) {
  if (isLoading) {
    return <RecentActivitySkeleton />;
  }
  const activities = [
    ...toActivityItems(
      reimbursements,
      "reimbursement",
      Invoice01Icon,
      "Reimbursement"
    ),
    ...toActivityItems(
      advancePayments,
      "advance_payment",
      MoneyReceiveSquareIcon,
      "Advance Payment"
    ),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS);

  if (activities.length === 0) {
    return (
      <div className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)">
        <RecentActivityEmpty />
      </div>
    );
  }
  return (
    <div className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)">
      <RecentActivityList activities={activities} />
    </div>
  );
}

function RecentActivityList({ activities }: { activities: ActivityItem[] }) {
  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const statusInfo =
          activity.status &&
          STATUS_BADGE_MAP[activity.status as keyof typeof STATUS_BADGE_MAP];
        return (
          <div className="flex items-start gap-3" key={activity.id}>
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
                {activity.label} &middot; {formatINR(activity.amount)} &middot;{" "}
                {formatDistanceToNow(activity.createdAt, {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RecentActivity({
  advancePayments,
  isLoading,
  reimbursements,
}: {
  advancePayments: readonly RequestItem[];
  isLoading?: boolean;
  reimbursements: readonly RequestItem[];
}) {
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
        <RecentActivityContent
          advancePayments={advancePayments}
          isLoading={isLoading}
          reimbursements={reimbursements}
        />
      </CardContent>
    </Card>
  );
}
