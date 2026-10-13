import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@pi-dash/design-system/components/ui/chart";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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

export function SubmissionTrendsChart({ data }: { data: TrendDataPoint[] }) {
  const stableTickFormatter0 = useEventCallback((v: number) => formatPaise(v));
  const stableFormatter1 = useEventCallback((value: unknown, name: unknown) =>
    name === "amount" ? formatPaise(Number(value)) : String(value)
  );
  return (
    <ChartCard
      empty={data.length === 0}
      emptyMessage="Nothing in this period."
      title="Submission trends"
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
            axisLine={false}
            fontSize={12}
            orientation="left"
            tickLine={false}
            yAxisId="count"
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            fontSize={12}
            orientation="right"
            tickFormatter={stableTickFormatter0}
            tickLine={false}
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
