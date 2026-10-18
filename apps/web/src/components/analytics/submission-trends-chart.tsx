import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@pi-dash/design-system/components/ui/chart";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { formatPaise } from "@pi-dash/shared/money";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendDataPoint } from "@/lib/stats";

import { ChartCard } from "./chart-card";

const chartConfig = {
  amount: {
    color: "var(--chart-5)",
    label: "Amount",
  },
  count: {
    color: "var(--chart-1)",
    label: "Requests",
  },
} satisfies ChartConfig;

/** Axis ticks in lakh and crore shorthand (₹26K, ₹1.5L) so they fit a phone. */
const compactRupees = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

export function SubmissionTrendsChart({ data }: { data: TrendDataPoint[] }) {
  const stableTickFormatter0 = useEventCallback((v: number) =>
    compactRupees.format(v / 100)
  );
  // A custom formatter replaces the whole tooltip row, so it names the series.
  const stableFormatter1 = useEventCallback((value: unknown, name: unknown) => {
    const key = name === "amount" ? "amount" : "count";
    return (
      <>
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-[2px]",
            key === "amount" ? "bg-(--color-amount)" : "bg-(--color-count)"
          )}
        />
        <span className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">
            {chartConfig[key].label}
          </span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {key === "amount" ? formatPaise(Number(value)) : String(value)}
          </span>
        </span>
      </>
    );
  });
  return (
    <ChartCard
      empty={data.length === 0}
      emptyMessage="Nothing in this period."
      title="Spending over time"
    >
      <ChartContainer className="h-[300px] w-full" config={chartConfig}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="period"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            fontSize={12}
            orientation="left"
            tickLine={false}
            width={32}
            yAxisId="count"
          />
          <YAxis
            axisLine={false}
            fontSize={12}
            orientation="right"
            tickFormatter={stableTickFormatter0}
            tickLine={false}
            width={52}
            yAxisId="amount"
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={stableFormatter1} />}
          />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            maxBarSize={40}
            radius={[4, 4, 0, 0]}
            yAxisId="count"
          />
          <Line
            dataKey="amount"
            dot={false}
            stroke="var(--color-amount)"
            strokeWidth={2}
            yAxisId="amount"
          />
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  );
}
