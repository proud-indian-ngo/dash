import { describe, expect, it, mock } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";

import {
  projectEligibleFoodRows,
  resolveFoodRosterSnapshot,
  type EligibleFoodRow,
} from "./food-roster-snapshot";
import type { FoodTableRow } from "./food-table";
import type { VolunteerRosterItem } from "./volunteers-table";

interface CapturedTable<T> {
  data: T[];
  getRowId: (row: T) => string;
  isLoading: boolean;
  columns: {
    id?: string;
    accessorFn?: (row: T) => unknown;
    enableSorting?: boolean;
    cell?: (props: { row: { original: T } }) => ReactNode;
    meta?: { headerTitle?: string; skeleton?: unknown };
  }[];
  filter: {
    fields: {
      id?: string;
      label?: string;
      options?: { value: unknown; label: unknown }[];
    }[];
    getValue: (row: T, path: string[]) => unknown;
  };
}
let captured: unknown;
mock.module("@/components/data-table/use-data-table-filters", () => ({
  useDataTableFilters: () => ({
    query: createFilterQuery(),
    setQuery: () => undefined,
  }),
}));
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: unknown) => {
    captured = props;
    return null;
  },
}));
const { FoodTable, foodCenterNames, FoodMealStatus, getFoodFilterValue } =
  await import("./food-table");
const { countFoodPeople, FoodStats } = await import("./food-stats");
const { VolunteersTable } = await import("./volunteers-table");
const student: FoodTableRow = {
  id: "student",
  name: "Student",
  humanId: "KAL-2026-0001",
  kind: "student",
  centers: [{ id: "a", name: "Center A" }],
  operations: [],
};
const guardian: FoodTableRow = {
  ...student,
  id: "guardian",
  kind: "guardian",
  state: "active",
  humanId: null,
  centers: [
    { id: "b", name: "Center B" },
    { id: "a", name: "Center A" },
    { id: "b", name: "Center B" },
  ],
};
const volunteer: FoodTableRow = {
  ...student,
  id: "volunteer",
  kind: "volunteer",
  state: "active",
};
const mark = (type: string, supersededByOperationId: string | null = null) => ({
  type,
  supersededByOperationId,
});
function food(rows: FoodTableRow[], complete = true, undo = false) {
  renderToStaticMarkup(
    <FoodTable
      data={rows}
      isLoading={false}
      statusSnapshotComplete={complete}
      statusSnapshotKey="edition:a+b"
      onUndoMeal={undo ? () => undefined : undefined}
      undoDisabled={!complete}
    />
  );
  return captured as CapturedTable<EligibleFoodRow>;
}
function status(
  table: CapturedTable<EligibleFoodRow>,
  row: EligibleFoodRow,
  id: string
) {
  return table.columns.find((column) => column.id === id)?.accessorFn?.(row);
}
const noop = () => undefined;
function volunteerTable(
  operations: VolunteerRosterItem["operations"],
  complete = true
) {
  const row: VolunteerRosterItem = {
    id: "volunteer",
    assignments: [],
    snapshotName: "Volunteer",
    snapshotEmail: null,
    snapshotPhone: null,
    userId: "user",
    userRole: "volunteer",
    operations,
  };
  renderToStaticMarkup(
    <VolunteersTable
      data={[row]}
      isLoading={false}
      actorResponsibilities={[]}
      isGlobalAdmin={false}
      onAssignRole={noop}
      onRemove={noop}
      onRemoveFromEdition={noop}
      onView={noop}
      statusSnapshotComplete={complete}
      statusSnapshotKey="edition"
    />
  );
  const table = captured as CapturedTable<VolunteerRosterItem>;
  const column = table.columns.find((item) => item.id === "checkInStatus");
  return {
    table,
    column,
    label: column?.accessorFn?.(row),
    markup: renderToStaticMarkup(
      <>{column?.cell?.({ row: { original: row } })}</>
    ),
  };
}

