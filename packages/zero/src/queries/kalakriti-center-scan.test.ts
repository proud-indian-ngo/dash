import { describe, expect, it } from "bun:test";

import { kalakritiCenterScanQueries } from "./kalakriti-center-scan";

type Row = Record<string, string | null>;
interface QueryAst {
  table: string;
  where?: Condition;
  related?: { subquery: QueryAst & { alias: string } }[];
}
type Condition =
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: string | null };
    }
  | { type: "and" | "or"; conditions: Condition[] }
  | {
      type: "correlatedSubquery";
      op: string;
      related: {
        correlation: { parentField: string[]; childField: string[] };
        subquery: QueryAst;
      };
    };
function matches(
  row: Row,
  condition: Condition | undefined,
  tables: Record<string, Row[]>
): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case "simple":
      if (condition.op === "!=")
        return row[condition.left.name] !== condition.right.value;
      if (condition.op !== "=" && condition.op !== "IS")
        throw new Error(`Unsupported comparison ${condition.op}`);
      return row[condition.left.name] === condition.right.value;
    case "and":
      return condition.conditions.every((child) => matches(row, child, tables));
    case "or":
      return condition.conditions.some((child) => matches(row, child, tables));
    case "correlatedSubquery": {
      if (condition.op !== "EXISTS")
        throw new Error(`Unsupported subquery ${condition.op}`);
      const { correlation, subquery } = condition.related;
      return (tables[subquery.table] ?? []).some(
        (child) =>
          correlation.parentField.every(
            (field, index) =>
              row[field] === child[correlation.childField[index]!]
          ) && matches(child, subquery.where, tables)
      );
    }
  }
}
const args = { editionId: "edition", centerId: "center" };
function query(permissions: string[] = []) {
  return kalakritiCenterScanQueries.byCenter.fn({
    args,
    ctx: { userId: "operator", permissions, role: "volunteer" },
  }) as unknown as { ast: QueryAst };
}
const center = {
  id: args.centerId,
  editionId: args.editionId,
  retiredAt: null,
};
function tables(
  responsibility: string,
  centerId: string | null = args.centerId,
  kind = "volunteer",
  state = "active",
  editionId = args.editionId
) {
  return {
    kalakritiEdition: [{ id: args.editionId, lifecycle: "live" }],
    kalakritiEditionMembership: [
      { id: "member", userId: "operator", editionId, state, kind },
    ],
    kalakritiAssignment: [
      { editionId, membershipId: "member", responsibility, centerId },
    ],
  };
}

describe("Center scan query", () => {
  it.each([
    ["transport_lead", null, true],
    ["edition_admin", null, true],
    ["liaison", "center", true],
    ["center_liaison_lead", "center", true],
    ["liaison", "other", false],
    ["food_lead", null, false],
    ["transport_coordinator", "center", false],
  ] as const)(
    "scopes %s/%s without widening generic Student queries",
    (role, assignedCenter, allowed) => {
      expect(
        matches(center, query().ast.where, tables(role, assignedCenter))
      ).toBe(allowed);
    }
  );

  it("denies Guardians, inactive memberships and cross-Edition assignments", () => {
    expect(
      matches(
        center,
        query().ast.where,
        tables("transport_lead", null, "guardian")
      )
    ).toBe(false);
    expect(
      matches(
        center,
        query().ast.where,
        tables("transport_lead", null, "volunteer", "archived")
      )
    ).toBe(false);
    expect(
      matches(
        center,
        query().ast.where,
        tables("transport_lead", null, "volunteer", "active", "other")
      )
    ).toBe(false);
  });

  it("bounds even administrators to requested Edition/Center and excludes archived or retired Centers", () => {
    const ast = query(["kalakriti.admin"]).ast;
    const data = tables("transport_lead");
    expect(matches(center, ast.where, data)).toBe(true);
    expect(matches({ ...center, editionId: "other" }, ast.where, data)).toBe(
      false
    );
    expect(matches({ ...center, id: "other" }, ast.where, data)).toBe(false);
    expect(matches({ ...center, retiredAt: "retired" }, ast.where, data)).toBe(
      false
    );
    data.kalakritiEdition = [{ id: args.editionId, lifecycle: "archived" }];
    expect(matches(center, ast.where, data)).toBe(false);
  });

  it("fails closed for anonymous users and includes dedicated roster/mark/session relations", () => {
    const anonymous = kalakritiCenterScanQueries.byCenter.fn({
      args,
      ctx: null,
    } as never) as unknown as { ast: QueryAst };
    expect(matches(center, anonymous.ast.where, tables("transport_lead"))).toBe(
      false
    );
    const ast = query().ast;
    expect(
      ast.related?.map((relation) => relation.subquery.alias).sort()
    ).toEqual(["edition", "scanStages", "students"]);
    const students = ast.related?.find(
      (relation) => relation.subquery.alias === "students"
    )?.subquery;
    expect(students?.related?.[0]?.subquery.alias).toBe("operations");
    expect(JSON.stringify(students)).toContain("venue_arrival");
    expect(JSON.stringify(students)).not.toContain("breakfast");
  });
});
