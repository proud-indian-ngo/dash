import type { ProgrammeDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function ProgrammeSpendingChart({
  data,
}: {
  data: ProgrammeDataPoint[];
}) {
  return (
    <ChartCard
      description="By the programme of each expense's event. Expenses with no event are shown as one bar."
      empty={data.length === 0}
      title="Spending by programme"
    >
      <RankedBars
        countNoun="expense"
        items={data.map((d) => ({ ...d, key: d.name }))}
      />
    </ChartCard>
  );
}
