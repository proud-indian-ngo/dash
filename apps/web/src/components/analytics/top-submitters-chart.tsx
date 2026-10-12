import type { SubmitterDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function TopSubmittersChart({ data }: { data: SubmitterDataPoint[] }) {
  return (
    <ChartCard
      description="Reimbursements and advance payments"
      empty={data.length === 0}
      title="Top submitters"
    >
      <RankedBars
        countNoun="request"
        items={data.map((d) => ({ ...d, key: d.email || d.name }))}
      />
    </ChartCard>
  );
}
