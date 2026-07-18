import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());

vi.mock("@pi-dash/db", () => ({ db: { select } }));

import { resolveKalakritiScheduleRecipients } from "./kalakriti-notification-recipients";

function queryReturning<T>(rows: T[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(async () => rows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  return query;
}

describe("Kalakriti schedule recipient resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates affected Center Guardians and assigned Competition staff", async () => {
    select
      .mockReturnValueOnce(
        queryReturning([{ competitionCategoryId: "category-1" }])
      )
      .mockReturnValueOnce(
        queryReturning([
          { userId: "guardian-2" },
          { userId: "guardian-1" },
          { userId: null },
        ])
      )
      .mockReturnValueOnce(
        queryReturning([{ userId: "volunteer-1" }, { userId: "guardian-1" }])
      );

    await expect(
      resolveKalakritiScheduleRecipients({
        centerIds: ["center-1"],
        competitionIds: ["competition-1"],
        editionId: "edition-1",
      })
    ).resolves.toEqual(["guardian-1", "guardian-2", "volunteer-1"]);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("does not broaden an empty impact to all Edition members", async () => {
    await expect(
      resolveKalakritiScheduleRecipients({
        centerIds: [],
        competitionIds: [],
        editionId: "edition-1",
      })
    ).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