describe("Food table", () => {
  it("restricts the base roster to eligible people and removes Eligibility", () => {
    const table = food([student, guardian, volunteer]);
    expect(table.data.map((row) => row.id)).toEqual([guardian.id]);
    expect(table.columns.some((column) => column.id === "eligibility")).toBe(
      false
    );
    expect(foodCenterNames(guardian)).toBe("Center A, Center B");
    expect(
      food([
        { ...student, operations: [mark("pickup")] },
        { ...volunteer, operations: [mark("volunteer_check_in")] },
      ]).data
    ).toHaveLength(2);
  });
  it("uses projected meal statuses for sorting and all six filters", () => {
    const table = food([
      {
        ...guardian,
        operations: [mark("breakfast"), mark("lunch", "replacement")],
      },
    ]);
    const row = table.data[0]!;
    expect(table.filter.fields.map((field) => field.label)).toEqual([
      "Name",
      "Person ID",
      "Role",
      "Center",
      "Breakfast",
      "Lunch",
    ]);
    for (const [key, value] of [
      ["name", guardian.name],
      ["humanId", guardian.id],
      ["role", "guardian"],
      ["centers", ["b", "a", "b"]],
      ["breakfast", "Served"],
      ["lunch", "Not served"],
    ] as const) {
      expect(table.filter.getValue(row, [key])).toEqual(value);
    }
    expect(status(table, row, "breakfast")).toBe("Served");
    expect(status(table, row, "lunch")).toBe("Not served");
  });
  it("shows and filters Guardian yearly IDs with a legacy membership-ID fallback", () => {
    const table = food([{ ...guardian, humanId: "KALG-2026-0001" }]);
    expect(status(table, table.data[0]!, "humanId")).toBe("KALG-2026-0001");
    expect(table.filter.getValue(table.data[0]!, ["humanId"])).toBe(
      "KALG-2026-0001"
    );
    const legacy = food([guardian]);
    expect(status(legacy, legacy.data[0]!, "humanId")).toBe(guardian.id);
  });
  it("keeps same-ID Students and memberships distinct", () => {
    const table = food([
      { ...student, operations: [mark("pickup")] },
      { ...guardian, id: student.id, operations: [mark("breakfast")] },
    ]);
    const [first, second] = table.data;
    expect(table.getRowId(first!)).toBe(`student:${student.id}`);
    expect(table.getRowId(second!)).toBe(`guardian:${student.id}`);
    expect(status(table, second!, "humanId")).toBe(student.id);
    expect(status(table, first!, "breakfast")).toBe("Not served");
    expect(status(table, second!, "breakfast")).toBe("Served");
  });
  it("excludes archived people from rows but preserves whole-roster served history", () => {
    const archived: FoodTableRow = {
      ...guardian,
      state: "archived",
      operations: [mark("breakfast"), mark("lunch")],
    };
    expect(food([student, archived]).data).toEqual([]);
    expect(countFoodPeople([student, archived])).toEqual({
      registered: 1,
      eligible: 0,
      breakfast: 1,
      lunch: 1,
    });
  });
  it("waits for the first complete snapshot instead of showing partial eligibility", () => {
    const table = food([guardian], false);
    expect(table.data).toEqual([]);
    expect(table.isLoading).toBe(true);
    expect(
      renderToStaticMarkup(
        <FoodStats data={[guardian]} complete={false} scopeKey="edition" />
      )
    ).toContain('data-slot="skeleton"');
  });
  it("matches either Center of a multi-Center person through the real filter compiler", () => {
    const table = food([
      guardian,
      { ...guardian, id: "outside", centers: [{ id: "c", name: "Center C" }] },
      { ...guardian, id: "no-center", centers: [] },
    ]);
    const match = (value: string[]) =>
      table.data
        .filter(
          compileFilterQuery(
            createFilterQuery([
              createFilterRule({
                id: "center-rule",
                path: ["centers"],
                operator: "has_any_of",
                value,
              }),
            ]),
            getFoodFilterValue
          )
        )
        .map((row) => row.id);
    expect(match(["a"])).toEqual([guardian.id]);
    expect(match(["b"])).toEqual([guardian.id]);
    expect(match(["a", "c"])).toEqual([guardian.id, "outside"]);
    expect(match(["unassigned"])).toEqual(["no-center"]);
    expect(match(["missing"])).toEqual([]);
  });
  it("offers Unassigned for eligible people without a Center", () => {
    const table = food([{ ...guardian, centers: [] }]);
    const row = table.data[0]!;
    expect(
      table.filter.fields.find((field) => field.id === "centers")?.options
    ).toContainEqual({ value: "unassigned", label: "Unassigned" });
    expect(table.filter.getValue(row, ["centers"])).toEqual(["unassigned"]);
    expect(foodCenterNames(row)).toBe("Unassigned");
  });
  it("renders an undo button only for a served record when the caller grants undo", () => {
    const data: FoodTableRow[] = [
      { ...guardian, operations: [{ id: "served", ...mark("breakfast") }] },
    ];
    const granted = food(data, true, true);
    const cell = (table: CapturedTable<EligibleFoodRow>, id: string) =>
      renderToStaticMarkup(
        <>
          {table.columns
            .find((column) => column.id === id)
            ?.cell?.({ row: { original: table.data[0]! } })}
        </>
      );
    expect(cell(granted, "breakfast")).toContain("Undo breakfast for Student");
    expect(cell(granted, "lunch")).not.toContain("button");
    expect(cell(food(data), "breakfast")).not.toContain("button");
  });
  it("renders accessible green checks and red crosses with tooltip labels", () => {
    for (const label of ["Served", "Not served"] as const) {
      const html = renderToStaticMarkup(<FoodMealStatus label={label} />);
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`title="${label}"`);
      expect(html).toContain('role="img"');
      expect(html).toContain(
        label === "Served" ? "text-green-600" : "text-red-600"
      );
    }
  });
  it("retains eligible rows and meal values across gaps, resets scope and accepts complete removals", () => {
    const previous = {
      scopeKey: "a",
      rows: projectEligibleFoodRows([
        { ...guardian, operations: [mark("breakfast")] },
      ]),
    };
    const current = {
      scopeKey: "a",
      rows: projectEligibleFoodRows([
        { ...guardian, state: "archived", operations: [] },
      ]),
    };
    expect(
      resolveFoodRosterSnapshot(undefined, previous, false)
    ).toBeUndefined();
    const retained = resolveFoodRosterSnapshot(previous, current, false)!;
    expect(retained).toBe(previous);
    const empty = { scopeKey: "a", rows: projectEligibleFoodRows([]) };
    const retainedEmpty = resolveFoodRosterSnapshot(previous, empty, false)!;
    expect(retainedEmpty).toBe(previous);
    expect(getFoodFilterValue(retainedEmpty.rows[0]!, ["breakfast"])).toBe(
      "Served"
    );
    expect(
      resolveFoodRosterSnapshot(previous, { ...empty, scopeKey: "b" }, false)
    ).toBeUndefined();
    expect(resolveFoodRosterSnapshot(previous, empty, true)?.rows).toEqual([]);
    expect(getFoodFilterValue(retained.rows[0]!, ["breakfast"])).toBe("Served");
    expect(resolveFoodRosterSnapshot(previous, current, true)?.rows).toEqual(
      []
    );
    expect(
      resolveFoodRosterSnapshot(previous, { ...current, scopeKey: "b" }, false)
    ).toBeUndefined();
  });
});

