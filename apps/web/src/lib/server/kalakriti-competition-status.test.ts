import { describe, expect, it, mock } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import { getKalakritiCompetitionStatusesForAccess } from "./kalakriti-competition-status";

const database = {
  select: () => {
    throw new Error("Denied status requests must not query the database");
  },
} as never;

function emptyDatabase() {
  return {
    select: mock(() => {
      const query = {
        from: mock(),
        innerJoin: mock(),
        leftJoin: mock(),
        where: mock(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve([]).then(resolve),
      };
      query.from.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.leftJoin.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return query;
    }),
  };
}

function access(
  responsibility: string,
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
          centerId: null,
          competitionCategoryId: null,
          competitionId: null,
        },
      ],
    },
  } as KalakritiEditionAccess;
}

describe("Competition status data access", () => {
  it("denies a scan-only Competition Volunteer before querying", async () => {
    expect(
      await getKalakritiCompetitionStatusesForAccess(
        access("competition_volunteer"),
        0,
        database
      )
    ).toBeNull();
  });

  it("denies an archived nonadministrator before querying", async () => {
    expect(
      await getKalakritiCompetitionStatusesForAccess(
        access("competition_coordinator", "archived"),
        0,
        database
      )
    ).toBeNull();
  });

  it.each(["awards_lead", "awards_member"])(
    "loads Edition-wide statuses for %s",
    async (responsibility) => {
      const currentDatabase = emptyDatabase();
      expect(
        await getKalakritiCompetitionStatusesForAccess(
          access(responsibility),
          0,
          currentDatabase as never
        )
      ).toEqual([]);
      expect(currentDatabase.select).toHaveBeenCalledTimes(3);
    }
  );
});
