import { describe, expect, it } from "bun:test";

import { uuidv7 } from "uuidv7";

import { getKalakritiFoodStatus } from "../../kalakriti-food-rules";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  kalakritiOperationMutators,
  kalakritiOperationRecordSchema,
  kalakritiOperationRecordManualSchema,
} from "../kalakriti-operation";

type Row = Record<string, unknown>;
function fixture(type = "breakfast", kind = "student") {
  const edition = {
    id: uuidv7(),
    lifecycle: "live",
    eventDate: "2027-11-21",
    year: 2027,
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
    supersededByOperationId: null as string | null,
    competitionSessionId: null,
    correctionReason: null,
    recordedBy: "server",
    occurredAt: 1,
    createdAt: 1,
  };
  const rows: Record<string, Row[]> = {
    kalakritiOperation: [
      { ...original, id: uuidv7(), operationId: uuidv7(), type: "pickup" },
      original,
    ],
    kalakritiEditionMembership: [
      {
        id: actorId,
        editionId: edition.id,
        userId: "operator",
        kind: "volunteer",
        state: "active",
      },
      ...(kind === "student"
        ? []
        : [
            {
              id: subjectId,
              editionId: edition.id,
              userId: "subject",
              kind,
              state: "active",
            },
          ]),
    ],
    kalakritiAssignment: [],
    kalakritiStudent: [
      {
        id: subjectId,
        editionId: edition.id,
        centerId: uuidv7(),
        humanId: "KAL-2027-0001",
      },
    ],
    kalakritiAuditEntry: [],
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
  let lockTail = Promise.resolve();
  let lockCount = 0;
  const mutations: { table: string; action: string; row: Row }[] = [];
  async function execute(
    command: "undoMeal" | "record" | "recordManual",
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
        lockCount += 1;
        return [edition];
      },
    };
    const tx = {
      location,
      dbTransaction: { wrappedTransaction: { select: () => builder } },
      run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
        if (!locked) throw new Error("Operation query before Edition lock");
        const result = (rows[query.ast.table] ?? []).filter((row) =>
          matchesScope(row as ScopeRow, query.ast.where, rows as ScopeTables)
        );
        return query.format.singular ? result[0] : result;
      },
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
      await kalakritiOperationMutators[command].fn({ tx, ctx, args } as never);
    } finally {
      release?.();
    }
  }
  const undoArgs = () => ({
    editionId: edition.id,
    targetOperationId: original.id,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: 10,
  });
  const serveArgs = () => ({
    editionId: edition.id,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: 20,
    occurredAt: 20,
    type,
    personQr: JSON.stringify({ id: subjectId, type: kind }),
  });
  const roles = (...responsibilities: string[]) => {
    rows.kalakritiAssignment = responsibilities.map((responsibility) => ({
      id: uuidv7(),
      editionId: edition.id,
      membershipId: actorId,
      responsibility,
    }));
  };
  const status = () =>
    getKalakritiFoodStatus({
      kind: "student",
      operations: rows.kalakritiOperation as unknown as {
        type: string;
        supersededByOperationId: string | null;
      }[],
    });
  return {
    edition,
    original,
    rows,
    admin,
    staff,
    mutations,
    execute,
    undoArgs,
    serveArgs,
    roles,
    status,
    locks: () => lockCount,
  };
}

