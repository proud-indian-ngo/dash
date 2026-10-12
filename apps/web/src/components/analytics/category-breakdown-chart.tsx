import type { CategoryDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function CategoryBreakdownChart({
  data,
}: {
  data: CategoryDataPoint[];
}) {
  return (
    <ChartCard empty={data.length === 0} title="Spending by category">
      <RankedBars
        countNoun="line item"
        items={data.map((d) => ({ ...d, key: d.name }))}
      />
    </ChartCard>
  );
}
