import { describe, expect, it } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import {
  activeDataTableTab,
  type DataTableAttentionView,
  getDataTableViews,
  isAttentionViewActive,
  selectDataTableTab,
  selectDataTableView,
  visibleAttentionViews,
} from "./data-table-view-tabs";
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

const unallocated: DataTableAttentionView = {
  count: 3,
  id: "to-clear",
  label: "Unallocated",
  rule: { path: "toClear", value: "charged-to-unallocated" },
};
const missingProof: DataTableAttentionView = {
  count: 0,
  id: "missing-payment-proof",
  label: "Missing payment proof",
  rule: { path: "paymentProof", value: "missing" },
};
const attention = [unallocated, missingProof];

describe("attention views", () => {
  it("replaces the whole query with the view's rule, as the old shortcut did", () => {
    const withStatus = selectDataTableView(
      createFilterQuery([cityRule]),
      "status",
      "pending"
    );
    const next = selectDataTableTab(
      withStatus,
      "status",
      attention,
      "attention:to-clear"
    );
    expect(next.rules).toHaveLength(1);
    expect(next.rules[0]).toMatchObject({
      id: "to-clear",
      operator: "is",
      path: ["toClear"],
      value: "charged-to-unallocated",
    });
    expect(isAttentionViewActive(next, unallocated)).toBe(true);
    expect(isAttentionViewActive(next, missingProof)).toBe(false);
  });

  it("selects the attention tab, not All, while its rule is the filter", () => {
    const query = selectDataTableTab(
      createFilterQuery(),
      "status",
      attention,
      "attention:to-clear"
    );
    expect(activeDataTableTab(query, "status", attention)).toBe(
      "attention:to-clear"
    );
    expect(activeDataTableTab(createFilterQuery(), "status", attention)).toBe(
      "__all__"
    );
  });

  it("is active from a shared link holding the same rule", () => {
    const shared = createFilterQuery([
      createFilterRule({
        id: "missing-payment-proof",
        operator: "is",
        path: ["paymentProof"],
        value: "missing",
      }),
    ]);
    expect(isAttentionViewActive(shared, missingProof)).toBe(true);
    expect(
      isAttentionViewActive(
        createFilterQuery([
          createFilterRule({
            id: "x",
            negated: true,
            operator: "is",
            path: ["paymentProof"],
            value: "missing",
          }),
        ]),
        missingProof
      )
    ).toBe(false);
  });

  it("a status tab clears the attention view and keeps other filters", () => {
    const query = createFilterQuery([
      cityRule,
      createFilterRule({
        id: "to-clear",
        operator: "is",
        path: ["toClear"],
        value: "charged-to-unallocated",
      }),
    ]);
    const next = selectDataTableTab(query, "status", attention, "approved");
    expect(next.rules).toHaveLength(2);
    expect(next.rules[0]).toEqual(cityRule);
    expect(next.rules[1]).toMatchObject({
      path: ["status"],
      value: "approved",
    });
    expect(activeDataTableTab(next, "status", attention)).toBe("approved");
  });

  it("All clears both the status and the attention view", () => {
    const query = selectDataTableTab(
      createFilterQuery(),
      "status",
      attention,
      "attention:to-clear"
    );
    expect(
      selectDataTableTab(query, "status", attention, "__all__").rules
    ).toEqual([]);
  });

  it("shows the status tab when a status rule sits beside the attention rule", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "to-clear",
        operator: "is",
        path: ["toClear"],
        value: "charged-to-unallocated",
      }),
      createFilterRule({
        id: "s",
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
    ]);
    expect(activeDataTableTab(query, "status", attention)).toBe("pending");
  });

  it("hides empty views unless they are the active filter", () => {
    expect(visibleAttentionViews(createFilterQuery(), attention)).toEqual([
      unallocated,
    ]);
    const active = selectDataTableTab(
      createFilterQuery(),
      "status",
      attention,
      "attention:missing-payment-proof"
    );
    expect(visibleAttentionViews(active, attention)).toEqual(attention);
  });
});