describe("immutable meal correction", () => {
  for (const kind of ["student", "volunteer", "guardian"]) {
    it.each(["breakfast", "lunch"])(
      `corrects ${kind} %s while preserving the serving record`,
      async (type) => {
        const state = fixture(type, kind);
        const before = { ...state.original };
        const args = state.undoArgs();
        await state.execute("undoMeal", args);
        expect(state.original).toEqual({
          ...before,
          supersededByOperationId: args.id,
        });
        expect(
          state.rows.kalakritiOperation!.find((row) => row.id === args.id)
        ).toMatchObject({
          type: "meal_correction",
          correctionReason: "meal_unserved",
          studentId: before.studentId,
          membershipId: before.membershipId,
          supersededByOperationId: null,
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
        expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
        expect(state.rows.kalakritiAuditEntry![0]).toMatchObject({
          action: "corrected",
          targetId: before.id,
          reason: null,
          metadata: {
            correctionId: args.id,
            operationId: args.operationId,
            type,
          },
        });
        expect(state.status().breakfastServed).toBe(false);
        expect(state.status().lunchServed).toBe(false);
      }
    );
  }
  it.each(["edition_admin", "food_lead"])("allows %s", async (role) => {
    const state = fixture();
    state.roles(role);
    await state.execute("undoMeal", state.undoArgs(), state.staff);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
  });
  it.each([
    "food_member",
    "hospitality_lead",
    "liaison",
    "liaison_lead",
    "transport_lead",
    "competition_coordinator",
  ])("denies %s without changing history", async (role) => {
    const state = fixture();
    state.roles(role);
    await expect(
      state.execute("undoMeal", state.undoArgs(), state.staff)
    ).rejects.toThrow("Unauthorized");
    expect(state.mutations).toEqual([]);
  });
  it("combines roles additively", async () => {
    const state = fixture();
    state.roles("food_member", "food_lead");
    await state.execute("undoMeal", state.undoArgs(), state.staff);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
  });
  it.each(["archived", "guardian", "foreign-assignment", "foreign-membership"])(
    "rejects invalid %s operator authority",
    async (invalid) => {
      const state = fixture();
      state.roles("food_lead");
      if (invalid === "archived")
        state.rows.kalakritiEditionMembership![0]!.state = "archived";
      if (invalid === "guardian")
        state.rows.kalakritiEditionMembership![0]!.kind = "guardian";
      if (invalid === "foreign-assignment")
        state.rows.kalakritiAssignment![0]!.editionId = uuidv7();
      if (invalid === "foreign-membership")
        state.rows.kalakritiEditionMembership![0]!.editionId = uuidv7();
      await expect(
        state.execute("undoMeal", state.undoArgs(), state.staff)
      ).rejects.toThrow("Unauthorized");
      expect(state.mutations).toEqual([]);
    }
  );
  it.each(["draft", "registration_open", "registration_locked", "archived"])(
    "rejects fresh correction in %s",
    async (lifecycle) => {
      const state = fixture();
      state.edition.lifecycle = lifecycle;
      await expect(state.execute("undoMeal", state.undoArgs())).rejects.toThrow(
        "edition_not_live"
      );
      expect(state.mutations).toEqual([]);
    }
  );
  it("rejects cross-Edition targets", async () => {
    const state = fixture();
    state.original.editionId = uuidv7();
    await expect(state.execute("undoMeal", state.undoArgs())).rejects.toThrow(
      "Meal mark not found"
    );
    expect(state.mutations).toEqual([]);
  });
  it.each([
    "pickup",
    "volunteer_check_in",
    "competition_attendance",
    "meal_correction",
  ])("cannot correct %s", async (type) => {
    const state = fixture(type);
    await expect(state.execute("undoMeal", state.undoArgs())).rejects.toThrow(
      "Only meal marks"
    );
    expect(state.mutations).toEqual([]);
  });
  it("allows a fresh serving after correction but leaves original serving-ID retries as no-ops", async () => {
    const state = fixture();
    const undo = state.undoArgs();
    await state.execute("undoMeal", undo);
    const replay = {
      ...state.serveArgs(),
      operationId: state.original.operationId,
    };
    await state.execute("record", replay, { ...state.admin, userId: "server" });
    expect(state.status().breakfastServed).toBe(false);
    const replacement = state.serveArgs();
    await state.execute("record", replacement);
    expect(state.status().breakfastServed).toBe(true);
    const count = state.mutations.length;
    await state.execute("undoMeal", undo);
    expect(state.mutations).toHaveLength(count);
    expect(
      state.rows.kalakritiOperation!.find((row) => row.id === replacement.id)!
        .supersededByOperationId
    ).toBeNull();
    await expect(state.execute("undoMeal", state.undoArgs())).rejects.toThrow(
      "Meal mark is no longer effective"
    );
    expect(state.status().breakfastServed).toBe(true);
  });
  it("replays the original authorized undo after role removal and archival without new changes", async () => {
    const state = fixture();
    state.roles("food_lead");
    const args = state.undoArgs();
    await state.execute("undoMeal", args, state.staff);
    state.roles("food_member");
    state.edition.lifecycle = "archived";
    const count = state.mutations.length;
    await state.execute("undoMeal", args, state.staff);
    expect(state.mutations).toHaveLength(count);
  });
  it.each(["target", "actor", "edition", "row"])(
    "binds original undo-ID retry to its %s",
    async (changed) => {
      const state = fixture();
      const args = state.undoArgs();
      await state.execute("undoMeal", args);
      const retry = { ...args };
      let ctx = state.admin;
      if (changed === "target") retry.targetOperationId = uuidv7();
      if (changed === "edition") retry.editionId = uuidv7();
      if (changed === "row") retry.id = uuidv7();
      if (changed === "actor") ctx = { ...state.staff, userId: "other" };
      await expect(state.execute("undoMeal", retry, ctx)).rejects.toThrow(
        "Operation ID is already in use"
      );
      expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
    }
  );
  it("serializes concurrent undos and serving against the shared Edition lock", async () => {
    const state = fixture();
    const first = state.undoArgs();
    const second = state.undoArgs();
    const serve = state.serveArgs();
    const results = await Promise.allSettled([
      state.execute("undoMeal", first),
      state.execute("undoMeal", second),
      state.execute("record", serve),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(state.locks()).toBe(3);
    expect(state.status().breakfastServed).toBe(true);
    expect(
      state.rows.kalakritiOperation!.filter(
        (row) => row.type === "meal_correction"
      )
    ).toHaveLength(1);
    await state.execute("undoMeal", first);
    expect(state.status().breakfastServed).toBe(true);
  });
  it("deduplicates concurrent retries of the same undo ID", async () => {
    const state = fixture();
    const args = state.undoArgs();
    await Promise.all([
      state.execute("undoMeal", args),
      state.execute("undoMeal", args),
    ]);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
    expect(
      state.rows.kalakritiOperation!.filter(
        (row) => row.type === "meal_correction"
      )
    ).toHaveLength(1);
  });
  it("rejects correction fabrication through generic record schemas and runtime", async () => {
    const state = fixture();
    const args = {
      ...state.serveArgs(),
      type: "meal_correction",
      humanId: "KAL-2027-0001",
    };
    expect(kalakritiOperationRecordSchema.safeParse(args).success).toBe(false);
    expect(kalakritiOperationRecordManualSchema.safeParse(args).success).toBe(
      false
    );
    await expect(state.execute("record", args)).rejects.toThrow(
      "Unsupported operation type"
    );
    await expect(state.execute("recordManual", args)).rejects.toThrow(
      "Unsupported operation type"
    );
    expect(state.mutations).toEqual([]);
  });
  it("does not use a serving operation ID for an undo", async () => {
    const state = fixture();
    await expect(
      state.execute("undoMeal", {
        ...state.undoArgs(),
        operationId: state.original.operationId,
      })
    ).rejects.toThrow("Operation ID is already in use");
    expect(state.mutations).toEqual([]);
  });
  it("defers client execution to the server", async () => {
    const state = fixture();
    await state.execute("undoMeal", state.undoArgs(), state.admin, "client");
    expect(state.locks()).toBe(0);
    expect(state.mutations).toEqual([]);
  });
});
