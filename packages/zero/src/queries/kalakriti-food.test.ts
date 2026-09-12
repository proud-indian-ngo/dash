import { describe, expect, it } from "bun:test";

import { kalakritiFoodQueries } from "./kalakriti-food";
import {
  matchesScope as matches,
  type ScopeAst as Ast,
  type ScopeRow as Row,
  type ScopeTables as Tables,
} from "./query-scope-test-utils";
function ast(
  name: keyof typeof kalakritiFoodQueries,
  permissions = ["kalakriti.view"]
) {
  return (
    kalakritiFoodQueries[name].fn({
      args: { editionId: "edition" },
      ctx: { userId: "actor-user", permissions },
    } as never) as unknown as { ast: Ast }
  ).ast;
}
function ids(query: Ast, tables: Tables) {
  return (tables[query.table] ?? [])
    .filter((row) => matches(row, query.where, tables))
    .map((row) => row.id)
    .sort();
}
function fixture(kind = "guardian", responsibility = "liaison") {
  const member = (
    id: string,
    memberKind: string,
    state = "active",
    editionId = "edition"
  ): Row => ({ id, editionId, kind: memberKind, state, userId: `${id}-user` });
  const assignment = (
    membershipId: string,
    centerId: string | null,
    role = "liaison"
  ): Row => ({
    id: `${membershipId}-${centerId}`,
    membershipId,
    centerId,
    editionId: "edition",
    responsibility: role,
  });
  const guardianCenter = (membershipId: string, centerId: string): Row => ({
    id: `${membershipId}-${centerId}`,
    membershipId,
    centerId,
    editionId: "edition",
  });
  const tables: Tables = {
    kalakritiEdition: [{ id: "edition" }, { id: "other" }],
    kalakritiCenter: ["a", "b", "c"].map((id) => ({
      id,
      editionId: "edition",
    })),
    kalakritiStudent: [
      ...["a", "b", "c"].map((centerId) => ({
        id: `student-${centerId}`,
        centerId,
        editionId: "edition",
        createdBy: "another-user",
      })),
      { id: "foreign", centerId: "a", editionId: "other" },
    ],
    kalakritiEditionMembership: [
      member("actor", kind),
      member("volunteer-a", "volunteer"),
      member("guardian-b", "guardian"),
      member("guardian-ac", "guardian"),
      member("volunteer-c", "volunteer"),
      member("unscoped", "volunteer"),
      member("archived", "guardian", "archived"),
      member("foreign", "guardian", "active", "other"),
    ],
    kalakritiAssignment: [
      assignment("volunteer-a", "a"),
      assignment("volunteer-c", "c"),
      ...(kind === "volunteer"
        ? responsibility === "liaison"
          ? [assignment("actor", "a"), assignment("actor", "b")]
          : [assignment("actor", null, responsibility)]
        : []),
    ],
    kalakritiGuardianCenter: [
      guardianCenter("guardian-b", "b"),
      guardianCenter("guardian-ac", "a"),
      guardianCenter("guardian-ac", "c"),
      guardianCenter("archived", "a"),
      guardianCenter("foreign", "a"),
      ...(kind === "guardian"
        ? [guardianCenter("actor", "a"), guardianCenter("actor", "b")]
        : []),
    ],
    kalakritiOperation: [],
  };
  return tables;
}

