import { describe, expect, it } from "vitest";
import { kalakritiEditionQueries } from "./kalakriti-edition";

describe("Kalakriti Edition query privacy", () => {
  it("does not sync yearly rosters through member-facing queries", () => {
    const query = kalakritiEditionQueries.byYear.fn({
      args: { year: 2028 },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "external_user",
        userId: "guardian-1",
      },
    });

    const { relationships } = (
      query as unknown as {
        format: { relationships: Record<string, unknown> };
      }
    ).format;
    expect(relationships).not.toHaveProperty("memberships");
    expect(relationships).not.toHaveProperty("assignments");
    expect(relationships).not.toHaveProperty("teamEvent");

    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);
    expect(ast).toContain('"table":"kalakritiEditionMembership"');
    expect(ast).toContain('"name":"userId"');
    expect(ast).toContain('"value":"guardian-1"');
    expect(ast).toContain('"name":"state"');
    expect(ast).toContain('"value":"active"');
  });

  it("gives global Kalakriti administrators an Edition-wide override", () => {
    const query = kalakritiEditionQueries.byYear.fn({
      args: { year: 2028 },
      ctx: {
        permissions: ["kalakriti.admin"],
        role: "admin",
        userId: "admin-1",
      },
    });
    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

    expect(ast).toContain('"name":"year"');
    expect(ast).toContain('"value":2028');
    expect(ast).not.toContain('"table":"kalakritiEditionMembership"');
  });

  it("denies active memberships without coarse Kalakriti access", () => {
    const query = kalakritiEditionQueries.byYear.fn({
      args: { year: 2028 },
      ctx: { permissions: [], role: "custom", userId: "member-1" },
    });

    expect(
      JSON.stringify((query as unknown as { ast: unknown }).ast)
    ).toContain('"value":-1');
  });
});
