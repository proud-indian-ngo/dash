import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { StatusTone } from "@/components/shared/status-badge";

export interface StatItem {
  /** Accessible name for a chip that filters on click. */
  actionLabel?: string;
  description?: string;
  /** Explains the figure (how it is worked out) in a tooltip. */
  hint?: string;
  href?: string;
  icon?: IconSvgElement;
  label: string;
  /** Makes the chip a button, e.g. to filter the table below. */
  onClick?: () => void;
  /** Tints the KPI chip. Cards stay neutral. */
  tone?: StatusTone;
  /** A node is allowed so a chip can show a skeleton while loading. */
  value: ReactNode;
}

const CHIP_TONE: Record<StatusTone, string> = {
  danger: "bg-destructive/5 ring-destructive/25 [&_svg]:text-destructive",
  info: "bg-info/5 ring-info/25 [&_svg]:text-info-foreground",
  neutral: "ring-border",
  success: "bg-success/6 ring-success/30 [&_svg]:text-success-foreground",
  warning: "bg-warning/8 ring-warning/35 [&_svg]:text-warning-foreground",
};

/** A compact KPI chip for pages where a table's view tabs already show counts. */
export function StatChip({
  item,
  isLoading = false,
}: {
  item: StatItem;
  isLoading?: boolean;
}) {
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
      <span
        className="font-mono font-semibold tabular-nums"
        data-slot="stat-value"
      >
        {isLoading ? (
          <span
            aria-hidden="true"
            className="bg-muted inline-flex h-4 w-5 animate-pulse rounded-md"
            data-slot="skeleton"
          />
        ) : (
          item.value
        )}
      </span>
      {item.description ? (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {isLoading ? (
            <span
              aria-hidden="true"
              className="bg-muted inline-flex h-3 w-14 animate-pulse rounded-md"
              data-slot="skeleton"
            />
          ) : (
            item.description
          )}
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
  if (item.onClick) {
    return (
      <button
        aria-label={item.actionLabel}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 rounded-lg transition-colors outline-none focus-visible:ring-3"
        onClick={item.onClick}
        type="button"
      >
        {chip}
      </button>
    );
  }
  if (item.hint) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            // A button, so keyboard users can reach the hint too.
            <button
              className="focus-visible:ring-ring/50 cursor-help rounded-lg outline-none focus-visible:ring-3"
              type="button"
            />
          }
        >
          {chip}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{item.hint}</TooltipContent>
      </Tooltip>
    );
  }
  return chip;
}

/** The page's counts as one row of compact chips (swipeable on phones). */
export function StatsCards({
  className,
  items,
  isLoading,
}: {
  className?: string;
  items: StatItem[];
  isLoading?: boolean;
}) {
  // Phones: one swipeable row that bleeds to the screen edge, instead of a
  // stack of chips pushing the table down. Wider screens wrap.
  return (
    <div
      className={cn(
        "no-scrollbar flex gap-2 overflow-x-auto *:shrink-0 max-sm:-mx-2 max-sm:px-2 sm:flex-wrap",
        className
      )}
      data-slot="stat-chips"
    >
      {items.map((item) => (
        <StatChip isLoading={isLoading} item={item} key={item.label} />
      ))}
    </div>
  );
}
