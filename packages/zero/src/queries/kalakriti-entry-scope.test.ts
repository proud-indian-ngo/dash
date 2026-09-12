import { describe, expect, it } from "bun:test";

import { kalakritiEntryQueries } from "./kalakriti-entry";
import { kalakritiStudentQueries } from "./kalakriti-student";
import {
  matchesScope,
  type ScopeAst,
  type ScopeTables,
} from "./query-scope-test-utils";

function query(
  name: keyof typeof kalakritiEntryQueries,
  extra: Record<string, string> = {},
  permissions = ["kalakriti.view"]
) {
  return (
    kalakritiEntryQueries[name].fn({
      args: { editionId: "edition", ...extra },
      ctx: { userId: "actor-user", permissions },
    } as never) as unknown as { ast: ScopeAst }
  ).ast;
}
function visibleIds(ast: ScopeAst, tables: ScopeTables) {
  return (tables[ast.table] ?? [])
    .filter((row) => matchesScope(row, ast.where, tables))
    .map((row) => row.id)
    .sort();
}
function fixture(kind = "guardian", responsibility = "liaison"): ScopeTables {
  return {
    kalakritiEdition: [{ id: "edition" }],
    kalakritiCenter: ["a", "b", "c"].map((id) => ({
      id,
      editionId: "edition",
    })),
    kalakritiStudent: ["a", "b", "c"].map((centerId) => ({
      id: `student-${centerId}`,
      centerId,
      editionId: "edition",
      createdBy: "another-guardian",
    })),
    kalakritiCompetitionEntry: ["a", "b", "c"].map((centerId) => ({
      id: `entry-${centerId}`,
      centerId,
      editionId: "edition",
      divisionId: centerId === "c" ? "division-other" : "division",
      createdBy: "another-guardian",
    })),
    kalakritiCompetitionDivision: [
      {
        id: "division",
        editionId: "edition",
        competitionId: "competition",
        isActive: true,
      },
      {
        id: "division-other",
        editionId: "edition",
        competitionId: "other",
        isActive: true,
      },
      {
        id: "division-empty",
        editionId: "edition",
        competitionId: "competition",
        isActive: true,
      },
    ],
    kalakritiCompetition: ["competition", "other"].map((id) => ({
      id,
      editionId: "edition",
      cancelledAt: null,
      retiredAt: null,
      competitionCategoryId: "category",
    })),
    kalakritiCompetitionCategory: [
      { id: "category", editionId: "edition", retiredAt: null },
    ],
    kalakritiCompetitionSession: [
      "division",
      "division-other",
      "division-empty",
    ].map((divisionId) => ({
      id: `session-${divisionId}`,
      divisionId,
      editionId: "edition",
      cancelledAt: null,
      venueId: "venue",
    })),
    kalakritiVenue: [{ id: "venue", editionId: "edition", retiredAt: null }],
    kalakritiEditionMembership: [
      {
        id: "actor",
        editionId: "edition",
        userId: "actor-user",
        kind,
        state: "active",
      },
    ],
    kalakritiGuardianCenter:
      kind === "guardian"
        ? ["a", "b"].map((centerId) => ({
            id: `guardian-${centerId}`,
            membershipId: "actor",
            centerId,
            editionId: "edition",
          }))
        : [],
    kalakritiAssignment:
      kind === "volunteer"
        ? responsibility === "liaison"
          ? ["a", "b"].map((centerId) => ({
              id: `liaison-${centerId}`,
              membershipId: "actor",
              centerId,
              editionId: "edition",
              responsibility,
            }))
          : [
              {
                id: "assignment",
                membershipId: "actor",
                centerId: null,
                editionId: "edition",
                responsibility,
                competitionId: "competition",
              },
            ]
        : [],
  };
}

