import { formatPaise } from "@pi-dash/shared/money";
import type { ReactNode } from "react";

/**
 * One analytics panel: a sentence-case title, an optional one-line note, and
 * its chart or list. Empty periods say so in the same frame.
 */
export function ChartCard({
  children,
  description,
  empty,
  emptyMessage = "Nothing in this period.",
  title,
}: {
  children: ReactNode;
  description?: string;
  empty?: boolean;
  emptyMessage?: string;
  title: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-xl border p-4"
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
      <div className="mt-4 flex-1">
        {empty ? (
          <p className="text-muted-foreground flex h-full min-h-40 items-center justify-center text-sm">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export interface RankedItem {
  amount: number;
  count: number;
  key: string;
  name: string;
}

/**
 * A ranked list of names with a bar for each amount, largest first. Reads
 * better than a bar chart for long names and works on a phone.
 */
export function RankedBars({
  countNoun,
  items,
  limit = 8,
}: {
  /** "request", "payment": shown as "3 requests" beside the amount. */
  countNoun: string;
  items: readonly RankedItem[];
  limit?: number;
}) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount).slice(0, limit);
  const max = sorted[0]?.amount ?? 0;
  return (
    <ol className="flex flex-col gap-2.5">
      {sorted.map((item) => (
        <li className="flex flex-col gap-1" key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate" title={item.name}>
              {item.name}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{formatPaise(item.amount)}</span>
              <span className="text-muted-foreground text-xs">
                {" "}
                · {item.count} {item.count === 1 ? countNoun : `${countNoun}s`}
              </span>
            </span>
          </div>
          <div aria-hidden="true" className="bg-muted h-1.5 rounded-full">
            <div
              className="bg-chart-1 h-full rounded-full"
              style={{
                width: `${max > 0 ? Math.max(2, (item.amount / max) * 100) : 0}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
