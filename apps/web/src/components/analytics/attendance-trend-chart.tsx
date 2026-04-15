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
import { Line, LineChart, XAxis, YAxis } from "recharts";

export interface AttendanceTrendDataPoint {
  date: string;
  present: number;
  rate: number;
  total: number;
}

const chartConfig = {
  rate: {
    label: "Attendance Rate",
    color: "var(--color-brand)",
  },
} satisfies ChartConfig;

export function AttendanceTrendChart({
  data,
}: {
  data: AttendanceTrendDataPoint[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Attendance Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
          No class attendance data yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Attendance Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-[300px] w-full" config={chartConfig}>
          <LineChart data={data} margin={{ left: 10, right: 10 }}>
            <XAxis
              axisLine={false}
              dataKey="date"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={[0, 100]}
              fontSize={12}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, props) => {
                    const p = (props as { payload: AttendanceTrendDataPoint })
                      .payload;
                    return `${Number(value).toFixed(0)}% (${p.present}/${p.total})`;
                  }}
                />
              }
            />
            <Line
              dataKey="rate"
              dot={data.length <= 12}
              stroke="var(--color-rate)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
