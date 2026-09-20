import { describe, expect, it } from "bun:test";

import { uuidv7 } from "uuidv7";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  kalakritiResultMutators,
  kalakritiResultSaveSchema,
} from "../kalakriti-result";

type Row = Record<string, unknown>;
type Command = keyof typeof kalakritiResultMutators;

function fixture() {
  const editionId = uuidv7();
  const divisionId = uuidv7();
  const competitionId = uuidv7();
  const categoryId = uuidv7();
  const ageId = uuidv7();
  const sessionId = uuidv7();
  const centerIds = [uuidv7(), uuidv7(), uuidv7()];
  const entryIds = [uuidv7(), uuidv7(), uuidv7()];
  const studentIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const resultId = uuidv7();
  const scorecardId = uuidv7();
  const edition = {
    id: editionId,
    lifecycle: "live",
    eventDate: "2027-11-21",
    year: 2027,
    winnerPoints: 10,
    runnerUpPoints: 5,
  };
  const initialRows = {
    kalakritiEdition: [edition],
    kalakritiResultsState: [],
    kalakritiResult: [],
    kalakritiAwardHandover: [],
    kalakritiResultRevision: [],
    kalakritiStandingsRevision: [],
    kalakritiResultScorecard: [
      {
        id: scorecardId,
        editionId,
        divisionId,
        fileName: "scores.pdf",
        mimeType: "application/pdf",
        byteSize: 1,
        objectKey: "r2/scores.pdf",
      },
    ],
    kalakritiCompetitionDivision: [
      { id: divisionId, editionId, competitionId, ageCategoryId: ageId },
    ],
    kalakritiCompetition: [
      {
        id: competitionId,
        editionId,
        competitionCategoryId: categoryId,
        cancelledAt: null,
        retiredAt: null,
      },
    ],
    kalakritiCompetitionCategory: [
      { id: categoryId, editionId, retiredAt: null },
    ],
    kalakritiAgeCategory: [{ id: ageId, editionId }],
    kalakritiCompetitionSession: [
      { id: sessionId, editionId, divisionId, cancelledAt: null },
    ],
    kalakritiCenter: centerIds.map((id, index) => ({
      id,
      editionId,
      name: ["Alpha", "Beta", "Gamma"][index],
      retiredAt: null,
    })),
    kalakritiCompetitionEntry: entryIds.map((id, index) => ({
      id,
      editionId,
      divisionId,
      centerId: centerIds[index],
    })),
    kalakritiEntryMember: [
      {
        id: uuidv7(),
        editionId,
        entryId: entryIds[0],
        studentId: studentIds[0],
      },
      {
        id: uuidv7(),
        editionId,
        entryId: entryIds[0],
        studentId: studentIds[1],
      },
      {
        id: uuidv7(),
        editionId,
        entryId: entryIds[1],
        studentId: studentIds[2],
      },
      {
        id: uuidv7(),
        editionId,
        entryId: entryIds[2],
        studentId: studentIds[3],
      },
    ],
    kalakritiOperation: studentIds.map((studentId) => ({
      id: uuidv7(),
      editionId,
      competitionSessionId: sessionId,
      studentId,
      type: "competition_attendance",
      supersededByOperationId: null,
    })),
    kalakritiEditionMembership: [
      {
        id: uuidv7(),
        editionId,
        userId: "operator",
        kind: "volunteer",
        state: "active",
      },
    ],
    kalakritiAssignment: [],
  };
  const rows = initialRows as { [K in keyof typeof initialRows]: Row[] };
  const tables: Record<string, Row[]> = rows;
  const admin = {
    userId: "operator",
    role: "admin",
    permissions: ["kalakriti.admin"],
  };
  const staff = {
    userId: "operator",
    role: "volunteer",
    permissions: ["kalakriti.view"],
  };
  const mutations: { action: string; table: string; row: Row }[] = [];
  let lockTail = Promise.resolve();
  let lockCount = 0;
  async function execute(
    command: Command,
    args: Row,
    ctx = admin,
    location = "server"
  ) {
    let release: (() => void) | undefined;
    let locked = false;
    const builder = {
      from: () => builder,
      where: () => builder,
      for: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        locked = true;
        lockCount++;
        return [edition];
      },
    };
    const tx = {
      location,
      dbTransaction: { wrappedTransaction: { select: () => builder } },
      run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
        if (!locked) throw new Error("Query before Edition lock");
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
              const existing = tables[table]!.find(
                (entry) => entry.id === row.id
              );
              if (!existing) throw new Error(`Missing ${table} row`);
              Object.assign(existing, row);
            },
          },
        ])
      ),
    };
    try {
      await kalakritiResultMutators[command].fn({ tx, ctx, args } as never);
    } finally {
      release?.();
    }
  }
  const args = (status: "draft" | "published" = "published") => ({
    editionId,
    divisionId,
    resultId,
    revisionId: uuidv7(),
    expectedVersion: rows.kalakritiResult[0]?.version ?? 0,
    now: 100,
    status,
    winnerEntryId: entryIds[0],
    runnerUpEntryId: entryIds[1],
    scorecardIds: [scorecardId],
    uploads: [],
  });
  const stateArgs = () => ({
    editionId,
    revisionId: uuidv7(),
    expectedVersion: rows.kalakritiResultsState[0]?.version ?? 0,
    now: 200,
  });
  const role = (
    responsibility: string,
    scope: "competition" | "category" | "none" = "none"
  ) => {
    rows.kalakritiAssignment = [
      {
        id: uuidv7(),
        editionId,
        membershipId: rows.kalakritiEditionMembership[0]!.id,
        responsibility,
        competitionId: scope === "competition" ? competitionId : null,
        competitionCategoryId: scope === "category" ? categoryId : null,
      },
    ];
  };
  return {
    rows,
    edition,
    editionId,
    divisionId,
    competitionId,
    categoryId,
    ageId,
    sessionId,
    centerIds,
    entryIds,
    studentIds,
    resultId,
    scorecardId,
    admin,
    staff,
    mutations,
    execute,
    args,
    stateArgs,
    role,
    locks: () => lockCount,
  };
}

