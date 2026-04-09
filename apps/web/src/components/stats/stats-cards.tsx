import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link } from "@tanstack/react-router";

const STAGGER_DELAY_MS = 50;

export interface StatItem {
  accent?: string;
  bgAccent?: string;
  description?: string;
  href?: string;
  icon?: IconSvgElement;
  label: string;
  value: string | number;
}

export function StatCard({
  item,
  animationDelay,
}: {
  animationDelay?: number;
  item: StatItem;
}) {
  const cardClasses = [
    "h-full",
    item.accent && `border-l-2 ${item.accent}`,
    item.bgAccent,
  ]
    .filter(Boolean)
    .join(" ");

  const card = (
    <Card className={cardClasses} size="sm">
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
        <div className="truncate font-display font-semibold text-2xl tracking-tight">
          {item.value}
        </div>
        {item.description && (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );

  const animate = animationDelay != null;
  const animationClasses = animate
    ? "fade-in-0 slide-in-from-bottom-1 animate-in animate-blur-in fill-mode-backwards duration-200 ease-(--ease-out-expo)"
    : "";
  const animationStyle = animate
    ? { animationDelay: `${animationDelay}ms` }
    : undefined;

  if (item.href) {
    return (
      <Link
        className={`min-w-0 transition-colors hover:bg-muted/40 ${animationClasses}`}
        style={animationStyle}
        to={item.href}
      >
        {card}
      </Link>
    );
  }

  if (!animate) {
    return card;
  }

  return (
    <div className={`min-w-0 ${animationClasses}`} style={animationStyle}>
      {card}
    </div>
  );
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
  className,
  items,
  isLoading,
}: {
  className?: string;
  items: StatItem[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <StatsCardsSkeleton />;
  }
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {items.map((item, index) => (
        <StatCard
          animationDelay={index * STAGGER_DELAY_MS}
          item={item}
          key={item.label}
        />
      ))}
    </div>
  );
}
