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
import { formatDistanceToNow } from "date-fns";
import {
  STATUS_BADGE_MAP,
  type StatusBadgeVariant,
} from "@/lib/status-badge";
import { formatINR } from "@/lib/form-schemas";

interface RequestItem {
  id: string;
  status: string | null;
  createdAt: number;
  lineItems: readonly { amount: number }[];
}

interface ActivityItem {
  id: string;
  type: "reimbursement" | "advance_payment";
  icon: IconSvgElement;
  label: string;
  status: string | null;
  amount: number;
  createdAt: number;
}

const MAX_ITEMS = 8;

function toActivityItems(
  items: readonly RequestItem[],
  type: ActivityItem["type"],
  icon: IconSvgElement,
  label: string
): ActivityItem[] {
  return items.map((item) => ({
    id: item.id,
    type,
    icon,
    label,
    status: item.status,
    amount: item.lineItems.reduce((sum, li) => sum + li.amount, 0),
    createdAt: item.createdAt,
  }));
}

export function RecentActivity({
  reimbursements,
  advancePayments,
  isLoading,
}: {
  reimbursements: readonly RequestItem[];
  advancePayments: readonly RequestItem[];
  isLoading?: boolean;
}) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <HugeiconsIcon
            className="size-4"
            icon={Clock01Icon}
            strokeWidth={2}
          />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
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
        ) : activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => {
              const statusInfo =
                activity.status &&
                STATUS_BADGE_MAP[
                  activity.status as keyof typeof STATUS_BADGE_MAP
                ];
              return (
                <div className="flex items-start gap-3" key={activity.id}>
                  <HugeiconsIcon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    icon={activity.icon}
                    strokeWidth={2}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm">
                        {activity.label}
                        <span className="ml-1 text-muted-foreground">
                          {formatINR(activity.amount)}
                        </span>
                      </p>
                      {statusInfo && (
                        <Badge
                          size="xs"
                          variant={
                            statusInfo.variant as StatusBadgeVariant
                          }
                        >
                          {statusInfo.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatDistanceToNow(activity.createdAt, {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
