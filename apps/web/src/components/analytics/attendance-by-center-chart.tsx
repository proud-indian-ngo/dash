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

export interface AttendanceByCenterDataPoint {
  center: string;
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

export function AttendanceByCenterChart({
  data,
}: {
  data: AttendanceByCenterDataPoint[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Attendance by Center</CardTitle>
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
        <CardTitle className="text-sm">Attendance by Center</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="w-full"
          config={chartConfig}
          style={{ height: `${Math.max(data.length * 50, 200)}px` }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <XAxis
              axisLine={false}
              domain={[0, 100]}
              fontSize={12}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="center"
              fontSize={12}
              tickLine={false}
              type="category"
              width={120}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, props) => {
                    const p = (
                      props as { payload: AttendanceByCenterDataPoint }
                    ).payload;
                    return `${Number(value).toFixed(0)}% (${p.present}/${p.total})`;
                  }}
                />
              }
            />
            <Bar
              dataKey="rate"
              fill="var(--color-rate)"
              maxBarSize={32}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
