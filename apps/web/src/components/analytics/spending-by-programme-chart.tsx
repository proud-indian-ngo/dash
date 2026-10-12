import type { ProgrammeDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function ProgrammeSpendingChart({
  data,
}: {
  data: ProgrammeDataPoint[];
}) {
  return (
    <ChartCard empty={data.length === 0} title="Spending by programme">
      <RankedBars
        countNoun="request"
        items={data.map((d) => ({ ...d, key: d.name }))}
      />
    </ChartCard>
  );
}
