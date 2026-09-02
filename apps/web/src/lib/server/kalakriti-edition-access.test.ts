import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const hoisted = <T>(factory: () => T): T => factory();

const dbMocks = hoisted(() => {
  const results: unknown[][] = [];
  const makeQuery = () => {
    const query = {
      from: mock(),
      innerJoin: mock(),
      leftJoin: mock(),
      limit: mock(),
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
    query.limit.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  };
  return {
    results,
    select: mock(() => makeQuery()),
    selectDistinct: mock(() => makeQuery()),
  };
});

const resolvePermissions = hoisted(() => mock());

mock.module("@pi-dash/db", () => ({
  db: {
    select: dbMocks.select,
    selectDistinct: dbMocks.selectDistinct,
  },
}));

mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));

import {
  resolveCurrentKalakritiEditionAccess,
  resolveKalakritiEditionAccess,
} from "./kalakriti-edition-access";

const edition = {
  ageCutoffDate: "2027-01-01",
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "registration_open" as const,
  name: "Kalakriti 2027",
  plannedRegistrationCloseAt: new Date("2027-09-01T12:00:00.000Z"),
  teamEventId: "event-1",
  timezone: "Asia/Kolkata",
  year: 2027,
};

function selectedWhereParams(callIndex: number) {
  const query = dbMocks.select.mock.results[callIndex]?.value as
    | { where: { mock: { calls: Array<[unknown]> } } }
    | undefined;
  const predicate = query?.where.mock.calls[0]?.[0];
  if (!predicate) {
    throw new Error(`Missing where predicate for select call ${callIndex}`);
  }
  return new PgDialect().sqlToQuery(predicate as SQL).params;
}

function selectedDistinctWhereQuery(callIndex: number) {
  const query = dbMocks.selectDistinct.mock.results[callIndex]?.value as
    | { where: { mock: { calls: Array<[unknown]> } } }
    | undefined;
  const predicate = query?.where.mock.calls[0]?.[0];
  if (!predicate) {
    throw new Error(
      `Missing where predicate for selectDistinct call ${callIndex}`
    );
  }
  return new PgDialect().sqlToQuery(predicate as SQL);
}

describe("resolveKalakritiEditionAccess", () => {
  beforeEach(() => {
    dbMocks.results.length = 0;
    dbMocks.select.mockClear();
    dbMocks.selectDistinct.mockClear();
    resolvePermissions.mockReset();
  });

  it("rejects a user without Kalakriti view and without an Edition membership", async () => {
    resolvePermissions.mockResolvedValue([]);
    dbMocks.results.push([edition], []);

    await expect(
      resolveKalakritiEditionAccess({
        role: "guest",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toBeNull();
    expect(selectedWhereParams(0)).toEqual([edition.year]);
    expect(selectedWhereParams(1)).toEqual([edition.id, "user-1", "active"]);
  });

  it("allows an assigned member whose global role lacks Kalakriti view", async () => {
    resolvePermissions.mockResolvedValue([]);
    dbMocks.results.push(
      [edition],
      [{ id: "membership-1", kind: "volunteer" }],
      [
        {
          centerId: null,
          competitionCategoryId: null,
          competitionId: null,
          responsibility: "competition_volunteer",
        },
      ]
    );

    await expect(
      resolveKalakritiEditionAccess({
        role: "team_lead",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toMatchObject({
      edition: { id: edition.id },
      isGlobalAdmin: false,
      membership: {
        responsibilities: ["competition_volunteer"],
      },
    });
  });

  it("rejects a user without an active membership in the requested Edition", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    dbMocks.results.push([edition], []);

    await expect(
      resolveKalakritiEditionAccess({
        role: "volunteer",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toBeNull();
    expect(selectedWhereParams(0)).toEqual([edition.year]);
    expect(selectedWhereParams(1)).toEqual([edition.id, "user-1", "active"]);
  });

  it("rejects an active volunteer membership without an assignment", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    dbMocks.results.push(
      [edition],
      [{ id: "membership-1", kind: "volunteer" }],
      []
    );

    await expect(
      resolveKalakritiEditionAccess({
        role: "volunteer",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toBeNull();
  });

  it("allows an active Guardian membership without an assignment", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    dbMocks.results.push(
      [edition],
      [{ id: "membership-1", kind: "guardian" }],
      []
    );

    await expect(
      resolveKalakritiEditionAccess({
        role: "external_user",
        userId: "guardian-1",
        year: edition.year,
      })
    ).resolves.toMatchObject({
      edition: { id: edition.id },
      membership: {
        assignments: [],
        kind: "guardian",
      },
    });
  });

  it("loads active membership assignments for the requested Edition", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    dbMocks.results.push(
      [edition],
      [{ id: "membership-1", kind: "volunteer" }],
      [
        {
          centerId: null,
          competitionCategoryId: "category-1",
          competitionId: null,
          responsibility: "competition_category_lead",
        },
      ]
    );

    await expect(
      resolveKalakritiEditionAccess({
        role: "volunteer",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toMatchObject({
      edition: {
        id: edition.id,
        plannedRegistrationCloseAt:
          edition.plannedRegistrationCloseAt.getTime(),
        year: edition.year,
      },
      isGlobalAdmin: false,
      membership: {
        assignments: [
          expect.objectContaining({
            competitionCategoryId: "category-1",
            responsibility: "competition_category_lead",
          }),
        ],
        responsibilities: ["competition_category_lead"],
      },
    });
  });

  it("allows a global administrator without an Edition membership", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view", "kalakriti.admin"]);
    dbMocks.results.push([edition], []);

    await expect(
      resolveKalakritiEditionAccess({
        role: "admin",
        userId: "admin-1",
        year: edition.year,
      })
    ).resolves.toMatchObject({
      edition: { id: edition.id },
      isGlobalAdmin: true,
      membership: null,
    });
  });
});

describe("resolveCurrentKalakritiEditionAccess", () => {
  beforeEach(() => {
    dbMocks.results.length = 0;
    dbMocks.select.mockClear();
    dbMocks.selectDistinct.mockClear();
    resolvePermissions.mockReset();
  });

  it("discovers only Guardian or assigned volunteer memberships", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    dbMocks.results.push([]);

    await expect(
      resolveCurrentKalakritiEditionAccess({
        role: "volunteer",
        userId: "volunteer-1",
      })
    ).resolves.toBeNull();

    const query = selectedDistinctWhereQuery(0);
    expect(query.params).toEqual(["volunteer-1", "active", "guardian"]);
    expect(query.sql).toContain("kalakriti_assignment");
    expect(query.sql).toContain("is not null");
  });
});
