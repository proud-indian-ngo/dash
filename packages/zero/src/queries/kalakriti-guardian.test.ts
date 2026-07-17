import { describe, expect, it } from "vitest";
import { kalakritiGuardianQueries } from "./kalakriti-guardian";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("Kalakriti Guardian roster privacy", () => {
  it("allows global administrators without an Edition membership", () => {
    const query = kalakritiGuardianQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: {
        permissions: ["kalakriti.admin", "kalakriti.view"],
        role: "admin",
        userId: "admin-1",
      },
    });
    const ast = queryAst(query);

    expect(ast).toContain('"value":"edition-1"');
    expect(ast).toContain('"value":"guardian"');
    expect(ast).not.toContain('"value":"admin-1"');
  });

  it("limits non-global access to an active Edition administrator", () => {
    const query = kalakritiGuardianQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "edition-admin-1",
      },
    });
    const ast = queryAst(query);

    expect(ast).toContain('"value":"edition-admin-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).toContain('"value":"edition-1"');
  });

  it("denies an unauthenticated caller", () => {
    const query = kalakritiGuardianQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: null as never,
    });

    expect(queryAst(query)).toContain(
      '"value":"00000000-0000-0000-0000-000000000000"'
    );
  });

  it("denies a caller without coarse access", () => {
    const query = kalakritiGuardianQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
    });

    expect(queryAst(query)).toContain(
      '"value":"00000000-0000-0000-0000-000000000000"'
    );
  });
});
