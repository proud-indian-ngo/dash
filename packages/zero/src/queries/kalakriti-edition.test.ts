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

  it("limits configuration sources to active Edition Administrators", () => {
    const query = kalakritiEditionQueries.configurationAccessible.fn({
      args: undefined,
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "edition-admin-1",
      },
    });
    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

    expect(ast).toContain('"table":"kalakritiEditionMembership"');
    expect(ast).toContain('"value":"edition-admin-1"');
    expect(ast).toContain('"table":"kalakritiAssignment"');
    expect(ast).toContain('"name":"responsibility"');
    expect(ast).toContain('"value":"edition_admin"');
  });

  it("lets global administrators discover every clone source", () => {
    const query = kalakritiEditionQueries.configurationAccessible.fn({
      args: undefined,
      ctx: {
        permissions: ["kalakriti.admin"],
        role: "admin",
        userId: "admin-1",
      },
    });
    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

    expect(ast).not.toContain('"table":"kalakritiEditionMembership"');
    expect(ast).not.toContain('"table":"kalakritiAssignment"');
  });

  it.each([
    ["clone source", kalakritiEditionQueries.cloneSource],
    ["readiness", kalakritiEditionQueries.readiness],
  ])(
    "limits the %s query to an active Edition Administrator",
    (_, queryDefinition) => {
      const query = queryDefinition.fn({
        args: { editionId: "edition-2028" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "edition-admin-1",
        },
      });
      const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

      expect(ast).toContain('"name":"id"');
      expect(ast).toContain('"value":"edition-2028"');
      expect(ast).toContain('"table":"kalakritiEditionMembership"');
      expect(ast).toContain('"value":"edition-admin-1"');
      expect(ast).toContain('"table":"kalakritiAssignment"');
      expect(ast).toContain('"name":"responsibility"');
      expect(ast).toContain('"value":"edition_admin"');
    }
  );

  it.each([
    ["clone source", kalakritiEditionQueries.cloneSource],
    ["readiness", kalakritiEditionQueries.readiness],
  ])(
    "does not grant the %s query to an ordinary Edition member",
    (_, queryDefinition) => {
      const query = queryDefinition.fn({
        args: { editionId: "edition-2028" },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "ordinary-member-1",
        },
      });
      const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

      expect(ast).toContain('"value":"ordinary-member-1"');
      expect(ast).toContain('"table":"kalakritiAssignment"');
      expect(ast).toContain('"value":"edition_admin"');
    }
  );

  it.each([
    ["clone source", kalakritiEditionQueries.cloneSource],
    ["readiness", kalakritiEditionQueries.readiness],
  ])("lets a global administrator use the %s query", (_, queryDefinition) => {
    const query = queryDefinition.fn({
      args: { editionId: "edition-2028" },
      ctx: {
        permissions: ["kalakriti.admin"],
        role: "admin",
        userId: "admin-1",
      },
    });
    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);

    expect(ast).toContain('"name":"id"');
    expect(ast).toContain('"value":"edition-2028"');
    expect(ast).not.toContain('"table":"kalakritiEditionMembership"');
    expect(ast).not.toContain('"table":"kalakritiAssignment"');
  });
});
