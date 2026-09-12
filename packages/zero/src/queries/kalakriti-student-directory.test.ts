import { describe, expect, it } from "bun:test";

import { kalakritiStudentQueries } from "./kalakriti-student";
import {
  matchesScope,
  type ScopeAst,
  type ScopeTables,
} from "./query-scope-test-utils";

function query(permissions = ["kalakriti.view"], userId = "actor") {
  return (
    kalakritiStudentQueries.visibleForDirectory.fn({
      args: { editionId: "edition" },
      ctx: { permissions, userId },
    } as never) as unknown as { ast: ScopeAst }
  ).ast;
}
function ids(ast: ScopeAst, tables: ScopeTables) {
  return (tables[ast.table] ?? [])
    .filter((row) => matchesScope(row, ast.where, tables))
    .map((row) => row.id)
    .sort();
}
function fixture(kind = "guardian", role = "liaison"): ScopeTables {
  return {
    kalakritiEdition: [{ id: "edition", lifecycle: "live" }],
    kalakritiStudent: [
      ...["a", "b", "c"].map((centerId) => ({
        id: `student-${centerId}`,
        editionId: "edition",
        centerId,
        createdBy: "another-guardian",
      })),
      { id: "foreign", editionId: "other", centerId: "a" },
    ],
    kalakritiCenter: ["a", "b", "c"].map((id) => ({
      id,
      editionId: "edition",
    })),
    kalakritiEditionMembership: [
      {
        id: "membership",
        editionId: "edition",
        userId: "actor",
        kind,
        state: "active",
      },
    ],
    kalakritiGuardianCenter:
      kind === "guardian"
        ? ["a", "b"].map((centerId) => ({
            id: `guardian-${centerId}`,
            editionId: "edition",
            centerId,
            membershipId: "membership",
          }))
        : [],
    kalakritiAssignment:
      kind === "volunteer"
        ? role === "liaison"
          ? ["a", "b"].map((centerId) => ({
              id: `assignment-${centerId}`,
              editionId: "edition",
              centerId,
              membershipId: "membership",
              responsibility: role,
            }))
          : [
              {
                id: "assignment",
                editionId: "edition",
                centerId: null,
                membershipId: "membership",
                responsibility: role,
              },
            ]
        : [],
  };
}

describe("Student directory authorized Center union", () => {
  it.each(["guardian", "volunteer"])(
    "returns all A+B Students for %s, regardless of creator, excluding C",
    (kind) => {
      expect(ids(query(), fixture(kind))).toEqual(["student-a", "student-b"]);
    }
  );
  it.each(["edition_admin", "liaison_lead"])(
    "preserves %s all-Center registration access",
    (role) => {
      expect(ids(query(), fixture("volunteer", role))).toEqual([
        "student-a",
        "student-b",
        "student-c",
      ]);
    }
  );
  it("preserves global-admin scope without membership or coarse view", () => {
    expect(ids(query(["kalakriti.admin"], "admin"), fixture())).toEqual([
      "student-a",
      "student-b",
      "student-c",
    ]);
  });
  it.each(["guardian", "volunteer"])(
    "denies unassigned %s and inactive membership",
    (kind) => {
      const tables = fixture(kind);
      tables.kalakritiGuardianCenter = [];
      tables.kalakritiAssignment = [];
      expect(ids(query(), tables)).toEqual([]);
      const inactive = fixture(kind);
      inactive.kalakritiEditionMembership![0]!.state = "archived";
      expect(ids(query(), inactive)).toEqual([]);
    }
  );
  it.each(["food_lead", "transport_lead", "competition_coordinator"])(
    "does not expand %s to the Student directory",
    (role) => {
      expect(ids(query(), fixture("volunteer", role))).toEqual([]);
    }
  );
  it("denies absent identity and missing coarse access", () => {
    expect(ids(query([], "actor"), fixture())).toEqual([]);
    expect(ids(query(["kalakriti.view"], "unknown"), fixture())).toEqual([]);
    const ast = (
      kalakritiStudentQueries.visibleForDirectory.fn({
        args: { editionId: "edition" },
        ctx: null,
      } as never) as unknown as { ast: ScopeAst }
    ).ast;
    expect(ids(ast, fixture())).toEqual([]);
  });
  it.each(["guardian", "volunteer"])(
    "rejects cross-Edition or wrong-kind %s links",
    (kind) => {
      const tables = fixture(kind);
      tables.kalakritiEditionMembership![0]!.editionId = "other";
      expect(ids(query(), tables)).toEqual([]);
      const links = fixture(kind);
      for (const row of links[
        kind === "guardian" ? "kalakritiGuardianCenter" : "kalakritiAssignment"
      ]!)
        row.editionId = "other";
      expect(ids(query(), links)).toEqual([]);
      const wrongKind = fixture(kind);
      wrongKind.kalakritiEditionMembership![0]!.kind =
        kind === "guardian" ? "volunteer" : "guardian";
      expect(ids(query(), wrongKind)).toEqual([]);
    }
  );
  it("preserves the existing scoped historical-Edition read policy", () => {
    const tables = fixture();
    tables.kalakritiEdition![0]!.lifecycle = "archived";
    expect(ids(query(), tables)).toEqual(["student-a", "student-b"]);
  });
  it("keeps related operations transport-only and both relation sets Edition-scoped", () => {
    const ast = query();
    const tables = fixture();
    const operations = ast.related!.find(
      (relation) => relation.subquery.alias === "operations"
    )!.subquery;
    tables.kalakritiOperation = [
      { id: "arrival", type: "venue_arrival", editionId: "edition" },
      {
        id: "attendance",
        type: "competition_attendance",
        editionId: "edition",
      },
      { id: "meal", type: "breakfast", editionId: "edition" },
      { id: "foreign", type: "pickup", editionId: "other" },
    ];
    expect(ids(operations, tables)).toEqual(["arrival"]);
    const entries = ast.related!.find(
      (relation) => relation.subquery.alias === "entryMemberships"
    )!.subquery;
    tables.kalakritiEntryMember = [
      { id: "entry", editionId: "edition" },
      { id: "foreign", editionId: "other" },
    ];
    expect(ids(entries, tables)).toEqual(["entry"]);
    expect(
      ast.related!.some((relation) => relation.subquery.alias === "center")
    ).toBe(true);
  });
});
