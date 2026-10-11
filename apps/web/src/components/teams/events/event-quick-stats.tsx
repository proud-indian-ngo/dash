import {
  Camera01Icon,
  CheckmarkCircle02Icon,
  Invoice01Icon,
  Message01Icon,
  UserAdd01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Card, CardContent } from "@pi-dash/design-system/components/ui/card";

import { formatINR } from "@/lib/form-schemas";

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2">
      <HugeiconsIcon
        className="text-muted-foreground size-4 shrink-0"
        icon={icon}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
    </div>
  );
}

interface EventQuickStatsProps {
  /** Approved sign-ups against `volunteersNeeded`, shown when a target is set. */
  approvedCount?: number;
  feedbackCount: number;
  hasStarted: boolean;
  memberCount: number;
  photoCount: number;
  presentCount: number;
  totalExpenses: number;
  volunteersNeeded?: number | null;
}

export function EventQuickStats({
  approvedCount = 0,
  feedbackCount,
  hasStarted,
  memberCount,
  photoCount,
  presentCount,
  totalExpenses,
  volunteersNeeded,
}: EventQuickStatsProps) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3">
        <StatItem icon={UserGroupIcon} label="Volunteers" value={memberCount} />
        {volunteersNeeded ? (
          <StatItem
            icon={UserAdd01Icon}
            label="Approved / needed"
            value={`${approvedCount}/${volunteersNeeded}`}
          />
        ) : null}
        {hasStarted ? (
          <StatItem
            icon={CheckmarkCircle02Icon}
            label="Attendance"
            value={memberCount > 0 ? `${presentCount}/${memberCount}` : "0"}
          />
        ) : null}
        {hasStarted || photoCount > 0 ? (
          <StatItem icon={Camera01Icon} label="Photos" value={photoCount} />
        ) : null}
        {hasStarted || feedbackCount > 0 ? (
          <StatItem
            icon={Message01Icon}
            label="Feedback"
            value={feedbackCount}
          />
        ) : null}
        {totalExpenses > 0 ? (
          <StatItem
            icon={Invoice01Icon}
            label="Expenses"
            value={formatINR(totalExpenses)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