describe("Kalakriti result mutations", () => {
  it("limits scorecard count, MIME type, and size at the command boundary", () => {
    const f = fixture();
    const valid = f.args();
    const upload = {
      id: uuidv7(),
      fileName: "scores.pdf",
      mimeType: "application/pdf",
      byteSize: 20 * 1024 * 1024,
      objectKey: "temporary-key",
    };
    expect(
      kalakritiResultSaveSchema.safeParse({ ...valid, uploads: [upload] })
        .success
    ).toBe(true);
    expect(
      kalakritiResultSaveSchema.safeParse({
        ...valid,
        uploads: [{ ...upload, byteSize: upload.byteSize + 1 }],
      }).success
    ).toBe(false);
    expect(
      kalakritiResultSaveSchema.safeParse({
        ...valid,
        uploads: [{ ...upload, mimeType: "text/plain" }],
      }).success
    ).toBe(false);
    expect(
      kalakritiResultSaveSchema.safeParse({
        ...valid,
        uploads: Array.from({ length: 11 }, () => upload),
      }).success
    ).toBe(false);
  });

  it("saves a draft without points, then publishes both awards with one immutable revision per change", async () => {
    const f = fixture();
    await f.execute("save", f.args("draft"));
    expect(f.rows.kalakritiResult[0]).toMatchObject({
      status: "draft",
      version: 1,
    });
    expect(f.rows.kalakritiResultsState[0]).toMatchObject({
      winnerPoints: null,
      runnerUpPoints: null,
    });
    await f.execute("save", f.args());
    expect(f.rows.kalakritiResult[0]).toMatchObject({
      status: "published",
      version: 2,
      winnerEntryId: f.entryIds[0],
      runnerUpEntryId: f.entryIds[1],
    });
    expect(f.rows.kalakritiResultsState[0]).toMatchObject({
      winnerPoints: 10,
      runnerUpPoints: 5,
    });
    expect(f.rows.kalakritiResultRevision).toHaveLength(2);
    expect(f.rows.kalakritiResultScorecard).toHaveLength(1);
  });

  it("corrects, withdraws, and replays the same revision without duplicating a change", async () => {
    const f = fixture();
    const first = f.args();
    await f.execute("save", first);
    const count = f.mutations.length;
    await f.execute("save", first);
    expect(f.mutations).toHaveLength(count);
    await f.execute("save", {
      ...f.args(),
      winnerEntryId: f.entryIds[1],
      runnerUpEntryId: f.entryIds[0],
    });
    expect(f.rows.kalakritiResult[0]).toMatchObject({
      version: 2,
      winnerEntryId: f.entryIds[1],
    });
    const withdraw = {
      editionId: f.editionId,
      divisionId: f.divisionId,
      revisionId: uuidv7(),
      expectedVersion: 2,
      now: 300,
    };
    await f.execute("withdraw", withdraw);
    expect(f.rows.kalakritiResult[0]).toMatchObject({
      status: "draft",
      version: 3,
    });
    expect(f.rows.kalakritiResultRevision).toHaveLength(3);
    const withdrawnCount = f.mutations.length;
    await f.execute("withdraw", withdraw);
    expect(f.mutations).toHaveLength(withdrawnCount);
  });

  it("blocks only result award slots with completed handovers", async () => {
    const f = fixture();
    await f.execute("save", f.args());
    f.rows.kalakritiAwardHandover.push({
      id: uuidv7(),
      editionId: f.editionId,
      divisionId: f.divisionId,
      entryId: f.entryIds[0],
      studentId: f.studentIds[0],
      award: "winner",
      awarded: true,
      version: 1,
    });
    await expect(
      f.execute("save", {
        ...f.args(),
        winnerEntryId: f.entryIds[2],
      })
    ).rejects.toThrow("Undo awarded prizes");
    await expect(
      f.execute("withdraw", {
        editionId: f.editionId,
        divisionId: f.divisionId,
        revisionId: uuidv7(),
        expectedVersion: 1,
        now: 300,
      })
    ).rejects.toThrow("Undo awarded prizes");

    await f.execute("save", {
      ...f.args(),
      scorecardIds: [f.scorecardId],
    });
    expect(f.rows.kalakritiResult[0]?.version).toBe(2);

    f.rows.kalakritiAwardHandover[0]!.awarded = false;
    await f.execute("save", {
      ...f.args(),
      winnerEntryId: f.entryIds[2],
    });
    expect(f.rows.kalakritiResult[0]?.winnerEntryId).toBe(f.entryIds[2]);
  });

  it("rejects incomplete, duplicate, foreign, and stale awards", async () => {
    const f = fixture();
    await expect(
      f.execute("save", { ...f.args(), runnerUpEntryId: f.entryIds[0] })
    ).rejects.toThrow("different entries");
    await expect(
      f.execute("save", { ...f.args(), runnerUpEntryId: null })
    ).rejects.toThrow("Both winner");
    await expect(
      f.execute("save", { ...f.args(), scorecardIds: [] })
    ).rejects.toThrow("scorecards");
    await expect(
      f.execute("save", { ...f.args(), scorecardIds: [uuidv7()] })
    ).rejects.toThrow("Scorecard does not belong");
    await expect(
      f.execute("save", { ...f.args(), winnerEntryId: uuidv7() })
    ).rejects.toThrow("Award entry");
    await expect(
      f.execute("save", { ...f.args(), divisionId: uuidv7() })
    ).rejects.toThrow("Division not found");
    await expect(
      f.execute("save", { ...f.args(), editionId: uuidv7() })
    ).rejects.toThrow("Division not found");
    expect(f.rows.kalakritiResult).toHaveLength(0);
    await f.execute("save", f.args());
    await expect(
      f.execute("save", { ...f.args(), expectedVersion: 0 })
    ).rejects.toThrow("Results changed");
    expect(f.rows.kalakritiResultRevision).toHaveLength(1);
  });

  it("requires every group member to attend the actual session", async () => {
    const f = fixture();
    f.rows.kalakritiOperation[1]!.competitionSessionId = uuidv7();
    await expect(f.execute("save", f.args())).rejects.toThrow("Every member");
    f.rows.kalakritiOperation[1]!.competitionSessionId = f.sessionId;
    f.rows.kalakritiOperation[1]!.supersededByOperationId = uuidv7();
    await expect(f.execute("save", f.args())).rejects.toThrow("Every member");
    f.rows.kalakritiOperation[1]!.supersededByOperationId = null;
    await f.execute("save", f.args());
    expect(f.rows.kalakritiResult[0]?.status).toBe("published");
  });

  it.each([
    "competition_coordinator",
    "competition_category_lead",
    "overall_events_lead",
    "edition_admin",
  ])("allows scoped %s", async (responsibility) => {
    const f = fixture();
    f.role(
      responsibility,
      responsibility === "competition_coordinator"
        ? "competition"
        : responsibility === "competition_category_lead"
          ? "category"
          : "none"
    );
    await f.execute("save", f.args(), f.staff);
    expect(f.rows.kalakritiResult).toHaveLength(1);
  });

  it.each(["unassigned", "guardian", "wrong competition", "wrong category"])(
    "denies %s",
    async (variant) => {
      const f = fixture();
      if (variant === "guardian") {
        f.role("overall_events_lead");
        f.rows.kalakritiEditionMembership[0]!.kind = "guardian";
      }
      if (variant === "wrong competition")
        f.role("competition_coordinator", "none");
      if (variant === "wrong category")
        f.role("competition_category_lead", "none");
      await expect(f.execute("save", f.args(), f.staff)).rejects.toThrow(
        "Unauthorized"
      );
      expect(f.mutations).toHaveLength(0);
    }
  );

  it("limits finalization and reopening to Edition-wide result managers", async () => {
    const f = fixture();
    f.role("competition_coordinator", "competition");
    await f.execute("save", f.args(), f.staff);
    await expect(
      f.execute(
        "finalize",
        {
          ...f.stateArgs(),
          winnerCenterId: f.centerIds[0],
          runnerUpCenterId: f.centerIds[1],
          tieReason: null,
        },
        f.staff
      )
    ).rejects.toThrow("Unauthorized");
    f.role("overall_events_lead");
    await f.execute(
      "finalize",
      {
        ...f.stateArgs(),
        winnerCenterId: f.centerIds[0],
        runnerUpCenterId: f.centerIds[1],
        tieReason: null,
      },
      f.staff
    );
    await f.execute("reopen", f.stateArgs(), f.staff);
    expect(f.rows.kalakritiStandingsRevision).toHaveLength(2);
  });

  it("keeps archived Editions read-only and rejects stale standings versions", async () => {
    const f = fixture();
    f.edition.lifecycle = "archived";
    await expect(f.execute("save", f.args())).rejects.toThrow("Live Edition");
    f.edition.lifecycle = "live";
    await f.execute("save", f.args());
    await expect(
      f.execute("finalize", {
        ...f.stateArgs(),
        expectedVersion: 0,
        winnerCenterId: f.centerIds[0],
        runnerUpCenterId: f.centerIds[1],
        tieReason: null,
      })
    ).rejects.toThrow("Standings changed");
    expect(f.rows.kalakritiStandingsRevision).toHaveLength(0);
  });

  it("finalizes only after all active events publish, then locks edits until reopened", async () => {
    const f = fixture();
    const secondDivisionId = uuidv7();
    const secondSessionId = uuidv7();
    f.rows.kalakritiCompetitionDivision.push({
      id: secondDivisionId,
      editionId: f.editionId,
      competitionId: f.competitionId,
      ageCategoryId: f.ageId,
    });
    f.rows.kalakritiCompetitionSession.push({
      id: secondSessionId,
      editionId: f.editionId,
      divisionId: secondDivisionId,
      cancelledAt: null,
    });
    await f.execute("save", f.args());
    await expect(
      f.execute("finalize", {
        ...f.stateArgs(),
        winnerCenterId: f.centerIds[0],
        runnerUpCenterId: f.centerIds[1],
        tieReason: null,
      })
    ).rejects.toThrow("every active event");
    f.rows.kalakritiCompetitionSession[1]!.cancelledAt = 1;
    await f.execute("finalize", {
      ...f.stateArgs(),
      winnerCenterId: f.centerIds[0],
      runnerUpCenterId: f.centerIds[1],
      tieReason: null,
    });
    expect(f.rows.kalakritiResultsState[0]).toMatchObject({
      winnerCenterId: f.centerIds[0],
      runnerUpCenterId: f.centerIds[1],
      finalizedAt: 200,
    });
    await expect(f.execute("save", f.args())).rejects.toThrow(
      "Reopen overall results"
    );
    const reopen = f.stateArgs();
    await f.execute("reopen", reopen);
    expect(f.rows.kalakritiResultsState[0]).toMatchObject({
      finalizedAt: null,
      winnerCenterId: null,
      runnerUpCenterId: null,
    });
    await f.execute("save", f.args());
    expect(f.rows.kalakritiStandingsRevision.map((row) => row.action)).toEqual([
      "finalized",
      "reopened",
    ]);
  });

  it("requires an explicit reason to resolve an overall tie", async () => {
    const f = fixture();
    await f.execute("save", f.args());
    const state = f.stateArgs();
    f.rows.kalakritiCenter[1]!.name = "Beta";
    f.rows.kalakritiCenter[2]!.name = "Gamma";
    const secondDivisionId = uuidv7();
    const secondSessionId = uuidv7();
    f.rows.kalakritiCompetitionDivision.push({
      id: secondDivisionId,
      editionId: f.editionId,
      competitionId: f.competitionId,
      ageCategoryId: f.ageId,
    });
    f.rows.kalakritiCompetitionSession.push({
      id: secondSessionId,
      editionId: f.editionId,
      divisionId: secondDivisionId,
      cancelledAt: null,
    });
    f.rows.kalakritiCompetitionEntry.push(
      {
        id: uuidv7(),
        editionId: f.editionId,
        divisionId: secondDivisionId,
        centerId: f.centerIds[1],
      },
      {
        id: uuidv7(),
        editionId: f.editionId,
        divisionId: secondDivisionId,
        centerId: f.centerIds[0],
      }
    );
    const secondEntries = f.rows.kalakritiCompetitionEntry.slice(-2);
    for (const entry of secondEntries) {
      const studentId = uuidv7();
      f.rows.kalakritiEntryMember.push({
        id: uuidv7(),
        editionId: f.editionId,
        entryId: entry!.id,
        studentId,
      });
      f.rows.kalakritiOperation.push({
        id: uuidv7(),
        editionId: f.editionId,
        competitionSessionId: secondSessionId,
        studentId,
        type: "competition_attendance",
        supersededByOperationId: null,
      });
    }
    f.rows.kalakritiResultScorecard.push({
      id: uuidv7(),
      editionId: f.editionId,
      divisionId: secondDivisionId,
    });
    await f.execute("save", {
      ...f.args(),
      divisionId: secondDivisionId,
      resultId: uuidv7(),
      expectedVersion: 0,
      winnerEntryId: secondEntries[0]!.id,
      runnerUpEntryId: secondEntries[1]!.id,
      scorecardIds: [f.rows.kalakritiResultScorecard.at(-1)!.id],
    });
    await expect(
      f.execute("finalize", {
        ...state,
        expectedVersion: 2,
        winnerCenterId: f.centerIds[0],
        runnerUpCenterId: f.centerIds[1],
        tieReason: null,
      })
    ).rejects.toThrow("reason");
    await f.execute("finalize", {
      ...f.stateArgs(),
      winnerCenterId: f.centerIds[0],
      runnerUpCenterId: f.centerIds[1],
      tieReason: "Judges resolved the tie",
    });
    expect(f.rows.kalakritiStandingsRevision[0]?.tieReason).toBe(
      "Judges resolved the tie"
    );
  });

  it("serializes concurrent saves and finalization against the Edition lock", async () => {
    const f = fixture();
    const save = f.args();
    const outcomes = await Promise.allSettled([
      f.execute("save", save),
      f.execute("save", { ...save, revisionId: uuidv7() }),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(f.rows.kalakritiResultRevision).toHaveLength(1);
    const finalize = {
      ...f.stateArgs(),
      winnerCenterId: f.centerIds[0],
      runnerUpCenterId: f.centerIds[1],
      tieReason: null,
    };
    const correction = f.args();
    const race = await Promise.allSettled([
      f.execute("finalize", finalize),
      f.execute("save", correction),
    ]);
    expect(race.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(f.locks()).toBe(4);
    expect(f.rows.kalakritiResultRevision).toHaveLength(1);
  });

  it("does not execute client mutations", async () => {
    const f = fixture();
    await f.execute("save", f.args(), f.admin, "client");
    await f.execute(
      "finalize",
      {
        ...f.stateArgs(),
        winnerCenterId: f.centerIds[0],
        runnerUpCenterId: f.centerIds[1],
        tieReason: null,
      },
      f.admin,
      "client"
    );
    expect(f.locks()).toBe(0);
    expect(f.mutations).toHaveLength(0);
  });
});
