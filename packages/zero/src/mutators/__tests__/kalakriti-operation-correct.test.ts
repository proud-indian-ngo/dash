import { describe, expect, it } from "bun:test";

import { uuidv7 } from "uuidv7";

import {
  getKalakritiCenterScanProgress,
  getKalakritiCenterTransportStatus,
  getKalakritiStudentTransportLabel,
} from "../../kalakriti-center-scan-rules";
import { getKalakritiFoodStatus } from "../../kalakriti-food-rules";
import {
  correctionOperations,
  kalakritiOperationQueries,
} from "../../queries/kalakriti-operation";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { kalakritiOperationMutators } from "../kalakriti-operation";

type Row = Record<string, unknown>;
function fixture(type = "breakfast", kind = "student") {
  const edition = { id: uuidv7(), lifecycle: "live", eventDate: "2027-11-21" };
  const center = {
    id: uuidv7(),
    editionId: edition.id,
    retiredAt: null,
    studentRegistrationEnabled: false,
    competitionEntryRegistrationEnabled: false,
  };
  const subjectId = uuidv7();
  const actorId = uuidv7();
  const original = {
    id: uuidv7(),
    operationId: uuidv7(),
    editionId: edition.id,
    type,
    studentId: kind === "student" ? subjectId : null,
    membershipId: kind === "student" ? null : subjectId,
    competitionSessionId: null as string | null,
    occurredAt: 1,
    createdAt: 1,
    recordedBy: "recorder",
    correctionReason: null,
    supersededByOperationId: null as string | null,
  };
  const rows: Record<string, Row[]> = {
    kalakritiEdition: [edition],
    kalakritiCenter: [center],
    kalakritiOperation: [original],
    kalakritiAuditEntry: [],
    kalakritiAssignment: [],
    kalakritiStudent: [
      {
        id: subjectId,
        editionId: edition.id,
        centerId: center.id,
        humanId: "KAL-2027-0001",
      },
    ],
    kalakritiEditionMembership: [
      {
        id: actorId,
        editionId: edition.id,
        kind: "volunteer",
        state: "active",
        userId: "operator",
      },
      ...(kind === "student"
        ? []
        : [
            {
              id: subjectId,
              editionId: edition.id,
              kind,
              state: "active",
              humanId: "KALG-2027-0001",
              userId: "subject",
            },
          ]),
    ],
  };
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
  const mutations: { table: string; action: string; row: Row }[] = [];
  let tail = Promise.resolve();
  const select = (query: { ast: ScopeAst; format: { singular: boolean } }) => {
    const result = (rows[query.ast.table] ?? []).filter((row) =>
      matchesScope(row as ScopeRow, query.ast.where, rows as ScopeTables)
    );
    return query.format.singular ? result[0] : result;
  };
  async function execute(
    args: Row,
    ctx = admin,
    command: "correct" | "undoMeal" = "correct",
    location = "server"
  ) {
    let release: (() => void) | undefined;
    let locked = false;
    const builder = {
      from: () => builder,
      where: () => builder,
      for: async () => {
        if (locked) return [center];
        const previous = tail;
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        locked = true;
        return [edition];
      },
    };
    const tx = {
      location,
      dbTransaction: { wrappedTransaction: { select: () => builder } },
      run: async (query: Parameters<typeof select>[0]) => select(query),
      mutate: Object.fromEntries(
        Object.keys(rows).map((table) => [
          table,
          {
            insert: async (row: Row) => {
              mutations.push({ table, action: "insert", row });
              rows[table]!.push(row);
            },
            update: async (row: Row) => {
              mutations.push({ table, action: "update", row });
              Object.assign(
                rows[table]!.find((entry) => entry.id === row.id)!,
                row
              );
            },
          },
        ])
      ),
    };
    try {
      await kalakritiOperationMutators[command].fn({ args, ctx, tx } as never);
    } finally {
      release?.();
    }
  }
  const args = () => ({
    editionId: edition.id,
    targetOperationId: original.id,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: 10,
    reason: "Reviewed the original scan",
  });
  const role = (responsibility: string) => {
    rows.kalakritiAssignment = [
      {
        id: uuidv7(),
        membershipId: actorId,
        editionId: edition.id,
        responsibility,
      },
    ];
  };
  return {
    edition,
    center,
    subjectId,
    original,
    rows,
    admin,
    staff,
    mutations,
    select,
    execute,
    args,
    role,
  };
}

