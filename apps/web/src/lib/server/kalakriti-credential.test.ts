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

const generatePdf = hoisted(() => mock());

mock.module("@pi-dash/db", () => ({
  db: {
    select: dbMocks.select,
    transaction: dbMocks.transaction,
  },
}));

mock.module("@pi-dash/pdf/generate-kalakriti-credential", () => ({
  generateKalakritiCredentialPdf: generatePdf,
}));

import {
  listKalakritiCredentialsForAdmin,
  printKalakritiCredentials,
} from "./kalakriti-credential";

const edition = {
  brandingKey: "kalakriti-2027",
  lifecycle: "live",
  nextVolunteerSequence: 7,
  year: 2027,
};

const printArgs = {
  actorUserId: "admin-1",
  editionId: "edition-1",
  editionLabel: "Kalakriti 2027",
  now: Date.UTC(2027, 10, 21),
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

describe("printKalakritiCredentials", () => {
  beforeEach(() => {
    dbMocks.reset();
    generatePdf.mockReset();
    generatePdf.mockImplementation(() => Buffer.from("pdf"));
  });

  for (const [kind, subject] of [
    ["student", { studentId: "student-1" }],
    ["membership", { membershipId: "membership-1" }],
  ] as const) {
    it(`rejects a duplicate ${kind} subject before opening a transaction`, async () => {
      await expect(
        printKalakritiCredentials({
          ...printArgs,
          subjects: [subject, subject],
        })
      ).rejects.toThrow("Duplicate credential subject");

      expect(dbMocks.transaction).not.toHaveBeenCalled();
      expect(generatePdf).not.toHaveBeenCalled();
    });
  }

  it("renders the PDF inside the transaction so a rendering failure prevents commit", async () => {
    dbMocks.results.push(
      [edition],
      [{ centerName: "Center One", humanId: "KAL-2027-0001", name: "Asha" }],
      []
    );
    generatePdf.mockImplementation(() => {
      expect(dbMocks.transactionActive).toBe(true);
      throw new Error("PDF render failed");
    });

    await expect(
      printKalakritiCredentials({
        ...printArgs,
        subjects: [{ studentId: "student-1" }],
      })
    ).rejects.toThrow("PDF render failed");

    expect(dbMocks.committed).toBe(false);
    expect(dbMocks.insertCalls).toHaveLength(2);
  });

  it("reuses an active volunteer membership's existing human ID", async () => {
    dbMocks.results.push(
      [edition],
      [
        {
          humanId: "KALV-2027-0042",
          kind: "volunteer",
          name: "Vikram",
          responsibility: null,
        },
      ],
      []
    );

    await printKalakritiCredentials({
      ...printArgs,
      subjects: [{ membershipId: "membership-1" }],
    });

    expect(dbMocks.updateCalls).toEqual([]);
    expect(dbMocks.insertCalls).toContainEqual(
      expect.objectContaining({
        humanId: "KALV-2027-0042",
        membershipId: "membership-1",
      })
    );
  });

  it("allocates a yearly human ID for an active volunteer without one", async () => {
    dbMocks.results.push(
      [edition],
      [
        {
          humanId: null,
          kind: "volunteer",
          name: "Vikram",
          responsibility: null,
        },
      ],
      []
    );

    await printKalakritiCredentials({
      ...printArgs,
      subjects: [{ membershipId: "membership-1" }],
    });

    expect(dbMocks.updateCalls).toContainEqual(
      expect.objectContaining({ humanId: "KALV-2027-0007" })
    );
    expect(dbMocks.updateCalls).toContainEqual({ nextVolunteerSequence: 8 });
    expect(dbMocks.insertCalls).toContainEqual(
      expect.objectContaining({ humanId: "KALV-2027-0007" })
    );
  });

  it("rejects an inactive volunteer membership before credential writes", async () => {
    dbMocks.results.push([edition], []);

    await expect(
      printKalakritiCredentials({
        ...printArgs,
        subjects: [{ membershipId: "inactive-membership" }],
      })
    ).rejects.toThrow("Volunteer membership not found in this Edition");

    expect(selectedWhereParams(1)).toEqual([
      "inactive-membership",
      "edition-1",
      "active",
    ]);
    expect(dbMocks.insertCalls).toEqual([]);
    expect(generatePdf).not.toHaveBeenCalled();
  });
});

describe("listKalakritiCredentialsForAdmin", () => {
  beforeEach(() => {
    dbMocks.reset();
  });

  it("includes an active volunteer without a credential as pending and preserves its human ID", async () => {
    dbMocks.results.push(
      [],
      [
        {
          humanId: "KALV-2027-0042",
          id: "membership-1",
          name: "Vikram",
          responsibility: "volunteer_coordinator",
        },
      ]
    );

    await expect(
      listKalakritiCredentialsForAdmin("edition-1")
    ).resolves.toContainEqual({
      editionId: "edition-1",
      humanId: "KALV-2027-0042",
      id: "membership-1",
      issuedAt: null,
      kind: "volunteer",
      membershipId: "membership-1",
      name: "Vikram",
      revokedAt: null,
      scopeLabel: "Volunteer Coordinator",
      studentId: null,
    });
  });
});
