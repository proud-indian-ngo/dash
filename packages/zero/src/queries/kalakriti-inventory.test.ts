import { describe, expect, it } from "bun:test";

import { kalakritiInventoryQueries } from "./kalakriti-inventory";
import {
  matchesScope,
  type ScopeAst,
  type ScopeTables,
} from "./query-scope-test-utils";

const editionId = "01950000-0000-7000-8000-000000000001";
const otherEditionId = "01950000-0000-7000-8000-000000000002";
const itemId = "01950000-0000-7000-8000-000000000003";
const volunteerMembershipId = "volunteer";

function ast(
  name: keyof typeof kalakritiInventoryQueries,
  permissions = ["kalakriti.view"],
  ctx: object | null = { userId: "staff", role: "volunteer", permissions },
  args: object = {}
) {
  return (
    kalakritiInventoryQueries[name].fn({
      args: { editionId, ...args },
      ctx,
    } as never) as unknown as { ast: ScopeAst }
  ).ast;
}
function ids(query: ScopeAst, tables: ScopeTables) {
  return (tables[query.table] ?? [])
    .filter((row) => matchesScope(row, query.where, tables))
    .map((row) => row.id)
    .sort();
}
function fixture(role = "logistics_member"): ScopeTables {
  return {
    kalakritiEdition: [
      { id: editionId, lifecycle: "live" },
      { id: otherEditionId, lifecycle: "live" },
    ],
    kalakritiEditionMembership: [
      {
        id: "staff-membership",
        editionId,
        kind: "volunteer",
        state: "active",
        userId: "staff",
      },
      {
        id: "volunteer",
        editionId,
        kind: "volunteer",
        state: "active",
        userId: "volunteer",
      },
      {
        id: "inactive",
        editionId,
        kind: "volunteer",
        state: "archived",
        userId: "former",
      },
      {
        id: "foreign-volunteer",
        editionId: otherEditionId,
        kind: "volunteer",
        state: "active",
        userId: "foreign",
      },
    ],
    kalakritiAssignment: [
      {
        id: "assignment",
        editionId,
        membershipId: "staff-membership",
        responsibility: role,
      },
      {
        id: "volunteer-role",
        editionId,
        membershipId: volunteerMembershipId,
        responsibility: "logistics_member",
        competitionId: null,
      },
      {
        id: "volunteer-competition",
        editionId,
        membershipId: volunteerMembershipId,
        responsibility: "competition_volunteer",
        competitionId: "competition",
      },
    ],
    kalakritiInventoryItem: [
      { id: itemId, editionId },
      { id: "other-item", editionId: otherEditionId },
    ],
    kalakritiInventoryTransaction: [
      { id: "local-history", editionId, itemId },
      { id: "another-local-history", editionId, itemId: "another-item" },
      {
        id: "foreign-history",
        editionId: otherEditionId,
        itemId: "other-item",
      },
    ],
    kalakritiCompetition: [
      { id: "competition", editionId, retiredAt: null, cancelledAt: null },
      { id: "retired", editionId, retiredAt: "yes", cancelledAt: null },
      { id: "cancelled", editionId, retiredAt: null, cancelledAt: "yes" },
      {
        id: "foreign-competition",
        editionId: otherEditionId,
        retiredAt: null,
        cancelledAt: null,
      },
    ],
  };
}

