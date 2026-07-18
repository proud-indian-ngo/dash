import { describe, expect, it } from "vitest";
import { kalakritiCenterQueries } from "./kalakriti-center";

const input = { editionId: "edition-1" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiCenter queries", () => {
  it("scopes ordinary members through Guardian or typed Center assignments", () => {
    const ast = queryAst(
      kalakritiCenterQueries.visible.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "external_user",
          userId: "guardian-1",
        },
      })
    );

    expect(ast).toContain('"table":"kalakritiGuardianCenter"');
    expect(ast).toContain('"table":"kalakritiAssignment"');
    expect(ast).toContain('"value":"guardian-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"liaison"');
  });

  it("returns a never-match query without Kalakriti access", () => {
    const ast = queryAst(
      kalakritiCenterQueries.visible.fn({
        args: input,
        ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
      })
    );

    expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
    expect(ast).not.toContain('"value":"ordinary-1"');
  });

  it("limits Guardian assignment visibility to administrators", () => {
    const editionAdminAst = queryAst(
      kalakritiCenterQueries.guardianAssignments.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "edition-admin-1",
        },
      })
    );
    const liaisonManagerAst = queryAst(
      kalakritiCenterQueries.liaisonAssignments.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "coordinator-1",
        },
      })
    );

    expect(editionAdminAst).toContain('"value":"edition_admin"');
    expect(editionAdminAst).not.toContain('"value":"volunteer_coordinator"');
    expect(liaisonManagerAst).toContain('"value":"edition_admin"');
    expect(liaisonManagerAst).toContain('"value":"volunteer_coordinator"');
  });
});
