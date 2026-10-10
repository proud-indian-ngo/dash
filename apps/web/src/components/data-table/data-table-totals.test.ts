import { describe, expect, it } from "bun:test";

import type { DataGridRow } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";

import { sumColumns } from "./data-table-totals";

const row = (values: Record<string, unknown>) =>
  ({ getValue: (id: string) => values[id] }) as unknown as DataGridRow<object>;

describe("sumColumns", () => {
  it("sums numbers and numeric strings per column", () => {
    const sums = sumColumns(
      [row({ total: 100, fee: "2.5" }), row({ total: "50.25", fee: 1 })],
      ["total", "fee"]
    );
    expect(sums.get("total")).toBe(150.25);
    expect(sums.get("fee")).toBe(3.5);
  });

  it("skips values that are not numbers", () => {
    const sums = sumColumns(
      [row({ total: 10 }), row({ total: undefined }), row({ total: "n/a" })],
      ["total"]
    );
    expect(sums.get("total")).toBe(10);
  });
});
