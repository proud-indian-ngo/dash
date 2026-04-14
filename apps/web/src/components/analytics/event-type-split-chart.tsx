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
import { Cell, Pie, PieChart } from "recharts";

export interface EventTypeSplitDataPoint {
  count: number;
  type: string;
}

const COLORS = ["var(--color-brand)", "var(--color-accent-foreground)"];

const chartConfig = {
  count: {
    label: "Events",
  },
} satisfies ChartConfig;

export function EventTypeSplitChart({
  data,
}: {
  data: EventTypeSplitDataPoint[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event Type Split</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
          No event data yet.
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Event Type Split</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="mx-auto h-[250px] w-full"
          config={chartConfig}
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, props) => {
                    const p = (props as { payload: EventTypeSplitDataPoint })
                      .payload;
                    const pct =
                      total > 0 ? ((p.count / total) * 100).toFixed(0) : "0";
                    return `${p.type}: ${value} (${pct}%)`;
                  }}
                />
              }
            />
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey="count"
              innerRadius={60}
              nameKey="type"
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((_, index) => (
                <Cell
                  fill={COLORS[index % COLORS.length]}
                  key={`cell-${
                    // biome-ignore lint/suspicious/noArrayIndexKey: static chart data
                    index
                  }`}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-2 flex justify-center gap-4">
          {data.map((d, i) => (
            <div className="flex items-center gap-1.5 text-xs" key={d.type}>
              <div
                className="size-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="capitalize">{d.type}</span>
              <span className="text-muted-foreground">({d.count})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
