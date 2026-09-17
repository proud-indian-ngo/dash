import { describe, expect, it } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import { getKalakritiCompetitionStatusesForAccess } from "./kalakriti-competition-status";

const database = {
  select: () => {
    throw new Error("Denied status requests must not query the database");
  },
} as never;

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
});
