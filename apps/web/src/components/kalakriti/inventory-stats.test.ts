import { describe, expect, it } from "bun:test";

import { countInventory } from "./inventory-stats";
import type { InventoryItem } from "./inventory-types";

function item(
  id: string,
  quantity: number,
  unitPricePaise: number | null,
  archivedAt: number | null = null
): InventoryItem {
  return { id, quantity, unitPricePaise, archivedAt } as InventoryItem;
}

describe("inventory summary", () => {
  it("counts active zero-stock items and reports value only for priced items", () => {
    expect(
      countInventory([
        item("priced", 3, 2500),
        item("unpriced", 5, null),
        item("empty", 0, 500),
        item("archived", 0, 1000, 100),
      ])
    ).toEqual({ active: 3, outOfStock: 1, priced: 2, valuePaise: 7500 });
  });
});
