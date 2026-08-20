import {
  createFilterQuery,
  createFilterRule,
  isFilterQueryEmpty,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { describe, expect, it } from "vitest";
import { buildLegacyFilterQuery } from "./use-migrate-legacy-filter-params";

const MAPPINGS = [
  { param: "status", path: "status" },
  { param: "type", path: "type" },
] as const;

describe("buildLegacyFilterQuery", () => {
  it("returns null when no legacy params are set", () => {
    expect(buildLegacyFilterQuery({}, MAPPINGS)).toBeNull();
    expect(
      buildLegacyFilterQuery({ status: "", type: null }, MAPPINGS)
    ).toBeNull();
  });

  it("skips when a filters query is already present", () => {
    const alreadyMigrated = createFilterQuery([
      createFilterRule({
        id: "r1",
        operator: "is",
        path: ["status"],
        value: "pending",
      }),
    ]);
    expect(isFilterQueryEmpty(createFilterQuery())).toBe(true);
    expect(isFilterQueryEmpty(alreadyMigrated)).toBe(false);
  });

  it("builds is rules for each set param", () => {
    const query = buildLegacyFilterQuery(
      { status: "pending", type: "reimbursement" },
      MAPPINGS
    );
    expect(query).toEqual({
      combinator: "and",
      id: "root",
      rules: [
        {
          id: "legacy-status",
          operator: "is",
          path: ["status"],
          type: "rule",
          value: "pending",
        },
        {
          id: "legacy-type",
          operator: "is",
          path: ["type"],
          type: "rule",
          value: "reimbursement",
        },
      ],
      type: "group",
    });
  });
});
