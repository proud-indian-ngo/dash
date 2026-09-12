import { describe, expect, it } from "bun:test";

import { kalakritiCompetitionQueries } from "./kalakriti-competition";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

type ScopeRow = Record<string, string | null>;
interface ScopeAst {
  table: string;
  where?: ScopeCondition;
  related?: { subquery: ScopeAst & { alias: string } }[];
}
type ScopeCondition =
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: string | null };
    }
  | { type: "and" | "or"; conditions: ScopeCondition[] }
  | {
      type: "correlatedSubquery";
      op: string;
      related: {
        correlation: { parentField: string[]; childField: string[] };
        subquery: ScopeAst;
      };
    };
function matchesScope(
  row: ScopeRow,
  condition: ScopeCondition | undefined,
  tables: Record<string, ScopeRow[]>
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
      return condition.conditions.every((child) =>
        matchesScope(row, child, tables)
      );
    case "or":
      return condition.conditions.some((child) =>
        matchesScope(row, child, tables)
      );
    case "correlatedSubquery": {
      if (condition.op !== "EXISTS")
        throw new Error(`Unsupported subquery ${condition.op}`);
      const { correlation, subquery } = condition.related;
      return (tables[subquery.table] ?? []).some(
        (child) =>
          correlation.parentField.every(
            (field, index) =>
              row[field] === child[correlation.childField[index]!]
          ) && matchesScope(child, subquery.where, tables)
      );
    }
  }
}

describe("kalakritiCompetition queries", () => {
  it.each([
    [
      "competition_volunteer",
      "competition-1",
      "active",
      "volunteer",
      "edition-1",
      true,
    ],
    [
      "competition_coordinator",
      "competition-1",
      "active",
      "volunteer",
      "edition-1",
      true,
    ],
    [
      "competition_volunteer",
      "other",
      "active",
      "volunteer",
      "edition-1",
      false,
    ],
    [
      "competition_volunteer",
      "competition-1",
      "archived",
      "volunteer",
      "edition-1",
      false,
    ],
    [
      "competition_volunteer",
      "competition-1",
      "active",
      "guardian",
      "edition-1",
      false,
    ],
    [
      "competition_volunteer",
      "competition-1",
      "active",
      "volunteer",
      "other-edition",
      false,
    ],
    ["food_member", "competition-1", "active", "volunteer", "edition-1", false],
    [
      "hospitality_member",
      "competition-1",
      "active",
      "volunteer",
      "edition-1",
      false,
    ],
  ] as const)(
    "evaluates station catalog scope %s/%s/%s/%s/%s",
    (
      responsibility,
      competitionId,
      state,
      kind,
      assignmentEdition,
      allowed
    ) => {
      const tables = {
        kalakritiEdition: [{ id: "edition-1", lifecycle: "live" }],
        kalakritiCompetition: [{ id: "competition-1", editionId: "edition-1" }],
        kalakritiCompetitionDivision: [
          {
            id: "division-1",
            editionId: "edition-1",
            competitionId: "competition-1",
          },
        ],
        kalakritiEditionMembership: [
          {
            id: "member",
            editionId: "edition-1",
            userId: "operator",
            state,
            kind,
          },
        ],
        kalakritiAssignment: [
          {
            membershipId: "member",
            editionId: assignmentEdition,
            competitionId,
            responsibility,
          },
        ],
      };
      const input = {
        args: { editionId: "edition-1" },
        ctx: {
          userId: "operator",
          role: "volunteer",
          permissions: ["kalakriti.view"],
        },
      };
      const sessions = kalakritiCompetitionQueries.sessions.fn(
        input
      ) as unknown as { ast: ScopeAst };
      const competitions = kalakritiCompetitionQueries.competitions.fn(
        input
      ) as unknown as { ast: ScopeAst };
      expect(
        matchesScope(
          { id: "session-1", editionId: "edition-1", divisionId: "division-1" },
          sessions.ast.where,
          tables
        )
      ).toBe(allowed);
      expect(
        matchesScope(
          { id: "competition-1", editionId: "edition-1" },
          competitions.ast.where,
          tables
        )
      ).toBe(allowed);
    }
  );

  it("includes scoped Competition and Age Category labels in session options", () => {
    const query = kalakritiCompetitionQueries.sessions.fn({
      args: { editionId: "edition-1" },
      ctx: { userId: "admin", role: "admin", permissions: ["kalakriti.admin"] },
    }) as unknown as { ast: ScopeAst };
    const division = query.ast.related?.find(
      (relation) => relation.subquery.alias === "division"
    )?.subquery;
    expect(
      division?.related?.map((relation) => relation.subquery.alias).sort()
    ).toEqual(["ageCategory", "competition"]);
    expect(JSON.stringify(division?.where)).toContain('"value":"edition-1"');
  });
  it("scopes Category Lead Competition reads to assigned Categories", () => {
    const ast = queryAst(
      kalakritiCompetitionQueries.competitions.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "category-lead-1",
        },
      })
    );
    expect(ast).toContain('"value":"competition_category_lead"');
    expect(ast).toContain('"value":"category-lead-1"');
    expect(ast).toContain('"name":"lifecycle"');
    expect(ast).toContain('"value":"archived"');
  });

  it("scopes Competition staff reads to their assigned Competitions", () => {
    const ast = queryAst(
      kalakritiCompetitionQueries.competitions.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "competition-staff-1",
        },
      })
    );

    expect(ast).toContain('"value":"competition_coordinator"');
    expect(ast).toContain('"value":"competition_volunteer"');
    expect(ast).toContain('"value":"competition-staff-1"');
    expect(ast).toContain('"value":"active"');
  });

  it("scopes Category Lead Venue reads through assigned Category Sessions", () => {
    const ast = queryAst(
      kalakritiCompetitionQueries.venues.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "category-lead-1",
        },
      })
    );
    expect(ast).toContain('"table":"kalakritiCompetitionSession"');
    expect(ast).toContain('"table":"kalakritiCompetition"');
    expect(ast).toContain('"table":"kalakritiCompetitionCategory"');
    expect(ast).toContain('"value":"competition_category_lead"');
    expect(ast).toContain('"value":"category-lead-1"');
  });

  it("returns a never-match query without Kalakriti access", () => {
    const ast = queryAst(
      kalakritiCompetitionQueries.sessions.fn({
        args: { editionId: "edition-1" },
        ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
      })
    );
    expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
    expect(ast).not.toContain('"value":"ordinary-1"');
  });

  it("lets Volunteer Coordinators read the catalog for scoped assignments", () => {
    const ast = queryAst(
      kalakritiCompetitionQueries.categories.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "volunteer-coordinator-1",
        },
      })
    );
    expect(ast).toContain('"value":"volunteer_coordinator"');
    expect(ast).toContain('"value":"volunteer-coordinator-1"');
  });
});
