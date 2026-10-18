import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";

import type { StatusTone } from "@/components/shared/status-badge";
import { StatChip } from "@/components/stats/stats-cards";

export interface SummaryMetric {
  label: string;
  value: number | string | undefined;
  /** Filters the table below; the chip becomes a button. */
  onClick?: () => void;
  actionLabel?: string;
  description?: string;
  /** Tints the chip, e.g. "warning" for a gap that needs attention. */
  tone?: StatusTone;
}

// Gap counts ("Without Guardians", "Competitions without Judges", "Below
// minimum", "Out of stock") are tinted when non-zero so the numbers that need
// action stand out. Waiting counts ("Awaiting lunch") stay neutral.
const GAP_LABEL = /\b(without|unassigned|below minimum|out of stock|gaps?)\b/i;

/** True for a non-zero gap count that needs someone's attention. */
export function isGapMetric(label: string, value: unknown) {
  return typeof value === "number" && value > 0 && GAP_LABEL.test(label);
}

function toneFor(metric: SummaryMetric): StatusTone | undefined {
  if (metric.tone) return metric.tone;
  return isGapMetric(metric.label, metric.value) ? "warning" : undefined;
}

/**
 * Kalakriti page counts as the shared stat chips used on every list page.
 * A chip with `onClick` filters the table; undefined values show a skeleton.
 */
export function SummaryMetricCards({
  metrics,
  label,
}: {
  metrics: readonly SummaryMetric[];
  label?: string;
}) {
  // Phones: one swipeable row to the screen edge, as in `StatsCards`, so the
  // chips don't stack up and push the table below the fold. Wider screens wrap.
  return (
    <div
      aria-label={label}
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto *:shrink-0 max-sm:-mx-2 max-sm:px-2 sm:flex-wrap [&::-webkit-scrollbar]:hidden"
      role="group"
    >
      {metrics.map((metric) => (
        <StatChip
          item={{
            actionLabel: metric.onClick
              ? (metric.actionLabel ?? `Show ${metric.label.toLowerCase()}`)
              : undefined,
            description: metric.description,
            label: metric.label,
            onClick: metric.onClick,
            tone: toneFor(metric),
            value:
              metric.value === undefined ? (
                <Skeleton className="h-4 w-8" />
              ) : typeof metric.value === "number" ? (
                metric.value.toLocaleString("en-IN")
              ) : (
                metric.value
              ),
          }}
          key={metric.label}
        />
      ))}
    </div>
  );
}
