import {
  Camera01Icon,
  CheckmarkCircle02Icon,
  Message01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Card, CardContent } from "@pi-dash/design-system/components/ui/card";

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
        className="size-4 shrink-0 text-muted-foreground"
        icon={icon}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <div className="font-medium text-sm tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
    </div>
  );
}

interface EventQuickStatsProps {
  feedbackCount: number;
  hasStarted: boolean;
  memberCount: number;
  photoCount: number;
  presentCount: number;
}

export function EventQuickStats({
  feedbackCount,
  hasStarted,
  memberCount,
  photoCount,
  presentCount,
}: EventQuickStatsProps) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3">
        <StatItem icon={UserGroupIcon} label="Volunteers" value={memberCount} />
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
      </CardContent>
    </Card>
  );
}
