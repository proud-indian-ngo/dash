import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@pi-dash/design-system/components/ui/chart";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import type { ApprovalTimeBucket } from "@/lib/stats";

import { ChartCard } from "./chart-card";

const chartConfig = {
  count: {
    color: "var(--chart-1)",
    label: "Requests",
  },
} satisfies ChartConfig;

export function ApprovalTimeChart({ data }: { data: ApprovalTimeBucket[] }) {
  const hasData = data.some((b) => b.count > 0);
  const stableFormatter0 = useEventCallback(
    (value: unknown) =>
      `${value} ${Number(value) === 1 ? "request" : "requests"}`
  );

  return (
    <ChartCard
      description="From submission to approval or rejection"
      empty={!hasData}
      emptyMessage="No approved or rejected requests in this period."
      title="Time to review"
    >
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
            content={<ChartTooltipContent formatter={stableFormatter0} />}
          />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            maxBarSize={48}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