describe("inventory query authorization", () => {
  it.each(["edition_admin", "logistics_lead", "logistics_member"])(
    "allows active %s across all roots",
    (role) => {
      const tables = fixture(role);
      expect(ids(ast("items"), tables)).toEqual([itemId]);
      expect(ids(ast("transactions"), tables)).toEqual([
        "another-local-history",
        "local-history",
      ]);
      expect(
        ids(ast("byItem", undefined, undefined, { itemId }), tables)
      ).toEqual(["local-history"]);
      expect(ids(ast("volunteers"), tables)).toEqual([
        "staff-membership",
        "volunteer",
      ]);
      expect(
        ids(
          ast("assignments", undefined, undefined, { volunteerMembershipId }),
          tables
        )
      ).toEqual([volunteerMembershipId]);
    }
  );

  it("keeps global administrator access to archived Edition history without a membership", () => {
    const tables = fixture();
    tables.kalakritiEdition![0]!.lifecycle = "archived";
    tables.kalakritiEditionMembership =
      tables.kalakritiEditionMembership!.filter(
        (row) => row.userId !== "staff"
      );
    for (const name of [
      "items",
      "transactions",
      "byItem",
      "volunteers",
      "assignments",
    ] as const) {
      expect(
        ids(
          ast(name, ["kalakriti.admin"], undefined, {
            itemId,
            volunteerMembershipId,
          }),
          tables
        ).length
      ).toBeGreaterThan(0);
    }
  });

  it.each(["food_member", "transport_lead", "liaison"])(
    "denies unrelated %s",
    (role) => {
      const tables = fixture(role);
      for (const name of [
        "items",
        "transactions",
        "byItem",
        "volunteers",
        "assignments",
      ] as const) {
        expect(
          ids(
            ast(name, undefined, undefined, { itemId, volunteerMembershipId }),
            tables
          )
        ).toEqual([]);
      }
    }
  );

  it("denies missing view permission and anonymous contexts", () => {
    const tables = fixture();
    for (const name of [
      "items",
      "transactions",
      "byItem",
      "volunteers",
      "assignments",
    ] as const) {
      expect(
        ids(ast(name, [], undefined, { itemId, volunteerMembershipId }), tables)
      ).toEqual([]);
      expect(
        ids(ast(name, [], null, { itemId, volunteerMembershipId }), tables)
      ).toEqual([]);
    }
  });

  it("revokes all roots when membership, assignment, or Edition changes", () => {
    for (const change of [
      "member",
      "assignment",
      "edition",
      "archive",
    ] as const) {
      const tables = fixture();
      if (change === "member")
        tables.kalakritiEditionMembership![0]!.state = "archived";
      if (change === "assignment")
        tables.kalakritiAssignment![0]!.editionId = otherEditionId;
      if (change === "edition")
        tables.kalakritiEditionMembership![0]!.editionId = otherEditionId;
      if (change === "archive")
        tables.kalakritiEdition![0]!.lifecycle = "archived";
      for (const name of [
        "items",
        "transactions",
        "byItem",
        "volunteers",
        "assignments",
      ] as const) {
        expect(
          ids(
            ast(name, undefined, undefined, { itemId, volunteerMembershipId }),
            tables
          )
        ).toEqual([]);
      }
    }
  });

  it("requires a real Edition for administrators and never reads another Edition", () => {
    const tables = fixture();
    expect(ids(ast("items", ["kalakriti.admin"]), tables)).toEqual([itemId]);
    expect(ids(ast("transactions", ["kalakriti.admin"]), tables)).not.toContain(
      "foreign-history"
    );
    tables.kalakritiEdition = [];
    expect(ids(ast("items", ["kalakriti.admin"]), tables)).toEqual([]);
  });

  it("returns assignments only for the selected active same-Edition volunteer", () => {
    const tables = fixture();
    const target = (volunteerMembershipId: string) =>
      ids(
        ast("assignments", undefined, undefined, { volunteerMembershipId }),
        tables
      );

    expect(target("volunteer")).toEqual(["volunteer"]);
    expect(target("inactive")).toEqual([]);
    expect(target("foreign-volunteer")).toEqual([]);
    expect(target("staff-membership")).toEqual(["staff-membership"]);
    tables.kalakritiEditionMembership![1]!.state = "archived";
    expect(target("volunteer")).toEqual([]);
  });

  it("projects only same-Edition assignments with their optional competition", () => {
    const projection = ast("assignments", undefined, undefined, {
      volunteerMembershipId,
    }).related?.[0];
    expect(projection?.subquery.alias).toBe("assignments");
    expect(
      (projection as unknown as { correlation: unknown }).correlation
    ).toEqual({
      parentField: ["id"],
      childField: ["membershipId"],
    });
    expect(ids(projection!.subquery, fixture())).toEqual([
      "assignment",
      "volunteer-competition",
      "volunteer-role",
    ]);
    const competition = projection?.subquery.related?.[0];
    expect(competition?.subquery.alias).toBe("competition");
    expect(
      (competition as unknown as { correlation: unknown }).correlation
    ).toEqual({
      parentField: ["competitionId"],
      childField: ["id"],
    });
  });

  it("catalog root does not include history relationships", () => {
    expect(ast("items").related ?? []).toEqual([]);
    const aliases = (ast("transactions").related ?? []).map(
      (relation) => relation.subquery.alias
    );
    expect(aliases).toEqual(["item", "volunteer", "competition", "actor"]);
  });
});