describe("same-fact operation correction", () => {
  for (const type of [
    "pickup",
    "venue_arrival",
    "venue_departure",
    "drop_off",
    "breakfast",
    "lunch",
    "competition_attendance",
    "volunteer_check_in",
  ]) {
    it(`preserves every ${type} fact field and updates only the original pointer`, async () => {
      const state = fixture(
        type,
        type === "volunteer_check_in" ? "volunteer" : "student"
      );
      if (type === "competition_attendance")
        state.original.competitionSessionId = uuidv7();
      const before = { ...state.original };
      const args = state.args();
      await state.execute(args);
      expect(state.rows.kalakritiOperation?.[1]).toEqual({
        ...before,
        id: args.id,
        operationId: args.operationId,
        recordedBy: "operator",
        createdAt: args.now,
        correctionReason: args.reason,
      });
      expect(state.original).toEqual({
        ...before,
        supersededByOperationId: args.id,
      });
      expect(
        state.mutations.filter((mutation) => mutation.action === "update")
      ).toEqual([
        {
          table: "kalakritiOperation",
          action: "update",
          row: { id: before.id, supersededByOperationId: args.id },
        },
      ]);
      expect(state.rows.kalakritiAuditEntry?.[0]).toMatchObject({
        targetId: before.id,
        action: "corrected",
        reason: null,
        metadata: {
          correctionId: args.id,
          operationId: args.operationId,
          type,
        },
      });
    });
  }
  it("keeps Guardian meals served and coexists with exact-target meal undo", async () => {
    const state = fixture("lunch", "guardian");
    state.role("food_lead");
    const args = state.args();
    await state.execute(args, state.staff);
    const status = () =>
      getKalakritiFoodStatus({
        kind: "guardian",
        state: "active",
        operations: state.rows.kalakritiOperation as never,
      });
    expect(status().lunchServed).toBe(true);
    await expect(
      state.execute(
        { ...state.args(), targetOperationId: state.original.id },
        state.admin,
        "undoMeal"
      )
    ).rejects.toThrow("no longer effective");
    await state.execute(
      { ...state.args(), targetOperationId: args.id },
      state.admin,
      "undoMeal"
    );
    expect(status().lunchServed).toBe(false);
    const count = state.mutations.length;
    await state.execute(args, state.staff);
    expect(state.mutations).toHaveLength(count);
  });
  it("accepts only the exact accepted command before lifecycle validation", async () => {
    const state = fixture();
    const args = state.args();
    await state.execute(args);
    state.edition.lifecycle = "archived";
    await state.execute(args);
    expect(state.mutations).toHaveLength(3);
    for (const changed of [
      { reason: "Changed" },
      { now: 11 },
      { id: uuidv7() },
      { auditEntryId: uuidv7() },
    ])
      await expect(state.execute({ ...args, ...changed })).rejects.toThrow(
        "already in use"
      );
    await expect(
      state.execute(args, { ...state.admin, userId: "another-admin" })
    ).rejects.toThrow("already in use");
    await expect(state.execute(state.args())).rejects.toThrow(
      "edition_not_live"
    );
  });
  it("retains current scope authorization on retries", async () => {
    const state = fixture();
    state.role("food_lead");
    const args = state.args();
    await state.execute(args, state.staff);
    state.role("food_member");
    await expect(state.execute(args, state.staff)).rejects.toThrow(
      "unauthorized"
    );
  });
  it("serializes competing revisions and rejects the stale loser", async () => {
    const state = fixture();
    const results = await Promise.allSettled([
      state.execute(state.args()),
      state.execute(state.args()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(state.rows.kalakritiOperation).toHaveLength(2);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
  });
  it("rejects correction markers and foreign targets without disclosing them", async () => {
    const state = fixture("meal_correction", "guardian");
    await expect(state.execute(state.args())).rejects.toThrow("unauthorized");
    state.original.type = "breakfast";
    await expect(
      state.execute({ ...state.args(), editionId: uuidv7() })
    ).rejects.toThrow("unauthorized");
    expect(state.mutations).toHaveLength(0);
  });
  it("does not write optimistic revisions", async () => {
    const state = fixture();
    await state.execute(state.args(), state.admin, "correct", "client");
    expect(state.mutations).toHaveLength(0);
  });
  for (const [type, kind, allowed] of [
    ["pickup", "student", "transport_lead"],
    ["venue_arrival", "student", "transport_lead"],
    ["volunteer_check_in", "volunteer", "hospitality_lead"],
    ["breakfast", "guardian", "food_lead"],
  ]) {
    it(`limits ${type} to its lead and admins`, async () => {
      const state = fixture(type, kind);
      state.role(allowed!);
      await state.execute(state.args(), state.staff);
      for (const denied of [
        "transport_member",
        "center_liaison_lead",
        "liaison",
        "hospitality_member",
        "food_member",
        "competition_volunteer",
      ]) {
        state.role(denied);
        await expect(state.execute(state.args(), state.staff)).rejects.toThrow(
          "unauthorized"
        );
      }
    });
  }
  it("scopes attendance reads and writes to the original Competition even after cancellation", async () => {
    const state = fixture("competition_attendance");
    const competitionId = uuidv7();
    const divisionId = uuidv7();
    const sessionId = uuidv7();
    state.original.competitionSessionId = sessionId;
    state.rows.kalakritiCompetition = [
      { id: competitionId, editionId: state.edition.id, cancelledAt: 2 },
    ];
    state.rows.kalakritiCompetitionDivision = [
      { id: divisionId, editionId: state.edition.id, competitionId },
    ];
    state.rows.kalakritiCompetitionSession = [
      {
        id: sessionId,
        editionId: state.edition.id,
        divisionId,
        cancelledAt: 2,
      },
    ];
    state.role("competition_coordinator");
    Object.assign(state.rows.kalakritiAssignment![0]!, { competitionId });
    await state.execute(state.args(), state.staff);
    state.rows.kalakritiAssignment![0]!.competitionId = uuidv7();
    await expect(state.execute(state.args(), state.staff)).rejects.toThrow(
      "unauthorized"
    );
  });
  it("returns scoped superseded originals and resolves Guardian IDs without User joins", async () => {
    const state = fixture("breakfast", "guardian");
    state.role("food_lead");
    const args = state.args();
    await state.execute(args, state.staff);
    const query = kalakritiOperationQueries.bySubject.fn({
      args: { editionId: state.edition.id, membershipId: state.subjectId },
      ctx: state.staff,
    } as never);
    expect(state.select(query as never)).toHaveLength(2);
    for (const humanId of [state.subjectId, "KALG-2027-0001"]) {
      const lookup = kalakritiOperationQueries.membershipByHumanId.fn({
        args: { editionId: state.edition.id, humanId },
        ctx: state.staff,
      } as never);
      expect(state.select(lookup as never)).toMatchObject({
        id: state.subjectId,
      });
    }
    state.rows.kalakritiEditionMembership![0]!.kind = "guardian";
    expect(
      state.select(correctionOperations(state.edition.id, state.staff) as never)
    ).toEqual([]);
  });
  it("hides archived Edition history from staff while preserving accepted retries", async () => {
    const state = fixture("breakfast", "guardian");
    state.role("food_lead");
    const args = state.args();
    await state.execute(args, state.staff);
    state.edition.lifecycle = "archived";
    const read = (ctx: typeof state.staff) =>
      state.select(
        kalakritiOperationQueries.bySubject.fn({
          args: { editionId: state.edition.id, membershipId: state.subjectId },
          ctx,
        } as never) as never
      );
    expect(read(state.staff)).toEqual([]);
    expect(read(state.admin)).toHaveLength(2);
    await state.execute(args, state.staff);
    expect(state.mutations).toHaveLength(3);
  });
  for (const finalized of [false, true])
    for (const type of [
      "pickup",
      "venue_arrival",
      "venue_departure",
      "drop_off",
    ] as const) {
      it(`preserves ${finalized ? "finalized" : "open"} ${type} stage counts, status and eligibility`, async () => {
        const state = fixture(type);
        const stages = [
          "pickup",
          "venue_arrival",
          "venue_departure",
          "drop_off",
        ] as const;
        const index = stages.indexOf(type);
        state.rows.kalakritiOperation = stages
          .slice(0, index + 1)
          .map((stage) =>
            stage === type
              ? state.original
              : {
                  ...state.original,
                  id: uuidv7(),
                  operationId: uuidv7(),
                  type: stage,
                }
          );
        const scanStages = stages.map((stage, position) => ({
          stage,
          finalizedAt:
            position < index || (finalized && position === index) ? 2 : null,
        }));
        const snapshot = () => {
          const operations = state.rows.kalakritiOperation as never;
          const progress = getKalakritiCenterScanProgress({
            scanStages,
            students: [
              {
                id: state.subjectId,
                humanId: "KAL-2027-0001",
                name: "Student",
                operations,
              },
            ],
          });
          return {
            stage: progress.stage,
            roster: progress.roster.map((row) => row.id),
            scanned: progress.scannedStudents.map((row) => row.id),
            missing: progress.missingStudents.map((row) => row.id),
            canFinalize: progress.canFinalize,
            status: getKalakritiCenterTransportStatus(scanStages),
            label: getKalakritiStudentTransportLabel(operations),
            food: getKalakritiFoodStatus({ kind: "student", operations }),
          };
        };
        const before = snapshot();
        await state.execute(state.args());
        expect(snapshot()).toEqual(before);
        expect(
          state.mutations.every((mutation) =>
            ["kalakritiOperation", "kalakritiAuditEntry"].includes(
              mutation.table
            )
          )
        ).toBe(true);
      });
    }
});
