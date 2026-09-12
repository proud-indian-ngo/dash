import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const hoisted = <T>(factory: () => T): T => factory();

const dbMocks = hoisted(() => {
  const results: unknown[][] = [];
  const insertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  let committed = false;
  let transactionActive = false;

  const makeQuery = () => {
    const query = {
      for: mock(() => Promise.resolve(results.shift() ?? [])),
      from: mock(),
      innerJoin: mock(),
      leftJoin: mock(),
      limit: mock(),
      orderBy: mock(),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle builders are promise-like.
      then: (
        resolve: (rows: unknown[]) => unknown,
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

  const select = mock(makeQuery);
  const tx = {
    insert: mock(() => ({
      values: mock((values: unknown) => {
        insertCalls.push(values);
        return Promise.resolve();
      }),
    })),
    select,
    update: mock(() => {
      const builder = {
        set: mock((values: unknown) => {
          updateCalls.push(values);
          return builder;
        }),
        where: mock(() => Promise.resolve()),
      };
      return builder;
    }),
  };

  const transaction = mock(async (callback: (client: typeof tx) => unknown) => {
    transactionActive = true;
    try {
      const result = await callback(tx);
      committed = true;
      return result;
    } finally {
      transactionActive = false;
    }
  });

  return {
    get committed() {
      return committed;
    },
    get transactionActive() {
      return transactionActive;
    },
    insertCalls,
    reset() {
      results.length = 0;
      insertCalls.length = 0;
      updateCalls.length = 0;
      committed = false;
      transactionActive = false;
      select.mockClear();
      transaction.mockClear();
      tx.insert.mockClear();
      tx.update.mockClear();
    },
    results,
    select,
    transaction,
    updateCalls,
  };
});

mock.module("@pi-dash/db", () => ({
  db: {
    select: dbMocks.select,
    transaction: dbMocks.transaction,
  },
}));

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import {
  lookupKalakritiPerson,
  canLookupKalakritiPerson,
} from "./kalakriti-person-lookup";

function selectedWhereQuery(callIndex: number) {
  const query = dbMocks.select.mock.results[callIndex]?.value as
    | { where: { mock: { calls: Array<[unknown]> } } }
    | undefined;
  const predicate = query?.where.mock.calls[0]?.[0];
  if (!predicate) {
    throw new Error(`Missing where predicate for select call ${callIndex}`);
  }
  return new PgDialect().sqlToQuery(predicate as SQL);
}

function selectedWhereParams(callIndex: number) {
  return selectedWhereQuery(callIndex).params;
}

describe("person lookup authorization", () => {
  it("allows only global and Edition administrators", () => {
    const access = (isGlobalAdmin: boolean, responsibilities: string[]) =>
      ({
        isGlobalAdmin,
        membership: { responsibilities },
      }) as KalakritiEditionAccess;
    expect(canLookupKalakritiPerson(null)).toBe(false);
    expect(canLookupKalakritiPerson(access(false, []))).toBe(false);
    expect(
      canLookupKalakritiPerson(access(false, ["volunteer_coordinator"]))
    ).toBe(false);
    expect(canLookupKalakritiPerson(access(false, ["edition_admin"]))).toBe(
      true
    );
    expect(canLookupKalakritiPerson(access(true, []))).toBe(true);
  });
});

describe("identifier lookup", () => {
  beforeEach(() => dbMocks.reset());

  it("finds an in-edition student without a credential row", async () => {
    dbMocks.results.push([
      { humanId: "KAL-2027-0001", name: "Student", centerName: "Center" },
    ]);
    expect(
      await lookupKalakritiPerson({
        editionId: "edition-1",
        humanId: "KAL-2027-0001",
      })
    ).toEqual({
      humanId: "KAL-2027-0001",
      kind: "student",
      name: "Student",
      scopeLabel: "Center",
    });
    expect(selectedWhereParams(0)).toEqual([
      "KAL-2027-0001",
      "KAL-2027-0001",
      "edition-1",
    ]);
    expect(selectedWhereQuery(0).sql).toBe(
      '(("kalakriti_student"."human_id" = $1 or "kalakriti_student"."id"::text = $2) and "kalakriti_student"."edition_id" = $3)'
    );
    expect(dbMocks.insertCalls).toEqual([]);
  });

  it("accepts a student UUID identifier without querying credentials", async () => {
    dbMocks.results.push([
      { humanId: "KAL-2027-0001", name: "Student", centerName: "Center" },
    ]);
    expect(
      await lookupKalakritiPerson({
        editionId: "edition-1",
        humanId: "student-uuid",
      })
    ).toEqual({
      humanId: "KAL-2027-0001",
      kind: "student",
      name: "Student",
      scopeLabel: "Center",
    });
    expect(selectedWhereParams(0)).toEqual([
      "student-uuid",
      "student-uuid",
      "edition-1",
    ]);
  });

  it("resolves a Guardian yearly ID while preserving the Edition and active-membership constraints", async () => {
    dbMocks.results.push(
      [],
      [
        {
          id: "guardian-membership",
          humanId: "KALG-2027-0001",
          kind: "guardian",
          name: "Guardian",
          responsibility: null,
        },
      ]
    );
    expect(
      await lookupKalakritiPerson({
        editionId: "edition-1",
        humanId: "KALG-2027-0001",
      })
    ).toEqual({
      humanId: "KALG-2027-0001",
      kind: "guardian",
      name: "Guardian",
      scopeLabel: "Guardian",
    });
    expect(selectedWhereParams(1)).toEqual([
      "edition-1",
      "active",
      "KALG-2027-0001",
      "KALG-2027-0001",
    ]);
    expect(dbMocks.insertCalls).toEqual([]);
    expect(dbMocks.updateCalls).toEqual([]);
  });
  for (const kind of ["guardian", "volunteer"] as const) {
    it(`finds active ${kind} by membership ID fallback without writes`, async () => {
      dbMocks.results.push(
        [],
        [
          {
            id: "membership-1",
            humanId: null,
            kind,
            name: "Person",
            responsibility: null,
          },
        ]
      );
      expect(
        await lookupKalakritiPerson({
          editionId: "edition-1",
          humanId: "membership-1",
        })
      ).toEqual({
        humanId: "membership-1",
        kind,
        name: "Person",
        scopeLabel: kind === "guardian" ? "Guardian" : "Unassigned",
      });
      expect(selectedWhereParams(1)).toEqual([
        "edition-1",
        "active",
        "membership-1",
        "membership-1",
      ]);
      expect(dbMocks.insertCalls).toEqual([]);
      expect(dbMocks.updateCalls).toEqual([]);
      expect(selectedWhereQuery(1).sql).toBe(
        '("kalakriti_edition_membership"."edition_id" = $1 and "kalakriti_edition_membership"."state" = $2 and ("kalakriti_edition_membership"."human_id" = $3 or "kalakriti_edition_membership"."id"::text = $4))'
      );
    });
  }

  it("does not resolve missing, inactive or out-of-edition subjects", async () => {
    dbMocks.results.push([], []);
    expect(
      await lookupKalakritiPerson({
        editionId: "other-edition",
        humanId: "KALV-2027-0001",
      })
    ).toBeNull();
    expect(selectedWhereParams(1)).toEqual([
      "other-edition",
      "active",
      "KALV-2027-0001",
      "KALV-2027-0001",
    ]);
  });
});
