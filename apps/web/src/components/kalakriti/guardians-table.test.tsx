import { describe, expect, it, mock } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";

import type { GuardianRosterItem } from "./guardians-table";
import {
  createGuardianFilterFields,
  getGuardianFilterValue,
} from "./kalakriti-filters";
interface CapturedTable {
  compactOnMobile?: boolean;
  columns: {
    id?: string;
    cell?: (props: { row: { original: GuardianRosterItem } }) => ReactNode;
    meta?: {
      compact?: string;
      headerTitle?: string;
      skeleton?: unknown;
    };
  }[];
  searchFn: (row: GuardianRosterItem, query: string) => boolean;
  filter: {
    fields: { id: string }[];
    getValue: (row: GuardianRosterItem, path: string[]) => unknown;
  };
}
let table: CapturedTable;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: CapturedTable) => {
    table = props;
    return null;
  },
}));
const { GuardiansTable } = await import("./guardians-table");
const guardian: GuardianRosterItem = {
  assignedCenters: [],
  id: "guardian-membership",
  humanId: "KALG-2026-0001",
  isExternal: true,
  snapshotName: "Guardian",
  snapshotEmail: null,
  snapshotPhone: null,
  state: "active",
};
describe("Guardian yearly IDs", () => {
  it("shows/searches Yearly ID and uses a dash rather than inventing a historical ID", () => {
    renderToStaticMarkup(
      <GuardiansTable
        data={[guardian]}
        isLoading={false}
        onArchive={() => undefined}
        onEdit={() => undefined}
        onView={() => undefined}
      />
    );
    const column = table.columns.find((item) => item.id === "humanId");
    expect(column?.meta?.headerTitle).toBe("Yearly ID");
    expect(column?.meta?.skeleton).toBeDefined();
    const markup = (row: GuardianRosterItem) =>
      renderToStaticMarkup(<>{column?.cell?.({ row: { original: row } })}</>);
    expect(markup(guardian)).toContain(guardian.humanId!);
    expect(markup({ ...guardian, humanId: null })).toContain("—");
    expect(table.searchFn(guardian, "kalg-2026-0001")).toBe(true);
  });
  it("filters yearly IDs and preserves missing-ID/status semantics", () => {
    expect(createGuardianFilterFields().map((field) => field.id)).toEqual([
      "humanId",
      "state",
    ]);
    const predicate = compileFilterQuery(
      createFilterQuery([
        createFilterRule({
          id: "yearly",
          path: ["humanId"],
          operator: "contains",
          value: "2026-0001",
        }),
      ]),
      getGuardianFilterValue
    );
    expect(predicate(guardian)).toBe(true);
    expect(predicate({ ...guardian, humanId: null })).toBe(false);
    expect(getGuardianFilterValue(guardian, ["state"])).toBe("active");
  });
  it("shows assigned Centers in their column and filters unassigned Guardians", () => {
    renderToStaticMarkup(
      <GuardiansTable
        data={[guardian]}
        isLoading={false}
        onArchive={() => undefined}
        onEdit={() => undefined}
        onView={() => undefined}
      />
    );
    const assigned = { ...guardian, assignedCenters: ["North Center"] };
    const name = table.columns.find(
      (item) => item.meta?.headerTitle === "Name"
    );
    const centers = table.columns.find((item) => item.id === "assignedCenters");
    expect(table.compactOnMobile).toBe(true);
    expect(name?.meta?.compact).toBe("primary");
    expect(centers?.meta?.compact).toBe("primary");
    expect(
      renderToStaticMarkup(<>{name?.cell?.({ row: { original: assigned } })}</>)
    ).toContain("Guardian");
    expect(
      renderToStaticMarkup(<>{name?.cell?.({ row: { original: assigned } })}</>)
    ).not.toContain("North Center");
    expect(
      renderToStaticMarkup(
        <>{centers?.cell?.({ row: { original: assigned } })}</>
      )
    ).toContain("North Center");
    expect(
      table.filter.fields.some((field) => field.id === "assignedCenterCount")
    ).toBe(true);
    expect(table.filter.getValue(guardian, ["assignedCenterCount"])).toBe(0);
    expect(table.filter.getValue(assigned, ["assignedCenterCount"])).toBe(1);
    expect(table.searchFn(assigned, "north center")).toBe(true);
  });
});