describe("Center-agnostic Entry read scope", () => {
  it.each(["guardian", "volunteer"])(
    "returns all Entries and Students in the %s assigned Center union",
    (kind) => {
      const tables = fixture(kind);
      expect(visibleIds(query("visible"), tables)).toEqual([
        "entry-a",
        "entry-b",
      ]);
      const students = (
        kalakritiStudentQueries.visibleForEntries.fn({
          args: { editionId: "edition" },
          ctx: { userId: "actor-user", permissions: ["kalakriti.view"] },
        } as never) as unknown as { ast: ScopeAst }
      ).ast;
      expect(visibleIds(students, tables)).toEqual(["student-a", "student-b"]);
      expect(visibleIds(query("byId", { id: "entry-b" }), tables)).toEqual([
        "entry-b",
      ]);
      expect(visibleIds(query("byId", { id: "entry-c" }), tables)).toEqual([]);
      expect(
        visibleIds(query("visibleByCenter", { centerId: "c" }), tables)
      ).toEqual([]);
    }
  );
  it("keeps available divisions with zero Entries without requiring a selected Center", () => {
    expect(visibleIds(query("availableDivisions"), fixture())).toEqual([
      "division",
      "division-empty",
      "division-other",
    ]);
  });
  it.each(["competition_coordinator"])(
    "preserves parent-Competition %s read access without broadening it",
    (role) => {
      const tables = fixture("volunteer", role);
      expect(visibleIds(query("visible"), tables)).toEqual([
        "entry-a",
        "entry-b",
      ]);
      expect(visibleIds(query("availableDivisions"), tables)).toEqual([
        "division",
        "division-empty",
      ]);
      expect(visibleIds(query("byId", { id: "entry-c" }), tables)).toEqual([]);
    }
  );
  it("does not grant new Entry access to Competition Volunteers", () => {
    const tables = fixture("volunteer", "competition_volunteer");
    expect(visibleIds(query("visible"), tables)).toEqual([]);
    expect(visibleIds(query("availableDivisions"), tables)).toEqual([]);
  });
  it.each(["archived", "wrong-edition"])(
    "rejects %s Guardian scope",
    (invalid) => {
      const tables = fixture();
      if (invalid === "archived")
        tables.kalakritiEditionMembership![0]!.state = "archived";
      else
        tables.kalakritiGuardianCenter!.forEach((row) => {
          row.editionId = "other";
        });
      expect(visibleIds(query("visible"), tables)).toEqual([]);
      expect(visibleIds(query("availableDivisions"), tables)).toEqual([]);
    }
  );
  it.each(["visible", "availableDivisions", "byId"] as const)(
    "denies %s without coarse access",
    (name) => {
      expect(
        visibleIds(
          query(name, name === "byId" ? { id: "entry-a" } : {}, []),
          fixture()
        )
      ).toEqual([]);
    }
  );
  it("binds detail Entries to the actual session of the requested Division and retains Center scope", () => {
    const tables = fixture();
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division",
        }),
        tables
      )
    ).toEqual(["entry-a", "entry-b"]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division-other",
        }),
        tables
      )
    ).toEqual([]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "division",
        }),
        tables
      )
    ).toEqual([]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division-other",
          sessionId: "session-division-other",
        }),
        tables
      )
    ).toEqual([]);
    tables.kalakritiCompetitionSession!.find(
      (session) => session.id === "session-division"
    )!.editionId = "other";
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division",
        }),
        tables
      )
    ).toEqual([]);
  });
  it("retains readable detail Entries after session and Competition cancellation", () => {
    const tables = fixture("volunteer", "competition_coordinator");
    tables.kalakritiCompetitionSession!.find(
      (session) => session.id === "session-division"
    )!.cancelledAt = "cancelled";
    tables.kalakritiCompetition!.find(
      (competition) => competition.id === "competition"
    )!.cancelledAt = "cancelled";
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division",
        }),
        tables
      )
    ).toEqual(["entry-a", "entry-b"]);
  });
  it("combines authorized Center and Competition scope for mixed-role readers", () => {
    const tables = fixture("volunteer", "competition_coordinator");
    tables.kalakritiAssignment!.push({
      id: "center-role",
      membershipId: "actor",
      centerId: "c",
      editionId: "edition",
      responsibility: "liaison",
    });
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division",
        }),
        tables
      )
    ).toEqual(["entry-a", "entry-b"]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division-other",
          sessionId: "session-division-other",
        }),
        tables
      )
    ).toEqual(["entry-c"]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division",
          sessionId: "session-division-other",
        }),
        tables
      )
    ).toEqual([]);
  });
  it("withholds the same Student's other-Competition attendance from a Competition-scoped reader", () => {
    const ast = query("visibleByDivision", {
      divisionId: "division",
      sessionId: "session-division",
    });
    const student = ast
      .related!.find((relation) => relation.subquery.alias === "members")!
      .subquery.related!.find(
        (relation) => relation.subquery.alias === "student"
      )!.subquery;
    const operations = student.related!.find(
      (relation) => relation.subquery.alias === "operations"
    )!.subquery;
    const tables = fixture("volunteer", "competition_coordinator");
    tables.kalakritiCompetitionEntry!.push({
      id: "other-competition-entry",
      centerId: "a",
      editionId: "edition",
      divisionId: "division-other",
    });
    tables.kalakritiEntryMember = ["entry-a", "other-competition-entry"].map(
      (entryId) => ({
        id: `member-${entryId}`,
        entryId,
        studentId: "student-a",
        editionId: "edition",
      })
    );
    expect(visibleIds(ast, tables)).toEqual(["entry-a", "entry-b"]);
    expect(
      visibleIds(
        query("visibleByDivision", {
          divisionId: "division-other",
          sessionId: "session-division-other",
        }),
        tables
      )
    ).toEqual([]);
    const mark = {
      studentId: "student-a",
      editionId: "edition",
      type: "competition_attendance",
      competitionSessionId: "session-division",
      supersededByOperationId: null,
    };
    tables.kalakritiOperation = [
      { ...mark, id: "attended" },
      { ...mark, id: "superseded", supersededByOperationId: "replacement" },
      {
        ...mark,
        id: "wrong-session",
        competitionSessionId: "session-division-other",
      },
      { ...mark, id: "wrong-edition", editionId: "other" },
      {
        ...mark,
        id: "arrival",
        type: "venue_arrival",
        competitionSessionId: null,
      },
      { ...mark, id: "meal", type: "breakfast", competitionSessionId: null },
    ];
    expect(visibleIds(operations, tables)).toEqual([
      "arrival",
      "attended",
      "superseded",
    ]);
  });
  it("includes Center labels and Edition-scoped historical venue-arrival marks", () => {
    const ast = query("visible");
    expect(
      ast.related!.some((related) => related.subquery.alias === "center")
    ).toBe(true);
    const student = ast
      .related!.find((related) => related.subquery.alias === "members")!
      .subquery.related!.find(
        (related) => related.subquery.alias === "student"
      )!.subquery;
    expect(
      student.related!.some((related) => related.subquery.alias === "center")
    ).toBe(true);
    const operations = student.related!.find(
      (related) => related.subquery.alias === "operations"
    )!.subquery;
    expect(JSON.stringify(operations.where)).toContain(
      '"value":"venue_arrival"'
    );
    expect(JSON.stringify(operations.where)).toContain('"value":"edition"');
  });
});
