import { describe, expect, it } from "bun:test";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";

import { createDashboardFilterQuery } from "./kalakriti-dashboard-filter";

describe("dashboard destination filters", () => {
  it("accepts only filters intended for the destination", () => {
    expect(createDashboardFilterQuery("food", "unassigned")).toBeNull();
    expect(createDashboardFilterQuery("students", "unknown")).toBeNull();
    expect(
      createDashboardFilterQuery("students", "participation_shortfall")
    ).toBeNull();
  });

  it("finds volunteers without an assignment", () => {
    const query = createDashboardFilterQuery("volunteers", "unassigned");
    expect(query).not.toBeNull();
    const matches = compileFilterQuery(query!, (row: string[], path) =>
      path[0] === "responsibilities" ? row : undefined
    );
    expect(matches(["unassigned"])).toBe(true);
    expect(matches(["food_member"])).toBe(false);
  });

  it("finds active inventory with no stock", () => {
    const query = createDashboardFilterQuery("inventory", "out_of_stock");
    expect(query).not.toBeNull();
    const matches = compileFilterQuery(
      query!,
      (row: { status: string; quantity: number }, path) =>
        row[path[0] as keyof typeof row]
    );
    expect(matches({ status: "Active", quantity: 0 })).toBe(true);
    expect(matches({ status: "Active", quantity: 1 })).toBe(false);
    expect(matches({ status: "Archived", quantity: 0 })).toBe(false);
  });

  it("uses the Edition minimum for participation shortfalls", () => {
    const query = createDashboardFilterQuery(
      "students",
      "participation_shortfall",
      2
    );
    expect(query).not.toBeNull();
    const matches = compileFilterQuery(query!, (row: number) => row);
    expect(matches(0)).toBe(true);
    expect(matches(1)).toBe(true);
    expect(matches(2)).toBe(false);
  });

  it("targets pending meals, missing vehicles, and Students without Entries", () => {
    const cases = [
      [
        "food",
        "breakfast_pending",
        { breakfast: "Not served" },
        { breakfast: "Served" },
      ],
      ["food", "lunch_pending", { lunch: "Not served" }, { lunch: "Served" }],
      [
        "transport",
        "missing_vehicle",
        { vehicleAssignment: "missing" },
        { vehicleAssignment: "assigned" },
      ],
      ["students", "without_entries", { entryCount: 0 }, { entryCount: 1 }],
    ] as const;
    for (const [destination, filter, matching, other] of cases) {
      const query = createDashboardFilterQuery(destination, filter);
      expect(query).not.toBeNull();
      const matches = compileFilterQuery(
        query!,
        (row: Record<string, unknown>, path) => row[path[0] ?? ""]
      );
      expect(matches(matching)).toBe(true);
      expect(matches(other)).toBe(false);
    }
  });
});
