import { beforeEach, describe, expect, it, mock } from "bun:test";

const select = mock();
const filterCalls = {
  eq: mock(),
  inArray: mock(),
  isNotNull: mock(),
  isNull: mock(),
};

mock.module("@pi-dash/db", () => ({ db: { select } }));
mock.module("@pi-dash/db/schema/kalakriti", () => ({
  kalakritiAssignment: {},
  kalakritiCompetition: {},
  kalakritiEdition: {},
  kalakritiEditionMembership: {},
  kalakritiGuardianCenter: {},
}));
// Bun 1.4 deadlocks when a mock.module factory for drizzle-orm returns new
// function values closing over the real namespace, so capture filter
// arguments and return plain placeholders. `or` mimics drizzle semantics:
// undefined inputs are dropped, and an all-undefined call returns undefined.
mock.module("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (column: unknown, value: unknown) => {
    filterCalls.eq(column, value);
    return { column, value };
  },
  inArray: (column: unknown, values: unknown[]) => {
    filterCalls.inArray(column, values);
    return { column, values };
  },
  isNotNull: (column: unknown) => {
    filterCalls.isNotNull(column);
    return { column };
  },
  isNull: (column: unknown) => {
    filterCalls.isNull(column);
    return { column };
  },
  or: (...args: unknown[]) => {
    const defined = args.filter((value) => value !== undefined);
    if (defined.length === 0) {
      return undefined;
    }
    return defined;
  },
}));

const {
  resolveKalakritiRegistrationRecipients,
  resolveKalakritiScheduleRecipients,
} = await import("./kalakriti-notification-recipients");

function queryReturning<T>(rows: T[]) {
  const query = {
    from: mock(),
    innerJoin: mock(),
    where: mock(async () => rows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  return query;
}

describe("Kalakriti schedule recipient resolution", () => {
  beforeEach(() => {
    mock.clearAllMocks();
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
        "liaison_lead",
        "volunteer",
      ])
    );
    expect(filterCalls.inArray.mock.calls.map(([, values]) => values)).toEqual(
      expect.arrayContaining([
        ["center-1"],
        ["competition-1"],
        ["category-1"],
        ["liaison", "center_liaison_lead", "liaison_volunteer"],
        ["competition_coordinator", "competition_volunteer"],
      ])
    );
    expect(filterCalls.isNotNull).toHaveBeenCalledTimes(2);
    expect(filterCalls.isNull).toHaveBeenCalled();
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
