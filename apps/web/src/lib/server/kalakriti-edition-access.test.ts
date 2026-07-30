import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const results: unknown[][] = [];
  const makeQuery = () => {
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      limit: vi.fn(),
      orderBy: vi.fn(),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally promise-like.
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(results.shift() ?? []).then(resolve, reject),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  };
  return {
    results,
    select: vi.fn(() => makeQuery()),
    selectDistinct: vi.fn(() => makeQuery()),
  };
});

const resolvePermissions = vi.hoisted(() => vi.fn());

vi.mock("@pi-dash/db", () => ({
  db: {
    select: dbMocks.select,
    selectDistinct: dbMocks.selectDistinct,
  },
}));

vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));

import { resolveKalakritiEditionAccess } from "./kalakriti-edition-access";

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
  const query = dbMocks.select.mock.results[callIndex]?.value;
  const predicate = query?.where.mock.calls[0]?.[0];
  if (!predicate) {
    throw new Error(`Missing where predicate for select call ${callIndex}`);
  }
  return new PgDialect().sqlToQuery(predicate).params;
}

describe("resolveKalakritiEditionAccess", () => {
  beforeEach(() => {
    dbMocks.results.length = 0;
    dbMocks.select.mockClear();
    dbMocks.selectDistinct.mockClear();
    resolvePermissions.mockReset();
  });

  it("rejects a role without Kalakriti view permission before querying data", async () => {
    resolvePermissions.mockResolvedValue([]);

    await expect(
      resolveKalakritiEditionAccess({
        role: "guest",
        userId: "user-1",
        year: edition.year,
      })
    ).resolves.toBeNull();
    expect(dbMocks.select).not.toHaveBeenCalled();
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
