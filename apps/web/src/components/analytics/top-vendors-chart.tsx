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
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/form-schemas";
import type { VendorDataPoint } from "@/lib/stats";

const chartConfig = {
  amount: {
    color: "var(--color-brand)",
    label: "Amount",
  },
} satisfies ChartConfig;

export function TopVendorsChart({ data }: { data: VendorDataPoint[] }) {
  const stableTickFormatter0 = useEventCallback((v: number) => formatINR(v));
  const stableFormatter1 = useEventCallback(
    (value: unknown, _name: unknown, props: unknown) =>
      `${formatINR(Number(value))} (${(props as { payload: VendorDataPoint }).payload.count} payments)`
  );
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top Vendors</CardTitle>
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
        <CardTitle className="text-sm">Top Vendors</CardTitle>
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
              tickFormatter={stableTickFormatter0}
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
              content={<ChartTooltipContent formatter={stableFormatter1} />}
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
