import type { VendorDataPoint } from "@/lib/stats";

import { ChartCard, RankedBars } from "./chart-card";

export function TopVendorsChart({ data }: { data: VendorDataPoint[] }) {
  return (
    <ChartCard empty={data.length === 0} title="Top vendors">
      <RankedBars
        countNoun="payment"
        items={data.map((d) => ({ ...d, key: d.name }))}
      />
    </ChartCard>
  );
}
