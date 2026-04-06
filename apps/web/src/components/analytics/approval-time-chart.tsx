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
import type { ApprovalTimeBucket } from "@/lib/stats";

const chartConfig = {
  count: {
    label: "Requests",
    color: "var(--color-brand)",
  },
} satisfies ChartConfig;

export function ApprovalTimeChart({ data }: { data: ApprovalTimeBucket[] }) {
  const hasData = data.some((b) => b.count > 0);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Review Time Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
          No approved or rejected requests for this period
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Review Time Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-[280px] w-full" config={chartConfig}>
          <BarChart data={data} margin={{ bottom: 4, top: 8 }}>
            <XAxis
              axisLine={false}
              dataKey="label"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              fontSize={12}
              tickLine={false}
              width={30}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    `${value} ${Number(value) === 1 ? "request" : "requests"}`
                  }
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              maxBarSize={48}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
