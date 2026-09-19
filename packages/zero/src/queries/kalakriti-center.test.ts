import { describe, expect, it } from "bun:test";

import { kalakritiCenterQueries } from "./kalakriti-center";
import { kalakritiEntryQueries } from "./kalakriti-entry";
import { kalakritiStudentQueries } from "./kalakriti-student";
import {
  matchesScope,
  type ScopeAst,
  type ScopeTables,
} from "./query-scope-test-utils";

const input = { editionId: "edition-1" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

function guardianAssignmentIds(responsibility: string): string[] {
  const query = kalakritiCenterQueries.guardianAssignments.fn({
    args: input,
    ctx: {
      permissions: ["kalakriti.view"],
      role: "volunteer",
      userId: "actor-user",
    },
  }) as unknown as { ast: ScopeAst };
  const tables: ScopeTables = {
    kalakritiAssignment: [
      {
        centerId: responsibility === "liaison_lead" ? null : "center-a",
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
      {
        editionId: "edition-1",
        id: "actor",
        kind: "volunteer",
        state: "active",
        userId: "actor-user",
      },
      {
        editionId: "edition-1",
        id: "guardian-shared",
        kind: "guardian",
        state: "active",
        userId: "guardian-user",
      },
    ],
    kalakritiGuardianCenter: [
      {
        centerId: "center-a",
        editionId: "edition-1",
        id: "link-a",
        membershipId: "guardian-shared",
      },
      {
        centerId: "center-b",
        editionId: "edition-1",
        id: "link-b",
        membershipId: "guardian-shared",
      },
    ],
  };
  return (tables.kalakritiGuardianCenter ?? [])
    .filter((row) => matchesScope(row, query.ast.where, tables))
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
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

    expect(ast).toContain('"alias":"scanStages"');
    expect(ast).toContain('"table":"kalakritiCenterScanStage"');
    expect(ast).toContain('"table":"kalakritiGuardianCenter"');
    expect(ast).toContain('"table":"kalakritiAssignment"');
    expect(ast).toContain('"value":"guardian-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"liaison"');
    expect(ast).toContain('"value":"overall_events_lead"');
    expect(ast).toContain('"value":"liaison_lead"');
    expect(ast).toContain('"value":"center_liaison_lead"');
    expect(ast).toContain('"value":"competition_category_lead"');
    expect(ast).toContain('"value":"competition_coordinator"');
  });

  it("grants transport-only Center discovery without broadening registration datasets", () => {
    const query = kalakritiCenterQueries.visible.fn({
      args: input,
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "transport-user",
      },
    });
    expect(queryAst(query)).toContain('"value":"transport_lead"');
    const scopedInput = {
      args: { ...input, centerId: "center-1" },
      ctx: {
        permissions: ["kalakriti.view"],
        role: "volunteer",
        userId: "transport-user",
      },
    };
    for (const registrationQuery of [
      kalakritiStudentQueries.visibleByCenter.fn(scopedInput),
      kalakritiEntryQueries.visibleByCenter.fn(scopedInput),
    ]) {
      expect(queryAst(registrationQuery)).not.toContain(
        '"value":"transport_lead"'
      );
      expect(queryAst(registrationQuery)).not.toContain(
        '"value":"transport_coordinator"'
      );
    }
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

  it("allows Volunteer Management roles to view Guardian assignments", () => {
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
    expect(editionAdminAst).toContain(
      '"value":["edition_admin","volunteer_coordinator","volunteer_management_volunteer","liaison_lead","liaison","center_liaison_lead","liaison_volunteer"]'
    );
    expect(liaisonManagerAst).toContain('"value":"edition_admin"');
    expect(liaisonManagerAst).toContain('"value":"volunteer_coordinator"');
  });

  it("returns only the assigned Center link for a Center Liaison", () => {
    expect(guardianAssignmentIds("center_liaison_lead")).toEqual(["link-a"]);
  });

  it("returns every Center link for the Overall Liaison Lead", () => {
    expect(guardianAssignmentIds("liaison_lead")).toEqual(["link-a", "link-b"]);
  });
});
