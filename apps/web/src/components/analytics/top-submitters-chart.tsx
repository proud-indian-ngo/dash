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
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/form-schemas";
import type { SubmitterDataPoint } from "@/lib/stats";

const chartConfig = {
  amount: {
    label: "Amount",
    color: "var(--color-brand)",
  },
} satisfies ChartConfig;

export function TopSubmittersChart({ data }: { data: SubmitterDataPoint[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Request Submitters</CardTitle>
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
        <CardTitle className="text-sm">Request Submitters</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="w-full"
          config={chartConfig}
          style={{ height: `${Math.max(data.length * 40, 200)}px` }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <XAxis
              axisLine={false}
              fontSize={12}
              tickFormatter={(v: number) => formatINR(v)}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="name"
              fontSize={12}
              tickLine={false}
              type="category"
              width={120}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, props) =>
                    `${formatINR(Number(value))} (${(props as { payload: SubmitterDataPoint }).payload.count} requests)`
                  }
                />
              }
            />
            <Bar
              dataKey="amount"
              fill="var(--color-amount)"
              maxBarSize={32}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
