import { useEffect, useMemo, useState } from "react";

import { formatINR } from "@/lib/form-schemas";

import type { InventoryItem } from "./inventory-types";
import { SummaryMetricCards } from "./summary-metric-cards";

export function countInventory(items: readonly InventoryItem[]) {
  let active = 0;
  let outOfStock = 0;
  let priced = 0;
  let valuePaise = 0;
  for (const item of items) {
    if (item.archivedAt !== null) continue;
    active += 1;
    outOfStock += Number(item.quantity === 0);
    if (item.unitPricePaise !== null) {
      priced += 1;
      valuePaise += item.quantity * item.unitPricePaise;
    }
  }
  return { active, outOfStock, priced, valuePaise };
}

export function InventoryStats({
  items,
  complete,
  scopeKey,
  onReviewOutOfStock,
}: {
  items: readonly InventoryItem[];
  complete: boolean;
  scopeKey: string;
  onReviewOutOfStock: () => void;
}) {
  const current = useMemo(
    () => ({ scopeKey, counts: countInventory(items) }),
    [items, scopeKey]
  );
  const [previous, setPrevious] = useState<typeof current>();
  useEffect(() => {
    if (complete) setPrevious(current);
  }, [complete, current]);
  const counts = complete
    ? current.counts
    : previous?.scopeKey === scopeKey
      ? previous.counts
      : undefined;
  return (
    <section
      aria-labelledby="inventory-stats-title"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-sm font-semibold" id="inventory-stats-title">
          Stock in scope
        </h2>
        <p className="text-muted-foreground text-xs">All authorized items</p>
      </div>
      {!complete && counts ? (
        <p className="text-muted-foreground text-xs" role="status">
          Showing the last complete stock snapshot while updating.
        </p>
      ) : null}
      <SummaryMetricCards
        label="Inventory counts"
        metrics={[
          { label: "Active items", value: counts?.active },
          {
            label: "Out of stock",
            value: counts?.outOfStock,
            onClick: complete ? onReviewOutOfStock : undefined,
            actionLabel: "Review out-of-stock items",
          },
          {
            label: "Estimated stock value",
            value: counts ? formatINR(counts.valuePaise / 100) : undefined,
            description: counts
              ? `Prices entered for ${counts.priced} of ${counts.active} active items`
              : undefined,
          },
        ]}
      />
    </section>
  );
}
