import { describe, expect, it } from "bun:test";

import { kalakritiTransportQueries } from "./kalakriti-transport";

const args = { centerId: "center-1", editionId: "edition-1" };
function ast(permissions: string[], userId = "operator") {
  return JSON.stringify(
    (
      kalakritiTransportQueries.byCenter.fn({
        args,
        ctx: { permissions, role: "volunteer", userId },
      }) as unknown as { ast: unknown }
    ).ast
  );
}

type TestRow = Record<string, string>;
interface QueryAst {
  table: string;
  where?: Condition;
}
type Condition =
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: string };
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

// Execute the query's equality/EXISTS subset against isolated authorization rows.
function matches(
  row: TestRow,
  condition: Condition | undefined,
  tables: Record<string, TestRow[]>
): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case "simple":
      if (condition.op !== "=")
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
    default:
      throw new Error("Unsupported test query condition");
  }
}

describe("transport query authorization", () => {
  it.each([
    ["center-1", "edition-1", "active", true],
    ["other-center", "edition-1", "active", false],
    ["center-1", "other-edition", "active", false],
    ["center-1", "edition-1", "archived", false],
  ] as const)(
    "evaluates Guardian scope Center=%s Edition=%s membership=%s",
    (centerId, editionId, state, allowed) => {
      const tables = {
        kalakritiCenter: [{ id: centerId, editionId }],
        kalakritiEdition: [{ id: editionId }],
        kalakritiGuardianCenter: [
          {
            centerId: "center-1",
            editionId: "edition-1",
            membershipId: "guardian-membership",
          },
        ],
        kalakritiEditionMembership: [
          {
            id: "guardian-membership",
            editionId: "edition-1",
            userId: "guardian-user",
            kind: "guardian",
            state,
          },
        ],
      };
      const query = kalakritiTransportQueries.byCenter.fn({
        args: { centerId, editionId },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "external_user",
          userId: "guardian-user",
        },
      }) as unknown as { ast: QueryAst };
      expect(
        matches({ id: "bus", centerId, editionId }, query.ast.where, tables)
      ).toBe(allowed);
    }
  );
  it("always scopes administrators to the requested Center and Edition", () => {
    const query = ast(["kalakriti.admin"]);
    expect(query).toContain('"name":"editionId"');
    expect(query).toContain('"value":"edition-1"');
    expect(query).toContain('"name":"centerId"');
    expect(query).toContain('"value":"center-1"');
  });

  it("requires active volunteer membership and scoped coordinator or liaison assignment", () => {
    const query = ast(["kalakriti.view"]);
    for (const value of [
      "active",
      "volunteer",
      "operator",
      "transport_coordinator",
      "center_liaison_lead",
      "center-1",
      "edition_admin",
      "transport_lead",
    ]) {
      expect(query).toContain(`"value":"${value}"`);
    }
    expect(query).not.toContain('"value":"volunteer_coordinator"');
  });

  it("allows active Guardians only through their requested Center and Edition assignment", () => {
    const query = ast(["kalakriti.view"], "guardian-user");
    expect(query).toContain('"table":"kalakritiGuardianCenter"');
    expect(query).toContain('"value":"guardian"');
    expect(query).toContain('"value":"guardian-user"');
    expect(query).toContain('"value":"active"');
    expect(query).toContain('"parentField":["centerId"],"childField":["id"]');
    expect(query).toContain('"parentField":["id"],"childField":["centerId"]');
    expect(query).toContain('"value":"center-1"');
    expect(query).toContain('"value":"edition-1"');
  });

  it("fails closed without coarse Kalakriti access", () => {
    expect(ast([])).toContain('"value":"00000000-0000-0000-0000-000000000000"');
  });
});
