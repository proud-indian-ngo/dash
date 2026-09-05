import { describe, expect, it } from "bun:test";

import { kalakritiOperationQueries } from "./kalakriti-operation";

const editionId = "edition-1";
const userContext = {
  permissions: [],
  role: "volunteer",
  userId: "operator-1",
};
const anonymousContext = { permissions: [], role: "volunteer", userId: "" };

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

describe("kalakritiOperation queries", () => {
  it.each([
    [
      "student lookup",
      () =>
        kalakritiOperationQueries.studentByHumanId.fn({
          args: { editionId, humanId: "KAL-2027-0001" },
          ctx: anonymousContext,
        }),
    ],
    [
      "volunteer lookup",
      () =>
        kalakritiOperationQueries.volunteerByHumanId.fn({
          args: { editionId, humanId: "KALV-2027-0001" },
          ctx: anonymousContext,
        }),
    ],
    [
      "operation history",
      () =>
        kalakritiOperationQueries.bySubject.fn({
          args: { editionId, studentId: "student-1" },
          ctx: anonymousContext,
        }),
    ],
  ] as const)("denies anonymous %s", (_name, buildQuery) => {
    expect(queryAst(buildQuery())).toContain(
      '"value":"00000000-0000-0000-0000-000000000000"'
    );
  });

  it("lets global administrators query a subject without an Edition membership", () => {
    const ast = queryAst(
      kalakritiOperationQueries.bySubject.fn({
        args: { editionId, studentId: "student-1" },
        ctx: {
          permissions: ["kalakriti.admin"],
          role: "admin",
          userId: "admin-1",
        },
      })
    );

    expect(ast).toContain('"value":"edition-1"');
    expect(ast).toContain('"value":"student-1"');
    expect(ast).not.toContain('"value":"00000000-0000-0000-0000-000000000000"');
    expect(ast).not.toContain('"value":"admin-1"');
  });

  it("scopes student lookup to active volunteer correction assignments", () => {
    const ast = queryAst(
      kalakritiOperationQueries.studentByHumanId.fn({
        args: { editionId, humanId: "KAL-2027-0001" },
        ctx: userContext,
      })
    );

    expect(ast).toContain('"value":"operator-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"volunteer"');
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).toContain('"value":"transport_lead"');
    expect(ast).toContain('"value":"transport_coordinator"');
    expect(ast).toContain('"value":"food_lead"');
    expect(ast).toContain('"value":"competition_coordinator"');
    expect(ast).toContain('"table":"kalakritiCenter"');
    expect(ast).toContain('"table":"kalakritiEntryMember"');
    expect(ast).toContain('"table":"kalakritiCompetition"');
    expect(ast).not.toContain('"value":"liaison"');
    expect(ast).not.toContain('"value":"food_member"');
    expect(ast).not.toContain('"value":"00000000-0000-0000-0000-000000000000"');
  });

  it("limits volunteer lookup to active targets and volunteer correction leads", () => {
    const ast = queryAst(
      kalakritiOperationQueries.volunteerByHumanId.fn({
        args: { editionId, humanId: "KALV-2027-0001" },
        ctx: userContext,
      })
    );

    expect(ast).toContain('"value":"operator-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"volunteer"');
    expect(ast).toContain('"value":"edition_admin"');
    expect(ast).toContain('"value":"food_lead"');
    expect(ast).toContain('"value":"hospitality_lead"');
    expect(ast).not.toContain('"value":"transport_lead"');
    expect(ast).not.toContain('"value":"competition_coordinator"');
    expect(ast).not.toContain('"value":"hospitality_member"');
  });

  it("filters student history by operation type and its matching correction scope", () => {
    const ast = queryAst(
      kalakritiOperationQueries.bySubject.fn({
        args: { editionId, studentId: "student-1" },
        ctx: userContext,
      })
    );

    for (const value of [
      "pickup",
      "venue_departure",
      "drop_off",
      "breakfast",
      "lunch",
      "competition_attendance",
      "edition_admin",
      "transport_lead",
      "transport_coordinator",
      "food_lead",
      "competition_coordinator",
    ]) {
      expect(ast).toContain(`"value":"${value}"`);
    }
    expect(ast).toContain('"table":"kalakritiCenter"');
    expect(ast).toContain('"table":"kalakritiCompetitionSession"');
    expect(ast).not.toContain('"value":"liaison"');
    expect(ast).not.toContain('"value":"food_member"');
  });

  it("filters volunteer history to active targets, meals, and check-in lead scope", () => {
    const ast = queryAst(
      kalakritiOperationQueries.bySubject.fn({
        args: { editionId, membershipId: "membership-1" },
        ctx: userContext,
      })
    );

    expect(ast).toContain('"value":"membership-1"');
    expect(ast).toContain('"value":"active"');
    expect(ast).toContain('"value":"breakfast"');
    expect(ast).toContain('"value":"lunch"');
    expect(ast).toContain('"value":"volunteer_check_in"');
    expect(ast).toContain('"value":"food_lead"');
    expect(ast).toContain('"value":"hospitality_lead"');
    expect(ast).not.toContain('"value":"pickup"');
    expect(ast).not.toContain('"value":"transport_lead"');
    expect(ast).not.toContain('"value":"competition_attendance"');
    expect(ast).not.toContain('"value":"competition_coordinator"');
    expect(ast).not.toContain('"value":"hospitality_member"');
  });

  it("returns no history when no subject is supplied", () => {
    const ast = queryAst(
      kalakritiOperationQueries.bySubject.fn({
        args: { editionId },
        ctx: userContext,
      })
    );

    expect(ast).toContain('"value":"00000000-0000-0000-0000-000000000000"');
  });
});
