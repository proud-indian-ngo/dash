import { describe, expect, it } from "vitest";
import { kalakritiStudentQueries } from "./kalakriti-student";

const input = { centerId: "center-1", editionId: "edition-1" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiStudent queries", () => {
  it.each(["ageCategoriesByCenter", "quotasByCenter"] as const)(
    "scopes %s to the selected Center and registration roles",
    (queryName) => {
      const ast = queryAst(
        kalakritiStudentQueries[queryName].fn({
          args: input,
          ctx: {
            permissions: ["kalakriti.view"],
            role: "external_user",
            userId: "guardian-1",
          },
        })
      );

      expect(ast).toContain('"value":"edition-1"');
      expect(ast).toContain('"value":"center-1"');
      expect(ast).toContain('"table":"kalakritiGuardianCenter"');
      expect(ast).toContain('"value":"liaison"');
      expect(ast).toContain('"value":"edition_admin"');
      expect(ast).not.toContain('"value":"transport_coordinator"');
      expect(ast).toContain('"value":"guardian-1"');
    }
  );

  it.each(["ageCategoriesByCenter", "quotasByCenter"] as const)(
    "denies %s without coarse Kalakriti access",
    (queryName) => {
      const ast = queryAst(
        kalakritiStudentQueries[queryName].fn({
          args: input,
          ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
        })
      );

      expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
      expect(ast).not.toContain('"value":"ordinary-1"');
    }
  );

  it("scopes rows to the requested Edition and Center", () => {
    const ast = queryAst(
      kalakritiStudentQueries.visibleByCenter.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.admin", "kalakriti.view"],
          role: "admin",
          userId: "admin-1",
        },
      })
    );

    expect(ast).toContain('"value":"edition-1"');
    expect(ast).toContain('"value":"center-1"');
    expect(ast).toContain('"table":"kalakritiAgeCategory"');
    expect(ast).toContain('"table":"kalakritiCenter"');
  });

  it("allows only Guardian, Liaison, or Edition Administrator scope", () => {
    const ast = queryAst(
      kalakritiStudentQueries.visibleByCenter.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.view"],
          role: "external_user",
          userId: "guardian-1",
        },
      })
    );

    expect(ast).toContain('"table":"kalakritiGuardianCenter"');
    expect(ast).toContain('"value":"liaison"');
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).not.toContain('"value":"transport_coordinator"');
    expect(ast).toContain('"value":"guardian-1"');
  });

  it("returns a never-match query without coarse Kalakriti access", () => {
    const ast = queryAst(
      kalakritiStudentQueries.visibleByCenter.fn({
        args: input,
        ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
      })
    );

    expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
    expect(ast).not.toContain('"value":"ordinary-1"');
  });
});
