import { describe, expect, it } from "bun:test";

import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { isValidElement, type ReactElement } from "react";

import { applyColumnKinds, DATA_FONT_CLASS } from "./column-kinds";

interface Row {
  amount: number;
}

function Header(_props: { icon?: unknown; title: string }) {
  return null;
}

const renderHeader = (column: DataGridColumnDef<Row>) =>
  (column.header as (context: never) => ReactElement)({} as never);

describe("applyColumnKinds", () => {
  it("leaves columns without a kind untouched", () => {
    const column: DataGridColumnDef<Row> = { id: "plain" };
    expect(applyColumnKinds([column])[0]).toBe(column);
  });

  it("sets the data font on number columns and keeps existing classes", () => {
    const [column] = applyColumnKinds<Row>([
      { id: "amount", meta: { cellClassName: "text-end", kind: "amount" } },
    ]);
    expect(column?.meta?.cellClassName).toBe(`${DATA_FONT_CLASS} text-end`);
  });

  it("keeps text columns in the UI font", () => {
    const [column] = applyColumnKinds<Row>([
      { id: "title", meta: { kind: "text" } },
    ]);
    expect(column?.meta?.cellClassName).toBe("");
  });

  it("adds an icon to the header unless one is set", () => {
    const [withIcon, withOwn] = applyColumnKinds<Row>([
      {
        header: () => <Header title="Total" />,
        id: "a",
        meta: { kind: "amount" },
      },
      {
        header: () => <Header icon="own" title="Date" />,
        id: "b",
        meta: { kind: "date" },
      },
    ]);
    const added = renderHeader(withIcon as DataGridColumnDef<Row>);
    const kept = renderHeader(withOwn as DataGridColumnDef<Row>);
    expect(isValidElement(added)).toBe(true);
    expect((added.props as { icon?: unknown }).icon).toBeDefined();
    expect((kept.props as { icon?: unknown }).icon).toBe("own");
  });
});
