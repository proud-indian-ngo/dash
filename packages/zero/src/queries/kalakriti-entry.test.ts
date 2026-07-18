import { describe, expect, it } from "vitest";
import { kalakritiEntryQueries } from "./kalakriti-entry";

const input = { centerId: "center-1", editionId: "edition-1" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiEntry queries", () => {
  it.each(["availableSessionsByCenter", "visibleByCenter"] as const)(
    "scopes %s to registration roles for the requested Center",
    (queryName) => {
      const ast = queryAst(
        kalakritiEntryQueries[queryName].fn({
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

  it("loads only active Session configuration and capacity rows", () => {
    const ast = queryAst(
      kalakritiEntryQueries.availableSessionsByCenter.fn({
        args: input,
        ctx: {
          permissions: ["kalakriti.admin"],
          role: "admin",
          userId: "admin-1",
        },
      })
    );

    expect(ast).toContain('"table":"kalakritiCompetition"');
    expect(ast).toContain('"table":"kalakritiCompetitionCategory"');
    expect(ast).toContain('"table":"kalakritiAgeCategory"');
    expect(ast).toContain('"table":"kalakritiVenue"');
    expect(ast).toContain('"table":"kalakritiCompetitionEntry"');
    expect(ast).toContain('"value":"individual"');
  });

  it.each(["availableSessionsByCenter", "visibleByCenter"] as const)(
    "denies %s without coarse Kalakriti access",
    (queryName) => {
      const ast = queryAst(
        kalakritiEntryQueries[queryName].fn({
          args: input,
          ctx: { permissions: [], role: "volunteer", userId: "ordinary-1" },
        })
      );

      expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
      expect(ast).not.toContain('"value":"ordinary-1"');
    }
  );
});
