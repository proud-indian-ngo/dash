import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());
const filterCalls = vi.hoisted(() => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({ db: { select } }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (...args: Parameters<typeof actual.eq>) => {
      filterCalls.eq(...args);
      return actual.eq(...args);
    },
    inArray: (...args: Parameters<typeof actual.inArray>) => {
      filterCalls.inArray(...args);
      return actual.inArray(...args);
    },
    isNotNull: (...args: Parameters<typeof actual.isNotNull>) => {
      filterCalls.isNotNull(...args);
      return actual.isNotNull(...args);
    },
  };
});

import {
  resolveKalakritiRegistrationRecipients,
  resolveKalakritiScheduleRecipients,
} from "./kalakriti-notification-recipients";

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

  it("selects active Guardians and assigned volunteers from the requested Edition", async () => {
    select
      .mockReturnValueOnce(
        queryReturning([
          { userId: "guardian-1" },
          { userId: "shared-recipient" },
          { userId: null },
        ])
      )
      .mockReturnValueOnce(
        queryReturning([
          { userId: "volunteer-1" },
          { userId: "shared-recipient" },
          { userId: null },
        ])
      );

    await expect(
      resolveKalakritiRegistrationRecipients("edition-1")
    ).resolves.toEqual(["guardian-1", "shared-recipient", "volunteer-1"]);
    expect(filterCalls.eq.mock.calls.map(([, value]) => value)).toEqual(
      expect.arrayContaining(["edition-1", "guardian", "active", "volunteer"])
    );
    expect(filterCalls.isNotNull).toHaveBeenCalledTimes(2);
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
    expect(filterCalls.eq.mock.calls.map(([, value]) => value)).toEqual(
      expect.arrayContaining([
        "active",
        "competition_category_lead",
        "edition-1",
        "guardian",
        "overall_events_lead",
        "volunteer",
      ])
    );
    expect(filterCalls.inArray.mock.calls.map(([, values]) => values)).toEqual(
      expect.arrayContaining([
        ["center-1"],
        ["competition-1"],
        ["category-1"],
        ["liaison", "transport_coordinator"],
        ["competition_coordinator", "competition_volunteer"],
      ])
    );
    expect(filterCalls.isNotNull).toHaveBeenCalledTimes(2);
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
