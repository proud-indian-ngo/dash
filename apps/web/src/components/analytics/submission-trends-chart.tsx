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
  count: {
    label: "Requests",
    color: "var(--color-brand)",
  },
  amount: {
    label: "Amount",
    color: "var(--color-emerald-500)",
  },
} satisfies ChartConfig;

export function SubmissionTrendsChart({ data }: { data: TrendDataPoint[] }) {
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
              tickFormatter={(v: number) => formatINR(v)}
              tickLine={false}
              yAxisId="amount"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) =>
                    name === "amount" ? formatINR(Number(value)) : String(value)
                  }
                />
              }
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
