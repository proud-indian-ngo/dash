import { describe, expect, it } from "bun:test";

import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";

import { dateField, numberField, selectField } from "../filter-fields";
import {
  countOptions,
  DATE_PRESETS,
  datePresetRule,
  getFieldRule,
  isQuickFilterQuery,
  matchDatePreset,
  selectRule,
  setFieldRule,
  summarizeRule,
} from "./quick-filter-model";

const city = selectField("city", "City", [
  { label: "Bangalore", value: "bangalore" },
  { label: "Mumbai", value: "mumbai" },
  { label: "Pune", value: "pune" },
]);
const total = numberField("total", "Total");
const expenseDate = dateField("expenseDate", "Expense date");
const fields = [city, total, expenseDate];

const rule = (path: string, operator: string, value: unknown) =>
  createFilterRule({ id: path, operator, path: [path], value });

describe("isQuickFilterQuery", () => {
  it("accepts one flat rule per known field", () => {
    const query = createFilterQuery([
      rule("city", "is", "mumbai"),
      rule("total", "gte", 100),
    ]);
    expect(isQuickFilterQuery(query, fields)).toBe(true);
  });

  it("rejects what only the advanced builder can show", () => {
    expect(
      isQuickFilterQuery(
        createFilterQuery([
          createFilterGroup({ id: "g", rules: [rule("city", "is", "pune")] }),
        ]),
        fields
      )
    ).toBe(false);
    expect(
      isQuickFilterQuery(
        createFilterQuery(
          [rule("city", "is", "pune"), rule("total", "gte", 1)],
          "or"
        ),
        fields
      )
    ).toBe(false);
    expect(
      isQuickFilterQuery(
        createFilterQuery([
          rule("city", "is", "pune"),
          rule("city", "is_not", "mumbai"),
        ]),
        fields
      )
    ).toBe(false);
    expect(
      isQuickFilterQuery(
        createFilterQuery([rule("unknown", "is", "x")]),
        fields
      )
    ).toBe(false);
  });
});

describe("setFieldRule", () => {
  it("adds, replaces in place, and removes a field's rule", () => {
    const start = createFilterQuery([rule("total", "gte", 5)]);
    const added = setFieldRule(start, "city", {
      operator: "is",
      value: "pune",
    });
    expect(
      added.rules.map((node) => getFieldRule(added, "city") === node)
    ).toEqual([false, true]);
    const replaced = setFieldRule(added, "total", {
      operator: "lte",
      value: 9,
    });
    expect(getFieldRule(replaced, "total")?.operator).toBe("lte");
    expect(replaced.rules[0]).toBe(getFieldRule(replaced, "total"));
    expect(setFieldRule(replaced, "city", null).rules).toHaveLength(1);
  });
});

describe("selectRule", () => {
  it("uses is for one value and is_any_of for several", () => {
    expect(selectRule(["pune"], false)).toEqual({
      operator: "is",
      value: "pune",
    });
    expect(selectRule(["pune", "mumbai"], false)).toEqual({
      operator: "is_any_of",
      value: ["pune", "mumbai"],
    });
    expect(selectRule(["pune", "mumbai"], true)?.operator).toBe("is_none_of");
    expect(selectRule([], false)).toBeNull();
  });
});

describe("date presets", () => {
  it("round-trips every preset", () => {
    for (const preset of DATE_PRESETS) {
      const { operator, value } = datePresetRule(preset);
      expect(matchDatePreset(rule("expenseDate", operator, value))).toBe(
        preset
      );
    }
  });

  it("stores ranges relative to today", () => {
    expect(datePresetRule({ days: 7, label: "Last 7 days" })).toEqual({
      operator: "between",
      value: [
        { relative: { offset: -6, unit: "day" } },
        { relative: { offset: 0, unit: "day" } },
      ],
    });
  });
});

describe("summarizeRule", () => {
  it("writes chip text", () => {
    expect(
      summarizeRule(city, rule("city", "is_any_of", ["mumbai", "pune"]))
    ).toBe("Mumbai, Pune");
    expect(
      summarizeRule(
        city,
        rule("city", "is_any_of", ["mumbai", "pune", "bangalore"])
      )
    ).toBe("Mumbai, Pune +1");
    expect(summarizeRule(city, rule("city", "is_not", "pune"))).toBe(
      "not Pune"
    );
    expect(summarizeRule(total, rule("total", "gte", 500))).toBe("≥ 500");
    const { operator, value } = datePresetRule(DATE_PRESETS[2]!);
    expect(
      summarizeRule(expenseDate, rule("expenseDate", operator, value))
    ).toBe("Last 30 days");
  });
});

describe("countOptions", () => {
  it("counts each row once per value, including list values", () => {
    const rows = [
      { city: "pune" },
      { city: "pune" },
      { city: ["mumbai", "mumbai"] },
    ];
    const counts = countOptions(
      rows,
      fields,
      (row, path) => row[path[0] as "city"]
    );
    expect(counts.get("city")?.get("pune")).toBe(2);
    expect(counts.get("city")?.get("mumbai")).toBe(1);
    expect(counts.has("total")).toBe(false);
  });
});
