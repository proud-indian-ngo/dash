import { describe, expect, it } from "bun:test";

import { uuidv7 } from "uuidv7";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { kalakritiAwardMutators } from "../kalakriti-award";

type Row = Record<string, unknown>;

function fixture() {
  const editionId = uuidv7();
  const divisionId = uuidv7();
  const entryId = uuidv7();
  const studentIds = [uuidv7(), uuidv7()];
  const membershipId = uuidv7();
  const edition = {
    id: editionId,
    lifecycle: "live",
    eventDate: "2027-11-21",
  };
  const initialRows = {
    kalakritiEdition: [edition],
    kalakritiEditionMembership: [
      {
        id: membershipId,
        editionId,
        userId: "operator",
        kind: "volunteer",
        state: "active",
      },
    ],
    kalakritiAssignment: [
      {
        id: uuidv7(),
        editionId,
        membershipId,
        responsibility: "awards_member",
      },
    ],
    kalakritiResult: [
      {
        id: uuidv7(),
        editionId,
        divisionId,
        status: "published",
        winnerEntryId: entryId,
        runnerUpEntryId: uuidv7(),
      },
    ],
    kalakritiCompetitionEntry: [{ id: entryId, editionId, divisionId }],
    kalakritiEntryMember: studentIds.map((studentId) => ({
      id: uuidv7(),
      editionId,
      divisionId,
      entryId,
      studentId,
    })),
    kalakritiAwardHandover: [],
    kalakritiAwardCommand: [],
  };
  const rows = initialRows as { [K in keyof typeof initialRows]: Row[] };
  const tables: Record<string, Row[]> = rows;
  const mutations: { action: string; table: string; row: Row }[] = [];
  let lockTail = Promise.resolve();
  const ctx = {
    userId: "operator",
    role: "volunteer",
    permissions: ["kalakriti.view"],
  };
  async function execute(args: Row, location = "server", context = ctx) {
    let release: (() => void) | undefined;
    const builder = {
      from: () => builder,
      where: () => builder,
      for: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        return [edition];
      },
    };
    const tx = {
      location,
      dbTransaction: { wrappedTransaction: { select: () => builder } },
      run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
        const result = (tables[query.ast.table] ?? []).filter((row) =>
          matchesScope(row as ScopeRow, query.ast.where, tables as ScopeTables)
        );
        return query.format.singular ? result[0] : result;
      },
      mutate: Object.fromEntries(
        Object.keys(rows).map((table) => [
          table,
          {
            insert: async (row: Row) => {
              mutations.push({ action: "insert", table, row });
              tables[table]!.push(row);
            },
            update: async (row: Row) => {
              mutations.push({ action: "update", table, row });
              const current = tables[table]!.find((item) => item.id === row.id);
              if (!current) throw new Error(`Missing ${table}`);
              Object.assign(current, row);
            },
          },
        ])
      ),
    };
    try {
      await kalakritiAwardMutators.set.fn({ tx, ctx: context, args } as never);
    } finally {
      release?.();
    }
  }
  const args = (overrides: Row = {}) => ({
    editionId,
    divisionId,
    entryId,
    award: "winner",
    awarded: true,
    expectedVersions: studentIds.map((studentId) => ({
      studentId,
      version: 0,
    })),
    commandId: uuidv7(),
    now: 100,
    ...overrides,
  });
  return {
    rows,
    mutations,
    edition,
    editionId,
    divisionId,
    entryId,
    studentIds,
    membershipId,
    ctx,
    execute,
    args,
  };
}

