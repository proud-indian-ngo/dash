import type { EventDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function EventSpendingChart({ data }: { data: EventDataPoint[] }) {
  return (
    <ChartCard empty={data.length === 0} title="Spending by event">
      <RankedBars
        countNoun="expense"
        items={data.map((d) => ({ ...d, key: d.eventId }))}
      />
    </ChartCard>
  );
}
