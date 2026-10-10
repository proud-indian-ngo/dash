import { describe, expect, it } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { getDataTableViews, selectDataTableView } from "./data-table-view-tabs";
import { selectField } from "./filter-fields";

const statusField = selectField("status", "Status", [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
]);

const cityRule = createFilterRule({
  id: "city",
  operator: "is",
  path: ["city"],
  value: "Mumbai",
});

describe("getDataTableViews", () => {
  it("counts every row per option, including empty options", () => {
    const rows = [
      { status: "pending" },
      { status: "pending" },
      { status: "x" },
    ];
    expect(
      getDataTableViews({
        data: rows,
        field: statusField,
        getValue: (row, path) => row[path[0] as "status"],
      })
    ).toEqual([
      { count: 2, label: "Pending", value: "pending" },
      { count: 0, label: "Approved", value: "approved" },
    ]);
  });
});

describe("selectDataTableView", () => {
  it("adds an is rule and keeps other rules", () => {
    const next = selectDataTableView(
      createFilterQuery([cityRule]),
      "status",
      "pending"
    );
    expect(next.rules).toHaveLength(2);
    expect(next.rules[1]).toMatchObject({
      operator: "is",
      path: ["status"],
      value: "pending",
    });
  });

  it("replaces an existing rule on the same field", () => {
    const first = selectDataTableView(createFilterQuery(), "status", "pending");
    const next = selectDataTableView(first, "status", "approved");
    expect(next.rules).toHaveLength(1);
    expect(next.rules[0]).toMatchObject({ value: "approved" });
  });

  it("removes the field's rule for the All view", () => {
    const first = selectDataTableView(
      createFilterQuery([cityRule]),
      "status",
      "pending"
    );
    expect(selectDataTableView(first, "status", null).rules).toEqual([
      cityRule,
    ]);
  });
});
