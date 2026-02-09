import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";

export interface StatItem {
  accent?: string;
  description?: string;
  icon?: IconSvgElement;
  label: string;
  value: string | number;
}

export function StatCard({ item }: { item: StatItem }) {
  return (
    <Card
      className={item.accent ? `border-l-2 ${item.accent}` : undefined}
      size="sm"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
          {item.icon && (
            <HugeiconsIcon
              className="size-3.5"
              icon={item.icon}
              strokeWidth={2}
            />
          )}
          {item.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-semibold text-2xl">{item.value}</div>
        {item.description && (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsCards({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <StatCard item={item} key={item.label} />
      ))}
    </div>
  );
}
