import { beforeEach, describe, expect, it, mock } from "bun:test";

const events: string[] = [];
const lockMeeting = mock(async (_tx: unknown, id: string) => {
  events.push(`lock ${id}`);
  return null;
});
const releaseResolutions = mock(
  async (_tx: unknown, _ids: readonly string[], _input: unknown) => undefined
);
mock.module("@pi-dash/db/queries/meetings", () => ({
  lockMeeting,
  releaseResolutions,
}));

const {
  agendaItemMutators,
  agendaVoteMutators,
  meetingAttendanceMutators,
  meetingMutators,
} = await import("../meetings");
const { resolutionMutators } = await import("../governance");
const { matchesScope } = await import("../../queries/query-scope-test-utils");

type Row = Record<string, unknown>;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    agendaItem: [
      {
        castingVote: null,
        id: "item-1",
        kind: "resolution",
        meetingId: "m1",
        outcome: null,
        position: 1,
        resolutionId: "r1",
      },
    ],
    agendaVote: [],
    deedVersion: [
      {
        castingVote: "chair",
        effectiveFrom: day("2019-03-16"),
        id: "v1",
        number: 1,
        videoCountsPresent: false,
      },
    ],
    meeting: [
      {
        chairTrusteeId: "chair",
        id: "m1",
        startsAt: Date.now() - 60_000,
        status: "convened",
      },
    ],
    meetingAttendance: [
      {
        id: "a1",
        meetingId: "m1",
        offices: [],
        presence: "in_person",
        trusteeId: "chair",
      },
      {
        id: "a2",
        meetingId: "m1",
        offices: [],
        presence: "in_person",
        trusteeId: "t2",
      },
    ],
    resolution: [
      {
        body: "RESOLVED THAT",
        effect: { type: "none" },
        id: "r1",
        kind: "meeting",
        status: "draft",
        templateKey: "ordinary",
        title: "On the agenda",
      },
    ],
    ...seed,
  };
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id);
    },
    insert: async (row: Row) => {
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      events.push(`update ${table}`);
      const current = tables[table]?.find((item) => item.id === row.id);
      Object.assign(current ?? {}, row);
    },
  });
  const tx = {
    dbTransaction: { wrappedTransaction: {} },
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
    run: async (query: {
      ast: { table: string; where: never };
      format: { singular: boolean };
    }) => {
      events.push(`read ${query.ast.table}`);
      const result = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(row as never, query.ast.where, tables as never)
      );
      return query.format.singular ? result[0] : result;
    },
  };
  return { tables, tx };
}

const ctx = {
  permissions: ["governance.view", "governance.manage"],
  role: "admin",
  userId: "admin-1",
};

