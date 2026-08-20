import {
  createFilterGroup,
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { describe, expect, it } from "vitest";
import {
  compileFilterQuery,
  readSelectEquality,
  removeFilterPath,
} from "./compile-filter-query";

interface Row {
  amount: number;
  city: string | null;
  expenseDate: string | null;
  status: string;
  tags: string[];
  title: string;
}

const rows: Row[] = [
  {
    amount: 100,
    city: "bangalore",
    expenseDate: "2026-08-19",
    status: "pending",
    tags: ["food"],
    title: "Taxi",
  },
  {
    amount: 250,
    city: "mumbai",
    expenseDate: "2026-08-10",
    status: "approved",
    tags: ["food", "travel"],
    title: "Hotel stay",
  },
  {
    amount: 50,
    city: null,
    expenseDate: null,
    status: "rejected",
    tags: [],
    title: "Snacks",
  },
];

function getValue(row: Row, path: string[]): unknown {
  const [key] = path;
  if (key === "amount") {
    return row.amount;
  }
  if (key === "city") {
    return row.city;
  }
  if (key === "expenseDate") {
    return row.expenseDate;
  }
  if (key === "status") {
    return row.status;
  }
  if (key === "tags") {
    return row.tags;
  }
  if (key === "title") {
    return row.title;
  }
}

function filterRows(
  query: ReturnType<typeof createFilterQuery>,
  now = new Date("2026-08-19T12:00:00Z")
): Row[] {
  return rows.filter(compileFilterQuery(query, getValue, now));
}

describe("compileFilterQuery", () => {
  it("matches every row when the query is empty", () => {
    expect(filterRows(createFilterQuery())).toHaveLength(3);
  });

  it("matches a select is rule", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
    ]);
    expect(filterRows(query).map((row) => row.status)).toEqual(["pending"]);
  });

  it("skips incomplete rules instead of matching nothing", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "",
        path: ["status"],
      }),
    ]);
    expect(filterRows(query)).toHaveLength(3);
  });

  it("skips rules that still need a value", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
      }),
    ]);
    expect(filterRows(query)).toHaveLength(3);
  });

  it("honors negated rules", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        negated: true,
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
    ]);
    expect(filterRows(query).map((row) => row.status)).toEqual([
      "approved",
      "rejected",
    ]);
  });

  it("combines AND groups", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
        value: "approved",
      }),
      createFilterRule({
        id: "r2",
        operator: "is",
        path: ["city"],
        value: "mumbai",
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Hotel stay"]);
  });

  it("keeps nested OR groups instead of flattening them to AND", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
        value: "rejected",
      }),
      createFilterGroup({
        combinator: "or",
        id: "g1",
        rules: [
          createFilterRule({
            id: "r2",
            operator: "is",
            path: ["city"],
            value: "mumbai",
          }),
          createFilterRule({
            id: "r3",
            operator: "empty",
            path: ["city"],
          }),
        ],
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Snacks"]);
  });

  it("matches an OR of two statuses", () => {
    const query = createFilterQuery(
      [
        createFilterRule({
          id: "r1",
          operator: "is",
          path: ["status"],
          value: "pending",
        }),
        createFilterRule({
          id: "r2",
          operator: "is",
          path: ["status"],
          value: "rejected",
        }),
      ],
      "or"
    );
    expect(filterRows(query).map((row) => row.status)).toEqual([
      "pending",
      "rejected",
    ]);
  });

  it("matches text contains case-insensitively", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "contains",
        path: ["title"],
        value: "hotel",
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Hotel stay"]);
  });

  it("matches number between", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "between",
        path: ["amount"],
        value: [80, 120],
      }),
    ]);
    expect(filterRows(query).map((row) => row.amount)).toEqual([100]);
  });

  it("matches is_any_of", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is_any_of",
        path: ["status"],
        value: ["pending", "rejected"],
      }),
    ]);
    expect(filterRows(query).map((row) => row.status)).toEqual([
      "pending",
      "rejected",
    ]);
  });

  it("matches has_all_of on arrays", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "has_all_of",
        path: ["tags"],
        value: ["food", "travel"],
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Hotel stay"]);
  });

  it("matches an absolute date is rule", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["expenseDate"],
        value: { date: "2026-08-19" },
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Taxi"]);
  });

  it("resolves relative date tokens at read time", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["expenseDate"],
        value: { relative: { offset: 0, unit: "day" } },
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Taxi"]);
  });

  it("matches empty dates", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "empty",
        path: ["expenseDate"],
      }),
    ]);
    expect(filterRows(query).map((row) => row.title)).toEqual(["Snacks"]);
  });
});

describe("readSelectEquality", () => {
  it("returns the first complete is rule for a path", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
      createFilterRule({
        id: "r2",
        operator: "is",
        path: ["city"],
        value: "mumbai",
      }),
    ]);
    expect(readSelectEquality(query, "status")).toBe("pending");
    expect(readSelectEquality(query, "city")).toBe("mumbai");
  });

  it("ignores incomplete, negated, and non-is rules", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
      }),
      createFilterRule({
        id: "r2",
        negated: true,
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
      createFilterRule({
        id: "r3",
        operator: "is_not",
        path: ["status"],
        value: "approved",
      }),
    ]);
    expect(readSelectEquality(query, "status")).toBeUndefined();
  });

  it("returns undefined for an empty query", () => {
    expect(readSelectEquality(createFilterQuery(), "status")).toBeUndefined();
  });
});

describe("removeFilterPath", () => {
  it("drops matching rules and keeps others", () => {
    const query = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["domain"],
        value: "entries",
      }),
      createFilterRule({
        id: "r2",
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
    ]);
    expect(removeFilterPath(query, "domain")).toEqual(
      createFilterQuery([
        createFilterRule({
          id: "r2",
          operator: "is",
          path: ["status"],
          value: "pending",
        }),
      ])
    );
  });

  it("drops nested groups that become empty", () => {
    const query = createFilterQuery([
      createFilterGroup({
        combinator: "or",
        id: "g1",
        rules: [
          createFilterRule({
            id: "r1",
            operator: "is",
            path: ["domain"],
            value: "entries",
          }),
        ],
      }),
    ]);
    expect(removeFilterPath(query, "domain")).toEqual(createFilterQuery());
  });

  it("leaves an empty query unchanged", () => {
    expect(removeFilterPath(createFilterQuery(), "domain")).toEqual(
      createFilterQuery()
    );
  });
});
