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
import { formatINR } from "@/lib/form-schemas";
import type { CategoryDataPoint } from "@/lib/stats";

const COLORS = [
  "var(--color-brand)",
  "var(--color-emerald-500)",
  "var(--color-amber-500)",
  "var(--color-red-500)",
  "var(--color-violet-500)",
  "var(--color-blue-500)",
  "var(--color-pink-500)",
  "var(--color-orange-500)",
];

export function CategoryBreakdownChart({
  data,
}: {
  data: CategoryDataPoint[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spending by Category</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
          No data for this period
        </CardContent>
      </Card>
    );
  }

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.name,
      { label: d.name, color: COLORS[i % COLORS.length] },
    ])
  ) satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="mx-auto h-[300px] w-full"
          config={chartConfig}
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatINR(Number(value))}
                />
              }
            />
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey="amount"
              innerRadius={60}
              nameKey="name"
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {data.map((entry, index) => (
            <div className="flex items-center gap-1.5 text-xs" key={entry.name}>
              <span
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: COLORS[index % COLORS.length],
                }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="font-medium">{formatINR(entry.amount)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
