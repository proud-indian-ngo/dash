import { describe, expect, it } from "vitest";
import { kalakritiEligibilityQueries } from "./kalakriti-eligibility";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiEligibility queries", () => {
  it("scopes configuration to Edition Administrators", () => {
    const ast = queryAst(
      kalakritiEligibilityQueries.ageCategories.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "edition-admin-1",
        },
      })
    );
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).toContain('"value":"edition-admin-1"');
  });

  it("scopes Category Lead Age Categories through assigned Category Sessions", () => {
    const ast = queryAst(
      kalakritiEligibilityQueries.ageCategories.fn({
        args: { editionId: "edition-1" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "category-lead-1",
        },
      })
    );
    expect(ast).toContain('"name":"lifecycle"');
    expect(ast).toContain('"value":"archived"');
    expect(ast).toContain('"table":"kalakritiCompetitionSession"');
    expect(ast).toContain('"table":"kalakritiCompetitionCategory"');
    expect(ast).toContain('"value":"competition_category_lead"');
    expect(ast).toContain('"value":"category-lead-1"');
  });

  it("returns a never-match query without Kalakriti access", () => {
    const ast = queryAst(
      kalakritiEligibilityQueries.quotas.fn({
        args: { editionId: "edition-1" },
        ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
      })
    );
    expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
    expect(ast).not.toContain('"value":"ordinary-1"');
  });
});
