import { describe, expect, it } from "vitest";
import { kalakritiAssignmentQueries } from "./kalakriti-assignment";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("Kalakriti volunteer roster privacy", () => {
  it("limits non-admin roster reads to Edition assignment managers", () => {
    const query = kalakritiAssignmentQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "manager-1",
      },
    });
    const ast = queryAst(query);

    expect(ast).toContain('"value":"manager-1"');
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).toContain('"value":"volunteer_coordinator"');
    expect(ast).toContain('"value":"active"');
  });

  it("denies callers without coarse Kalakriti access", () => {
    const query = kalakritiAssignmentQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: { permissions: [], role: "volunteer", userId: "user-1" },
    });

    expect(queryAst(query)).toContain(
      '"value":"00000000-0000-0000-0000-000000000000"'
    );
  });

  it("returns only the current active membership for self access", () => {
    const query = kalakritiAssignmentQueries.myAccess.fn({
      args: { editionId: "edition-1" },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "user-1",
      },
    });
    const ast = queryAst(query);

    expect(ast).toContain('"value":"edition-1"');
    expect(ast).toContain('"value":"user-1"');
    expect(ast).toContain('"value":"active"');
  });
});
