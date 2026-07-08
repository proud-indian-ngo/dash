import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@pi-dash/design-system/components/ui/chart";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR } from "@/lib/form-schemas";
import type { TrendDataPoint } from "@/lib/stats";

const chartConfig = {
  amount: {
    color: "var(--color-emerald-500)",
    label: "Amount",
  },
  count: {
    color: "var(--color-brand)",
    label: "Requests",
  },
} satisfies ChartConfig;

export function SubmissionTrendsChart({ data }: { data: TrendDataPoint[] }) {
  const stableTickFormatter0 = useEventCallback((v: number) => formatINR(v));
  const stableFormatter1 = useEventCallback((value: unknown, name: unknown) =>
    name === "amount" ? formatINR(Number(value)) : String(value)
  );
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Submission Trends</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
          No data for this period
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Submission Trends</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
