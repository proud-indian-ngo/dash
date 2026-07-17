import { describe, expect, it } from "vitest";
import { kalakritiCompetitionQueries } from "./kalakriti-competition";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiCompetition queries", () => {
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