describe("Volunteer Checked in column", () => {
  it("shows accessible read-only check/cross icons without duplicating the column", () => {
    const checked = volunteerTable([mark("volunteer_check_in")]);
    const unchecked = volunteerTable([]);
    expect(
      checked.table.columns.filter((column) => column.id === "checkInStatus")
    ).toHaveLength(1);
    for (const [result, label, color] of [
      [checked, "Checked in", "text-green-600"],
      [unchecked, "Not checked in", "text-red-600"],
    ] as const) {
      expect(result.markup).toContain(`aria-label="${label}"`);
      expect(result.markup).toContain(`title="${label}"`);
      expect(result.markup).toContain('role="img"');
      expect(result.markup).toContain(color);
      expect(result.markup).not.toContain("button");
    }
    const waiting = volunteerTable([], false);
    expect(waiting.markup).toContain('data-slot="skeleton"');
    expect(waiting.markup).not.toContain('role="img"');
  });
  it("waits for readiness without hiding cached base rows", () => {
    const result = volunteerTable([], false);
    expect(result.label).toBeUndefined();
    expect(
      result.table.filter.getValue(result.table.data[0]!, ["checkInStatus"])
    ).toBeUndefined();
    expect(result.column?.enableSorting).toBe(false);
    expect(result.table.isLoading).toBe(false);
  });
  it("derives only effective volunteer check-in marks", () => {
    expect(volunteerTable([]).label).toBe("Not checked in");
    expect(volunteerTable([mark("breakfast")]).label).toBe("Not checked in");
    expect(
      volunteerTable([mark("volunteer_check_in", "replacement")]).label
    ).toBe("Not checked in");
    const result = volunteerTable([mark("volunteer_check_in")]);
    expect(result.label).toBe("Checked in");
    expect(
      result.table.filter.getValue(result.table.data[0]!, ["checkInStatus"])
    ).toBe(result.label);
    const unchecked = volunteerTable([]);
    expect(
      unchecked.table.filter.getValue(unchecked.table.data[0]!, [
        "checkInStatus",
      ])
    ).toBe("Not checked in");
    expect(result.column?.meta?.headerTitle).toBe("Checked in");
    expect(result.column?.meta?.skeleton).toBeDefined();
  });
});
