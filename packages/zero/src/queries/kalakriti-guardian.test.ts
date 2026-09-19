import { describe, expect, it } from "bun:test";

import { kalakritiGuardianQueries } from "./kalakriti-guardian";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "./query-scope-test-utils";

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

function rosterAst(): ScopeAst {
  return (
    kalakritiGuardianQueries.roster.fn({
      args: { editionId: "edition-1" },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "actor-user",
      },
    }) as unknown as { ast: ScopeAst }
  ).ast;
}

function guardianFixture(responsibility: string): ScopeTables {
  const membership = (id: string, kind: string, userId: string): ScopeRow => ({
    editionId: "edition-1",
    id,
    kind,
    snapshotName: id,
    state: "active",
    userId,
  });
  return {
    kalakritiAssignment: [
      {
        centerId:
          responsibility === "liaison_lead" ||
          responsibility === "volunteer_coordinator"
            ? null
            : "center-a",
        editionId: "edition-1",
        id: "actor-assignment",
        membershipId: "actor",
        responsibility,
      },
    ],
    kalakritiCenter: ["center-a", "center-b"].map((id) => ({
      editionId: "edition-1",
      id,
    })),
    kalakritiEdition: [{ id: "edition-1", lifecycle: "live" }],
    kalakritiEditionMembership: [
      membership("actor", "volunteer", "actor-user"),
      membership("guardian-a", "guardian", "guardian-a-user"),
      membership("guardian-b", "guardian", "guardian-b-user"),
      membership("guardian-shared", "guardian", "guardian-shared-user"),
      membership("guardian-unassigned", "guardian", "guardian-none-user"),
    ],
    kalakritiGuardianCenter: [
      {
        centerId: "center-a",
        editionId: "edition-1",
        id: "link-a",
        membershipId: "guardian-a",
      },
      {
        centerId: "center-b",
        editionId: "edition-1",
        id: "link-b",
        membershipId: "guardian-b",
      },
      {
        centerId: "center-a",
        editionId: "edition-1",
        id: "link-shared-a",
        membershipId: "guardian-shared",
      },
      {
        centerId: "center-b",
        editionId: "edition-1",
        id: "link-shared-b",
        membershipId: "guardian-shared",
      },
    ],
    kalakritiOperation: [],
    user: [],
  };
}

function rosterIds(responsibility: string): string[] {
  const query = rosterAst();
  const tables = guardianFixture(responsibility);
  return (tables.kalakritiEditionMembership ?? [])
    .filter((row) => matchesScope(row, query.where, tables))
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
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
    expect(ast).toContain('"table":"user"');
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
    expect(ast).toContain(
      '"value":["edition_admin","volunteer_coordinator","volunteer_management_volunteer","liaison_lead","liaison","center_liaison_lead","liaison_volunteer"]'
    );
    expect(ast).toContain(
      '"value":["liaison","center_liaison_lead","liaison_volunteer"]'
    );
    expect(ast).toContain('"value":"guardian_check_in"');
    expect(ast).toContain('"value":"edition-1"');
  });

  it.each(["liaison", "center_liaison_lead", "liaison_volunteer"])(
    "limits %s to Guardians in assigned Centers",
    (responsibility) => {
      expect(rosterIds(responsibility)).toEqual([
        "guardian-a",
        "guardian-shared",
      ]);
    }
  );

  it("lets the Overall Liaison Lead see Guardians across all Centers", () => {
    expect(rosterIds("liaison_lead")).toEqual([
      "guardian-a",
      "guardian-b",
      "guardian-shared",
    ]);
  });

  it("preserves full roster access for Volunteer Management", () => {
    expect(rosterIds("volunteer_coordinator")).toEqual([
      "guardian-a",
      "guardian-b",
      "guardian-shared",
      "guardian-unassigned",
    ]);
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