describe("Kalakriti award mutations", () => {
  it("awards and undoes every group member with pinned versions", async () => {
    const f = fixture();
    await f.execute(f.args());
    expect(f.rows.kalakritiAwardHandover).toHaveLength(2);
    expect(f.rows.kalakritiAwardHandover).toEqual(
      expect.arrayContaining(
        f.studentIds.map((studentId) =>
          expect.objectContaining({ studentId, awarded: true, version: 1 })
        )
      )
    );
    await f.execute(
      f.args({
        awarded: false,
        expectedVersions: f.studentIds.map((studentId) => ({
          studentId,
          version: 1,
        })),
      })
    );
    expect(
      f.rows.kalakritiAwardHandover.map((row) => [row.awarded, row.version])
    ).toEqual([
      [false, 2],
      [false, 2],
    ]);
  });

  it("updates one recipient and requires the exact target version set", async () => {
    const f = fixture();
    await f.execute(
      f.args({
        studentId: f.studentIds[0],
        expectedVersions: [{ studentId: f.studentIds[0], version: 0 }],
      })
    );
    expect(f.rows.kalakritiAwardHandover).toHaveLength(1);
    expect(f.rows.kalakritiAwardHandover[0]?.studentId).toBe(f.studentIds[0]);
    await expect(
      f.execute(
        f.args({
          studentId: f.studentIds[0],
          expectedVersions: [{ studentId: f.studentIds[1], version: 0 }],
        })
      )
    ).rejects.toThrow("exactly match");
    await expect(
      f.execute(
        f.args({
          studentId: f.studentIds[0],
          expectedVersions: [{ studentId: f.studentIds[0], version: 0 }],
        })
      )
    ).rejects.toThrow("Awards changed");
  });

  it("replays a durable command after later changes and rejects command reuse", async () => {
    const f = fixture();
    const first = f.args();
    await f.execute(first);
    // PostgreSQL JSONB does not retain input object-key order.
    const stored = f.rows.kalakritiAwardCommand[0]!.payload as {
      expectedVersions: { studentId: string; version: number }[];
    };
    stored.expectedVersions = stored.expectedVersions.map(
      ({ studentId, version }) => ({
        version,
        studentId,
      })
    );
    await f.execute(
      f.args({
        awarded: false,
        expectedVersions: f.studentIds.map((studentId) => ({
          studentId,
          version: 1,
        })),
      })
    );
    const mutationCount = f.mutations.length;
    await f.execute(first);
    expect(f.mutations).toHaveLength(mutationCount);
    await expect(f.execute({ ...first, awarded: false })).rejects.toThrow(
      "Command ID is already used"
    );
    await expect(
      f.execute(first, "server", {
        userId: "someone-else",
        role: "admin",
        permissions: ["kalakriti.admin"],
      })
    ).rejects.toThrow("Command ID is already used");
  });

  it("serializes concurrent commands and rejects the stale writer", async () => {
    const f = fixture();
    const outcomes = await Promise.allSettled([
      f.execute(f.args()),
      f.execute(f.args()),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(f.rows.kalakritiAwardHandover).toHaveLength(2);
    expect(f.rows.kalakritiAwardCommand).toHaveLength(1);
  });

  it("validates every group version before updating any member", async () => {
    const f = fixture();
    await f.execute(f.args());
    const mutationCount = f.mutations.length;
    await expect(
      f.execute(
        f.args({
          awarded: false,
          expectedVersions: [
            { studentId: f.studentIds[0], version: 1 },
            { studentId: f.studentIds[1], version: 0 },
          ],
        })
      )
    ).rejects.toThrow("Awards changed");
    expect(f.mutations).toHaveLength(mutationCount);
    expect(f.rows.kalakritiAwardHandover.map((row) => row.awarded)).toEqual([
      true,
      true,
    ]);
  });

  it("rejects a forged recipient, event scope, and award slot", async () => {
    const f = fixture();
    const forgedStudentId = uuidv7();
    await expect(
      f.execute(
        f.args({
          studentId: forgedStudentId,
          expectedVersions: [{ studentId: forgedStudentId, version: 0 }],
        })
      )
    ).rejects.toThrow("exactly match");
    await expect(f.execute(f.args({ divisionId: uuidv7() }))).rejects.toThrow(
      "Published award"
    );
    await expect(f.execute(f.args({ award: "runner_up" }))).rejects.toThrow(
      "Published award"
    );
    expect(f.mutations).toHaveLength(0);
  });

  it("tracks the same student independently across award events", async () => {
    const f = fixture();
    const secondDivisionId = uuidv7();
    const secondEntryId = uuidv7();
    f.rows.kalakritiResult.push({
      id: uuidv7(),
      editionId: f.editionId,
      divisionId: secondDivisionId,
      status: "published",
      winnerEntryId: secondEntryId,
      runnerUpEntryId: uuidv7(),
    });
    f.rows.kalakritiCompetitionEntry.push({
      id: secondEntryId,
      editionId: f.editionId,
      divisionId: secondDivisionId,
    });
    f.rows.kalakritiEntryMember.push({
      id: uuidv7(),
      editionId: f.editionId,
      divisionId: secondDivisionId,
      entryId: secondEntryId,
      studentId: f.studentIds[0],
    });

    await f.execute(
      f.args({
        studentId: f.studentIds[0],
        expectedVersions: [{ studentId: f.studentIds[0], version: 0 }],
      })
    );
    await f.execute(
      f.args({
        divisionId: secondDivisionId,
        entryId: secondEntryId,
        studentId: f.studentIds[0],
        expectedVersions: [{ studentId: f.studentIds[0], version: 0 }],
      })
    );
    expect(f.rows.kalakritiAwardHandover).toHaveLength(2);
    expect(f.rows.kalakritiAwardHandover.map((row) => row.divisionId)).toEqual([
      f.divisionId,
      secondDivisionId,
    ]);
  });

  it("requires active Awards authority, a Live Edition, and a published matching slot", async () => {
    const f = fixture();
    f.rows.kalakritiEditionMembership[0]!.state = "archived";
    await expect(f.execute(f.args())).rejects.toThrow("Unauthorized");
    f.rows.kalakritiEditionMembership[0]!.state = "active";
    f.rows.kalakritiAssignment[0]!.responsibility = "food_member";
    await expect(f.execute(f.args())).rejects.toThrow("Unauthorized");
    f.rows.kalakritiAssignment[0]!.responsibility = "awards_lead";
    f.rows.kalakritiResult[0]!.status = "draft";
    await expect(f.execute(f.args())).rejects.toThrow("Published award");
    f.rows.kalakritiResult[0]!.status = "published";
    f.edition.lifecycle = "archived";
    await expect(f.execute(f.args())).rejects.toThrow("Live Edition");
  });

  it("does not execute on the client", async () => {
    const f = fixture();
    await f.execute(f.args(), "client");
    expect(f.mutations).toHaveLength(0);
  });
});
