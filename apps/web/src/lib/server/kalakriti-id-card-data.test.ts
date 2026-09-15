import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const dbMocks = hoisted(() => {
  const results: unknown[][] = [];
  const makeQuery = () => {
    const query = {
      from: mock(),
      innerJoin: mock(),
      leftJoin: mock(),
      orderBy: mock(),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally promise-like.
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(results.shift() ?? []).then(resolve, reject),
      where: mock(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  };
  const tx = { select: mock(makeQuery) };
  return {
    results,
    transaction: mock(
      (callback: (client: typeof tx) => Promise<unknown>, _options: unknown) =>
        callback(tx)
    ),
    tx,
  };
});

mock.module("@pi-dash/db", () => ({
  db: { transaction: dbMocks.transaction },
}));

import { getKalakritiIdCardData } from "./kalakriti-id-card-data";

describe("getKalakritiIdCardData", () => {
  beforeEach(() => {
    dbMocks.results.length = 0;
    dbMocks.transaction.mockClear();
    dbMocks.tx.select.mockClear();
  });

  it("assembles every current person with deduplicated card details", async () => {
    const drawingStart = new Date("2027-11-21T04:00:00.000Z");
    dbMocks.results.push(
      [
        {
          centerName: "Sunshine Centre",
          competitionId: "competition-drawing",
          competitionName: "Drawing",
          id: "student-zoya",
          name: "Zoya",
          startsAt: drawingStart,
        },
        {
          centerName: "Sunshine Centre",
          competitionId: "competition-drawing",
          competitionName: "Drawing",
          id: "student-zoya",
          name: "Zoya",
          startsAt: drawingStart,
        },
        {
          centerName: "Sunshine Centre",
          competitionId: "competition-singing",
          competitionName: "Singing",
          id: "student-zoya",
          name: "Zoya",
          startsAt: null,
        },
        {
          centerName: "Bright Centre",
          competitionId: null,
          competitionName: null,
          id: "student-aarav",
          name: "Aarav",
          startsAt: null,
        },
      ],
      [
        {
          centerName: null,
          id: "volunteer-meera",
          kind: "volunteer",
          name: "Meera",
          responsibility: "food_member",
        },
        {
          centerName: null,
          id: "volunteer-meera",
          kind: "volunteer",
          name: "Meera",
          responsibility: "food_member",
        },
        {
          centerName: null,
          id: "volunteer-meera",
          kind: "volunteer",
          name: "Meera",
          responsibility: "venue_lead",
        },
        {
          centerName: "Sunshine Centre",
          id: "guardian-kavitha",
          kind: "guardian",
          name: "Kavitha",
          responsibility: null,
        },
        {
          centerName: "Bright Centre",
          id: "guardian-kavitha",
          kind: "guardian",
          name: "Kavitha",
          responsibility: null,
        },
        {
          centerName: null,
          id: "volunteer-unassigned",
          kind: "volunteer",
          name: "Unassigned Volunteer",
          responsibility: null,
        },
        {
          centerName: null,
          id: "guardian-unassigned",
          kind: "guardian",
          name: "Unassigned Guardian",
          responsibility: null,
        },
      ],
      [
        { id: "guest-ravi", name: "Ravi", type: "guest" },
        { id: "judge-arjun", name: "Arjun", type: "judge" },
      ]
    );

    await expect(getKalakritiIdCardData("edition-1")).resolves.toEqual([
      {
        centerName: "Bright Centre",
        competitions: [],
        id: "student-aarav",
        name: "Aarav",
        type: "student",
      },
      {
        centerName: "Sunshine Centre",
        competitions: [
          { name: "Drawing", startsAt: drawingStart.getTime() },
          { name: "Singing", startsAt: null },
        ],
        id: "student-zoya",
        name: "Zoya",
        type: "student",
      },
      {
        id: "volunteer-meera",
        name: "Meera",
        role: "Food Member, Venue Lead",
        type: "volunteer",
      },
      {
        id: "volunteer-unassigned",
        name: "Unassigned Volunteer",
        role: "",
        type: "volunteer",
      },
      {
        centerName: "Bright Centre, Sunshine Centre",
        id: "guardian-kavitha",
        name: "Kavitha",
        type: "guardian",
      },
      {
        centerName: "",
        id: "guardian-unassigned",
        name: "Unassigned Guardian",
        type: "guardian",
      },
      { id: "judge-arjun", name: "Arjun", type: "judge" },
      { id: "guest-ravi", name: "Ravi", type: "guest" },
    ]);

    expect(dbMocks.tx.select).toHaveBeenCalledTimes(3);
    expect(dbMocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  });
});
