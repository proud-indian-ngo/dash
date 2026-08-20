import { describe, expect, it } from "vitest";
import { kalakritiEntryQueries } from "./kalakriti-entry";

const input = { centerId: "center-1", editionId: "edition-1" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiEntry queries", () => {
  it.each(["availableDivisionsByCenter", "visibleByCenter"] as const)(
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
      expect(ast).toContain('"value":"overall_events_lead"');
      expect(ast).toContain('"value":"competition_category_lead"');
      expect(ast).toContain('"value":"competition_coordinator"');
      expect(ast).toContain('"value":"liaison_lead"');
      expect(ast).toContain('"value":"liaison_volunteer"');
      expect(ast).toContain('"value":"guardian-1"');
    }
  );

  it("loads active Competition Divisions with schedule context", () => {
    const ast = queryAst(
      kalakritiEntryQueries.availableDivisionsByCenter.fn({
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
    expect(ast).not.toContain('"value":"individual"');
    expect(ast).not.toContain('"value":"group"');
  });

  it.each(["availableDivisionsByCenter", "visibleByCenter"] as const)(
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