describe("Food roster authorization", () => {
  it.each(["guardian", "volunteer"])(
    "uses the %s assigned Center union without leaking unscoped Volunteers",
    (kind) => {
      const tables = fixture(kind);
      expect(ids(ast("students"), tables)).toEqual(["student-a", "student-b"]);
      expect(ids(ast("memberships"), tables)).toEqual([
        "actor",
        "guardian-ac",
        "guardian-b",
        "volunteer-a",
      ]);
    }
  );
  it.each(["food_lead", "food_member", "edition_admin"])(
    "lets active %s read registered but not-yet-eligible subjects Edition-wide",
    (role) => {
      const tables = fixture("volunteer", role);
      expect(ids(ast("students"), tables)).toEqual([
        "student-a",
        "student-b",
        "student-c",
      ]);
      expect(ids(ast("memberships"), tables)).toContain("unscoped");
      expect(ids(ast("memberships"), tables)).not.toContain("foreign");
      expect(ids(ast("memberships"), tables)).not.toContain("archived");
    }
  );
  it.each([
    ["volunteer", "food_member"],
    ["guardian", "liaison"],
    ["volunteer", "liaison"],
    ["volunteer", "liaison_lead"],
  ])(
    "denies archived Edition reads with still-active %s/%s membership",
    (kind, role) => {
      const tables = fixture(kind, role);
      tables.kalakritiEdition![0]!.lifecycle = "archived";
      expect(ids(ast("students"), tables)).toEqual([]);
      expect(ids(ast("memberships"), tables)).toEqual([]);
    }
  );
  it("retains global-admin archived Edition history", () => {
    const tables = fixture();
    tables.kalakritiEdition![0]!.lifecycle = "archived";
    expect(ids(ast("students", ["kalakriti.admin"]), tables)).toHaveLength(3);
    expect(ids(ast("memberships", ["kalakriti.admin"]), tables)).toContain(
      "unscoped"
    );
  });
  it("keeps global-admin access without requiring an Edition membership", () => {
    const tables = fixture();
    tables.kalakritiEditionMembership =
      tables.kalakritiEditionMembership!.filter((row) => row.id !== "actor");
    expect(ids(ast("students", ["kalakriti.admin"]), tables)).toHaveLength(3);
  });
  it("gives Overall Liaison Leads all Center-linked people without exposing unassigned people", () => {
    const tables = fixture("volunteer", "liaison_lead");
    tables.kalakritiEditionMembership!.push({
      id: "unassigned-guardian",
      editionId: "edition",
      kind: "guardian",
      state: "active",
      userId: "unassigned-user",
    });
    expect(ids(ast("students"), tables)).toEqual([
      "student-a",
      "student-b",
      "student-c",
    ]);
    expect(ids(ast("memberships"), tables)).toEqual([
      "guardian-ac",
      "guardian-b",
      "volunteer-a",
      "volunteer-c",
    ]);
    const centers = ast("memberships").related!.find(
      (relation) => relation.subquery.alias === "guardianCenters"
    )!.subquery;
    expect(
      tables
        .kalakritiGuardianCenter!.filter(
          (row) =>
            row.membershipId === "guardian-ac" &&
            matches(row, centers.where, tables)
        )
        .map((row) => row.centerId)
    ).toEqual(["a", "c"]);
  });
  it.each(["archived", "wrong-edition", "guardian"])(
    "rejects invalid %s Overall Liaison Lead authority",
    (invalid) => {
      const tables = fixture("volunteer", "liaison_lead");
      if (invalid === "archived")
        tables.kalakritiEditionMembership![0]!.state = "archived";
      else if (invalid === "guardian")
        tables.kalakritiEditionMembership![0]!.kind = "guardian";
      else
        tables.kalakritiAssignment!.find(
          (row) => row.membershipId === "actor"
        )!.editionId = "other";
      expect(ids(ast("students"), tables)).toEqual([]);
      expect(ids(ast("memberships"), tables)).toEqual(
        invalid === "guardian" ? ["actor"] : []
      );
    }
  );
  it.each(["hospitality_member", "transport_lead", "competition_volunteer"])(
    "does not grant %s unrelated Food access",
    (role) => {
      const tables = fixture("volunteer", role);
      expect(ids(ast("students"), tables)).toEqual([]);
      expect(ids(ast("memberships"), tables)).toEqual([]);
    }
  );
  it("combines Food responsibility with other roles additively", () => {
    const tables = fixture("volunteer", "hospitality_member");
    tables.kalakritiAssignment!.push({
      id: "food",
      editionId: "edition",
      membershipId: "actor",
      centerId: null,
      responsibility: "food_member",
    });
    expect(ids(ast("students"), tables)).toHaveLength(3);
  });
  it("lets an unassigned active Guardian see only their own meal row", () => {
    const tables = fixture();
    tables.kalakritiGuardianCenter = tables.kalakritiGuardianCenter!.filter(
      (row) => row.membershipId !== "actor"
    );
    expect(ids(ast("students"), tables)).toEqual([]);
    expect(ids(ast("memberships"), tables)).toEqual(["actor"]);
  });
  it.each(["state", "editionId"])(
    "denies an actor with an invalid %s",
    (field) => {
      const tables = fixture();
      tables.kalakritiEditionMembership![0]![field] =
        field === "state" ? "archived" : "other";
      expect(ids(ast("students"), tables)).toEqual([]);
      expect(ids(ast("memberships"), tables)).toEqual([]);
    }
  );
  it("requires coarse view permission even with active Food assignments", () => {
    const tables = fixture("volunteer", "food_member");
    expect(ids(ast("students", []), tables)).toEqual([]);
    expect(ids(ast("memberships", []), tables)).toEqual([]);
  });
  it("does not expose unrelated Center relations of a visible Guardian", () => {
    const query = ast("memberships").related!.find(
      (relation) => relation.subquery.alias === "guardianCenters"
    )!.subquery;
    const tables = fixture();
    expect(
      tables
        .kalakritiGuardianCenter!.filter(
          (row) =>
            row.membershipId === "guardian-ac" &&
            matches(row, query.where, tables)
        )
        .map((row) => row.centerId)
    ).toEqual(["a"]);
  });
  it("filters a shared Volunteer A+C to authorized Center relations and omits unscoped Competition assignments", () => {
    const tables = fixture();
    tables.kalakritiAssignment!.push(
      {
        id: "outside",
        membershipId: "volunteer-a",
        centerId: "c",
        editionId: "edition",
        responsibility: "liaison",
      },
      {
        id: "competition",
        membershipId: "volunteer-a",
        centerId: null,
        editionId: "edition",
        responsibility: "competition_volunteer",
      }
    );
    const related = (permissions?: string[]) =>
      ast("memberships", permissions).related!.find(
        (relation) => relation.subquery.alias === "assignments"
      )!.subquery;
    const visibleCenters = (query: Ast) =>
      tables
        .kalakritiAssignment!.filter(
          (row) =>
            row.membershipId === "volunteer-a" &&
            matches(row, query.where, tables)
        )
        .map((row) => row.centerId)
        .sort();
    expect(visibleCenters(related())).toEqual(["a"]);
    expect(visibleCenters(related(["kalakriti.admin"]))).toEqual(["a", "c"]);
  });
  it("retains scoped effective meal history for archived subjects without including all archived registrations", () => {
    const tables = fixture();
    tables.kalakritiOperation!.push({
      id: "meal",
      editionId: "edition",
      membershipId: "archived",
      type: "breakfast",
      supersededByOperationId: null,
    });
    expect(ids(ast("memberships"), tables)).toContain("archived");
    tables.kalakritiOperation![0]!.supersededByOperationId = "replacement";
    expect(ids(ast("memberships"), tables)).not.toContain("archived");
  });
  it("does not grant subject visibility through wrong-kind Center links", () => {
    const tables = fixture();
    tables.kalakritiGuardianCenter!.push({
      id: "wrong-volunteer-link",
      membershipId: "unscoped",
      centerId: "a",
      editionId: "edition",
    });
    tables.kalakritiEditionMembership!.push({
      id: "unassigned-guardian",
      kind: "guardian",
      state: "active",
      userId: "other-user",
      editionId: "edition",
    });
    tables.kalakritiAssignment!.push({
      id: "wrong-guardian-link",
      membershipId: "unassigned-guardian",
      centerId: "a",
      editionId: "edition",
      responsibility: "liaison",
    });
    expect(ids(ast("memberships"), tables)).not.toContain("unscoped");
    expect(ids(ast("memberships"), tables)).not.toContain(
      "unassigned-guardian"
    );
    expect(ids(ast("memberships", ["kalakriti.admin"]), tables)).toContain(
      "unscoped"
    );
    expect(ids(ast("memberships", ["kalakriti.admin"]), tables)).toContain(
      "unassigned-guardian"
    );
  });
  it("ignores cross-Edition Center assignment links", () => {
    const tables = fixture("volunteer");
    tables
      .kalakritiAssignment!.filter((row) => row.membershipId === "actor")
      .forEach((row) => {
        row.editionId = "other";
      });
    expect(ids(ast("students"), tables)).toEqual([]);
    expect(ids(ast("memberships"), tables)).toEqual([]);
  });
});