function run(
  mutator: { fn: (input: never) => Promise<void> },
  db: ReturnType<typeof createDb>,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

beforeEach(() => {
  events.length = 0;
  releaseResolutions.mockClear();
});

const decided = {
  agendaItem: [{ id: "item-1", meetingId: "m1", outcome: "passed" }],
};

describe("meeting mutators", () => {
  it("take the meeting's lock before reading the item's state", async () => {
    const db = createDb();
    await run(agendaVoteMutators.set, db, {
      absenteeWritten: false,
      agendaItemId: "item-1",
      choice: "for",
      conflict: false,
      id: "v1",
      trusteeId: "t2",
    });
    const lock = events.indexOf("lock m1");
    expect(lock).toBeGreaterThan(-1);
    // The item is read again after the lock, then the meeting and votes.
    expect(events.slice(lock + 1, lock + 3)).toEqual([
      "read meeting",
      "read agendaItem",
    ]);
  });

  it("refuse a casting vote from a chair who declared an interest", async () => {
    const db = createDb({
      agendaVote: [
        {
          absenteeWritten: false,
          agendaItemId: "item-1",
          choice: "abstain",
          conflict: true,
          id: "v-chair",
          trusteeId: "chair",
        },
      ],
    });
    await expect(
      run(agendaItemMutators.setCastingVote, db, {
        choice: "for",
        id: "item-1",
      })
    ).rejects.toThrow("declared an interest");
    await run(agendaItemMutators.setCastingVote, db, {
      choice: null,
      id: "item-1",
    });
  });

  it("refuse new resolutions and edits to noticed ones after the notice", async () => {
    const db = createDb();
    await expect(
      run(agendaItemMutators.add, db, {
        id: "item-2",
        meetingId: "m1",
        resolution: {
          body: "RESOLVED THAT",
          effect: { type: "none" },
          id: "r2",
          templateKey: "ordinary",
        },
        title: "Late business",
      })
    ).rejects.toThrow("notice has gone out");
    await expect(
      run(resolutionMutators.updateDraft, db, {
        body: "RESOLVED THAT something else",
        effect: { type: "none" },
        id: "r1",
        templateKey: "ordinary",
        title: "On the agenda",
      })
    ).rejects.toThrow("notice has gone out");
    // A discussion item can still be added.
    await run(agendaItemMutators.add, db, {
      id: "item-3",
      meetingId: "m1",
      resolution: null,
      title: "Any other business",
    });
    expect(db.tables.agendaItem).toHaveLength(2);
  });

  it("let attendance and the chair change after a decision, which keeps its basis", async () => {
    const basis = {
      against: 0,
      attendance: [
        { offices: [], presence: "in_person", trusteeId: "chair" },
        { offices: [], presence: "in_person", trusteeId: "t2" },
      ],
      chairTrusteeId: "chair",
      for: 2,
      inOffice: 2,
      quorum: { counted: 2, needed: 2 },
      usedCastingVote: false,
    };
    const db = createDb({
      agendaItem: [
        {
          decisionBasis: structuredClone(basis),
          id: "item-1",
          kind: "resolution",
          meetingId: "m1",
          outcome: "passed",
          position: 1,
        },
        {
          id: "item-2",
          kind: "resolution",
          meetingId: "m1",
          outcome: null,
          position: 2,
        },
      ],
    });
    await run(meetingAttendanceMutators.set, db, {
      id: "a2",
      presence: "absent",
    });
    await run(meetingMutators.setChair, db, { chairTrusteeId: "t2", id: "m1" });
    expect(db.tables.meetingAttendance?.[1]?.presence).toBe("absent");
    expect(db.tables.meeting?.[0]?.chairTrusteeId).toBe("t2");
    expect(db.tables.agendaItem?.[0]?.decisionBasis).toEqual(basis);
    // The open item still takes votes; the decided one's are fixed.
    await run(agendaVoteMutators.set, db, {
      absenteeWritten: true,
      agendaItemId: "item-2",
      choice: "for",
      conflict: false,
      id: "v2",
      trusteeId: "t2",
    });
    await expect(
      run(agendaVoteMutators.set, db, {
        absenteeWritten: false,
        agendaItemId: "item-1",
        choice: "against",
        conflict: false,
        id: "v3",
        trusteeId: "chair",
      })
    ).rejects.toThrow("already been decided");
  });

  it("cancel hands back the undecided resolutions, not once one is decided", async () => {
    await expect(
      run(meetingMutators.cancel, createDb(decided), { id: "m1", reason: "x" })
    ).rejects.toThrow("Mark it held");
    const db = createDb();
    await run(meetingMutators.cancel, db, { id: "m1", reason: "Postponed" });
    expect(db.tables.meeting?.[0]?.status).toBe("cancelled");
    expect(releaseResolutions.mock.calls[0]?.[1]).toEqual(["r1"]);
  });

  it("drop the generated minutes when the proceedings change", async () => {
    const db = createDb({
      meeting: [
        {
          id: "m1",
          minutesObjectKey: "minutes.pdf",
          minutesSha256: "abc",
          startsAt: Date.now() - 60_000,
          status: "held",
          updatedAt: 1,
        },
      ],
    });
    await run(agendaItemMutators.setNotes, db, {
      id: "item-1",
      notes: "Noted",
    });
    expect(db.tables.meeting?.[0]).toMatchObject({
      minutesObjectKey: null,
      minutesSha256: null,
    });
    expect(db.tables.meeting?.[0]?.updatedAt).not.toBe(1);
    Object.assign(db.tables.meeting?.[0] ?? {}, {
      minutesObjectKey: "again.pdf",
    });
    await run(meetingMutators.setNotes, db, { id: "m1", notes: "Opened" });
    expect(db.tables.meeting?.[0]?.minutesObjectKey).toBeNull();
    // Votes are fixed once it's held.
    await expect(
      run(agendaVoteMutators.clear, db, {
        agendaItemId: "item-1",
        trusteeId: "t2",
      })
    ).rejects.toThrow("while the meeting is open");
  });
});
