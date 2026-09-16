import { describe, expect, it } from "vitest";

import {
  assertKalakritiFinalOrder,
  canManageKalakritiResults,
  rankKalakritiCenters,
} from "./kalakriti-results";

const centers = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];
const points = { winnerPoints: 10, runnerUpPoints: 5 };

describe("Kalakriti Center standings", () => {
  it("awards once per entry, including same-Center awards, and retains zero-point Centers", () => {
    expect(
      rankKalakritiCenters(
        centers,
        [
          { winnerCenterId: "a", runnerUpCenterId: "a" },
          { winnerCenterId: "b", runnerUpCenterId: "a" },
        ],
        points
      )
    ).toEqual([
      { ...centers[0], points: 20, wins: 1, runnerUps: 2, rank: 1 },
      { ...centers[1], points: 10, wins: 1, runnerUps: 0, rank: 2 },
      { ...centers[2], points: 0, wins: 0, runnerUps: 0, rank: 3 },
    ]);
  });

  it("uses wins to break point ties and preserves tied ranks", () => {
    const standing = rankKalakritiCenters(
      centers,
      [
        { winnerCenterId: "a", runnerUpCenterId: "b" },
        { winnerCenterId: "c", runnerUpCenterId: "b" },
      ],
      points
    );
    expect(
      standing.map((row) => [row.id, row.points, row.wins, row.rank])
    ).toEqual([
      ["a", 10, 1, 1],
      ["c", 10, 1, 1],
      ["b", 10, 0, 3],
    ]);
    expect(
      rankKalakritiCenters(centers, [], points).map((row) => row.rank)
    ).toEqual([1, 1, 1]);
  });

  it("requires a reason for an overall tie and enforces standings order", () => {
    const tied = rankKalakritiCenters(
      centers,
      [
        { winnerCenterId: "a", runnerUpCenterId: "c" },
        { winnerCenterId: "b", runnerUpCenterId: "c" },
      ],
      points
    );
    expect(() => assertKalakritiFinalOrder(tied, "a", "b", null)).toThrow(
      "reason"
    );
    expect(() =>
      assertKalakritiFinalOrder(tied, "a", "b", "Panel tie-break")
    ).not.toThrow();
    expect(() =>
      assertKalakritiFinalOrder(tied, "c", "a", "Panel tie-break")
    ).toThrow("standings order");
    expect(() =>
      assertKalakritiFinalOrder(tied, "a", "a", "Panel tie-break")
    ).toThrow("distinct");
  });

  it("limits scoped results management to assigned competitions and categories", () => {
    const competition = {
      id: "competition",
      competitionCategoryId: "category",
    };
    const access = (
      kind: string,
      responsibility: string,
      competitionId: string | null,
      competitionCategoryId: string | null
    ) => ({
      isGlobalAdmin: false,
      membership: {
        kind,
        assignments: [{ responsibility, competitionId, competitionCategoryId }],
      },
    });
    expect(
      canManageKalakritiResults(
        { isGlobalAdmin: true, membership: null },
        competition
      )
    ).toBe(true);
    expect(
      canManageKalakritiResults(
        access("volunteer", "competition_coordinator", "competition", null),
        competition
      )
    ).toBe(true);
    expect(
      canManageKalakritiResults(
        access("volunteer", "competition_category_lead", null, "category"),
        competition
      )
    ).toBe(true);
    expect(
      canManageKalakritiResults(
        access("volunteer", "overall_events_lead", null, null)
      )
    ).toBe(true);
    expect(
      canManageKalakritiResults(
        access("volunteer", "edition_admin", null, null)
      )
    ).toBe(true);
    expect(
      canManageKalakritiResults(
        access("guardian", "overall_events_lead", null, null),
        competition
      )
    ).toBe(false);
    expect(
      canManageKalakritiResults(
        access("volunteer", "competition_coordinator", "other", null),
        competition
      )
    ).toBe(false);
    expect(
      canManageKalakritiResults(
        access("volunteer", "competition_category_lead", null, "other"),
        competition
      )
    ).toBe(false);
    expect(
      canManageKalakritiResults(
        access("volunteer", "competition_coordinator", "competition", null)
      )
    ).toBe(false);
  });
});
