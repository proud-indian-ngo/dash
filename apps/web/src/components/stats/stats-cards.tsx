import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

export interface StatItem {
  accent?: string;
  description?: string;
  href?: string;
  icon?: IconSvgElement;
  label: string;
  value: string | number;
}

export function StatCard({ item }: { item: StatItem }) {
  const card = (
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

  if (item.href) {
    return (
      <Link className="transition-opacity hover:opacity-80" to={item.href}>
        {card}
      </Link>
    );
  }

  return card;
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {["sk-1", "sk-2", "sk-3", "sk-4"].map((id) => (
        <Card key={id} size="sm">
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-3 w-20" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="mt-1 h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatsCards({
  items,
  isLoading,
}: {
  items: StatItem[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <StatsCardsSkeleton />;
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <StatCard item={item} key={item.label} />
      ))}
    </div>
  );
}
