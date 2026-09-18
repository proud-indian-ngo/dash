import { describe, expect, it, mock } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import {
  getKalakritiNextSlotsForAccess,
  kalakritiDivisionReadableByScopes,
} from "./kalakriti-performance-order";

const deniedDatabase = {
  select: () => {
    throw new Error("Denied next-slot requests must not query the database");
  },
} as never;

function access(
  responsibility: string,
  assignment: {
    centerId?: string | null;
    competitionCategoryId?: string | null;
    competitionId?: string | null;
  } = {},
  lifecycle: KalakritiEditionAccess["edition"]["lifecycle"] = "live"
): KalakritiEditionAccess {
  return {
    isGlobalAdmin: false,
    edition: { id: "edition-1", lifecycle },
    membership: {
      id: "membership-1",
      kind: "volunteer",
      responsibilities: [responsibility],
      assignments: [
        {
          responsibility,
          centerId: assignment.centerId ?? null,
          competitionCategoryId: assignment.competitionCategoryId ?? null,
          competitionId: assignment.competitionId ?? null,
        },
      ],
    },
  } as KalakritiEditionAccess;
}

function queuedDatabase(responses: unknown[][]) {
  return {
    select: mock(() => {
      const rows = responses.shift() ?? [];
      const query = {
        from: mock(),
        innerJoin: mock(),
        leftJoin: mock(),
        where: mock(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      query.from.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.leftJoin.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    }),
  };
}

describe("next-slot division visibility", () => {
  it("lets a Competition Coordinator read only their assigned Competition", () => {
    expect(
      kalakritiDivisionReadableByScopes(
        [{ kind: "competition", competitionIds: ["dance"] }],
        { competitionId: "dance", competitionCategoryId: "stage" }
      )
    ).toEqual({ centerIds: null });
    expect(
      kalakritiDivisionReadableByScopes(
        [{ kind: "competition", competitionIds: ["dance"] }],
        { competitionId: "painting", competitionCategoryId: "art" }
      )
    ).toBeNull();
  });

  it("limits Center-scoped readers to their Centers", () => {
    expect(
      kalakritiDivisionReadableByScopes(
        [{ kind: "center", centerIds: ["center-a"] }],
        { competitionId: "dance", competitionCategoryId: "stage" }
      )
    ).toEqual({ centerIds: ["center-a"] });
  });
});

describe("next-slot data access", () => {
  it("denies a scan-only Competition Volunteer before querying", async () => {
    expect(
      await getKalakritiNextSlotsForAccess(
        access("competition_volunteer"),
        "11111111-1111-4111-8111-111111111111",
        deniedDatabase
      )
    ).toBeNull();
  });

  it("returns an in-scope Coordinator the Student's next painting slot", async () => {
    const database = queuedDatabase([
      [
        {
          competitionCategoryId: "stage",
          competitionId: "dance",
          endAt: new Date("2026-09-19T05:30:00.000Z"),
        },
      ],
      [{ studentId: "student-a" }, { studentId: "student-b" }],
      [
        {
          competitionName: "Painting",
          startAt: new Date("2026-09-19T05:30:00.000Z"),
          studentId: "student-a",
          venueName: "Hall C",
        },
        {
          competitionName: "Group Dance",
          startAt: new Date("2026-09-19T06:30:00.000Z"),
          studentId: "student-a",
          venueName: "Stage",
        },
      ],
    ]);

    expect(
      await getKalakritiNextSlotsForAccess(
        access("competition_coordinator", { competitionId: "dance" }),
        "11111111-1111-4111-8111-111111111111",
        database as never
      )
    ).toEqual([
      {
        competitionName: "Painting",
        startAt: Date.parse("2026-09-19T05:30:00.000Z"),
        studentId: "student-a",
        venueName: "Hall C",
      },
    ]);
  });

  it("returns an empty list for a Division outside the Coordinator's Competition", async () => {
    const database = queuedDatabase([
      [
        {
          competitionCategoryId: "art",
          competitionId: "painting",
          endAt: new Date("2026-09-19T05:30:00.000Z"),
        },
      ],
    ]);

    expect(
      await getKalakritiNextSlotsForAccess(
        access("competition_coordinator", { competitionId: "dance" }),
        "22222222-2222-4222-8222-222222222222",
        database as never
      )
    ).toEqual([]);
    expect(database.select).toHaveBeenCalledTimes(1);
  });

  it("does not project other members of the next Competition group", async () => {
    const database = queuedDatabase([
      [
        {
          competitionCategoryId: "stage",
          competitionId: "dance",
          endAt: new Date("2026-09-19T05:30:00.000Z"),
        },
      ],
      [{ studentId: "student-a" }],
      [
        {
          competitionName: "Group Dance",
          startAt: new Date("2026-09-19T06:30:00.000Z"),
          studentId: "student-a",
          venueName: "Stage",
        },
      ],
    ]);

    expect(
      await getKalakritiNextSlotsForAccess(
        access("competition_coordinator", { competitionId: "dance" }),
        "11111111-1111-4111-8111-111111111111",
        database as never
      )
    ).toEqual([
      {
        competitionName: "Group Dance",
        startAt: Date.parse("2026-09-19T06:30:00.000Z"),
        studentId: "student-a",
        venueName: "Stage",
      },
    ]);
  });
});
