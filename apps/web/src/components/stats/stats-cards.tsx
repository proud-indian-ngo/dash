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

import type { StatusTone } from "@/components/shared/status-badge";

const STAGGER_DELAY_MS = 50;

export interface StatItem {
  description?: string;
  href?: string;
  icon?: IconSvgElement;
  label: string;
  /** Tints the KPI chip. Cards stay neutral. */
  tone?: StatusTone;
  value: string | number;
}

export function StatCard({
  item,
  animationDelay,
}: {
  animationDelay?: number;
  item: StatItem;
}) {
  const card = (
    <Card className="h-full" size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          {item.icon ? (
            <HugeiconsIcon
              className="size-3.5"
              icon={item.icon}
              strokeWidth={2}
            />
          ) : null}
          {item.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-display truncate text-2xl font-semibold tracking-tight tabular-nums">
          {item.value}
        </div>
        {Boolean(item.description) && (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );

  const animate = animationDelay !== undefined;
  const animationClasses = animate
    ? "fade-in-0 slide-in-from-bottom-1 animate-in animate-blur-in fill-mode-backwards duration-200 ease-(--ease-out-expo)"
    : "";
  const animationStyle = animate
    ? { animationDelay: `${animationDelay}ms` }
    : undefined;

  if (item.href) {
    return (
      <Link
        className={`hover:bg-muted/40 min-w-0 transition-colors ${animationClasses}`}
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

const CHIP_TONE: Record<StatusTone, string> = {
  danger: "bg-destructive/5 ring-destructive/25 [&_svg]:text-destructive",
  info: "bg-info/5 ring-info/25 [&_svg]:text-info-foreground",
  neutral: "ring-border",
  success: "bg-success/6 ring-success/30 [&_svg]:text-success-foreground",
  warning: "bg-warning/8 ring-warning/35 [&_svg]:text-warning-foreground",
};

/** A compact KPI chip for pages where a table's view tabs already show counts. */
function StatChip({ item }: { item: StatItem }) {
  const chip = (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm ring-1 ring-inset",
        CHIP_TONE[item.tone ?? "neutral"]
      )}
      data-slot="stat-chip"
    >
      {item.icon ? (
        <HugeiconsIcon
          className={cn(
            "size-3.5",
            (item.tone ?? "neutral") === "neutral" && "text-muted-foreground"
          )}
          icon={item.icon}
          strokeWidth={2}
        />
      ) : null}
      <span className="text-muted-foreground" data-slot="stat-label">
        {item.label}
      </span>
      <span className="font-mono font-semibold tabular-nums">{item.value}</span>
      {item.description ? (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {item.description}
        </span>
      ) : null}
    </span>
  );
  if (item.href) {
    return (
      <Link
        className="hover:bg-muted/40 rounded-lg transition-colors"
        to={item.href}
      >
        {chip}
      </Link>
    );
  }
  return chip;
}

function StatChipsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {["sk-1", "sk-2", "sk-3", "sk-4"].map((id) => (
        <Skeleton className="h-8 w-36 rounded-lg" key={id} />
      ))}
    </div>
  );
}

export function StatsCards({
  className,
  items,
  isLoading,
  variant = "cards",
}: {
  className?: string;
  items: StatItem[];
  isLoading?: boolean;
  /** `chips` is a single compact row, for table pages. */
  variant?: "cards" | "chips";
}) {
  if (variant === "chips") {
    if (isLoading) {
      return <StatChipsSkeleton />;
    }
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {items.map((item) => (
          <StatChip item={item} key={item.label} />
        ))}
      </div>
    );
  }
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
