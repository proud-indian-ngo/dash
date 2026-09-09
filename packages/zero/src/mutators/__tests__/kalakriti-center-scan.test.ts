import { describe, expect, it } from "bun:test";

import type { KalakritiCenterScanStage } from "@pi-dash/shared/kalakriti";
import { uuidv7 } from "uuidv7";

import { kalakritiCenterScanMutators } from "../kalakriti-center-scan";
import { kalakritiOperationMutators } from "../kalakriti-operation";

const editionId = "019f0000-1111-7000-8000-000000000001";
const centerId = "019f0000-1111-7000-8000-000000000002";
const studentId = "019f0000-1111-7000-8000-000000000003";
const secondId = "019f0000-1111-7000-8000-000000000004";
const outsideId = "019f0000-1111-7000-8000-000000000005";
type Row = Record<string, unknown>;
type Table =
  | "kalakritiStudent"
  | "kalakritiOperation"
  | "kalakritiCenterScanStage"
  | "kalakritiAuditEntry"
  | "kalakritiTransportStatusHistory"
  | "kalakritiEditionMembership"
  | "kalakritiAssignment"
  | "kalakritiTransportAssignment";
interface Condition {
  type: string;
  conditions?: Condition[];
  left?: { name: string };
  right?: { value: unknown };
  op?: string;
}
function matches(row: Row, condition?: Condition): boolean {
  if (!condition) return true;
  if (condition.type === "and")
    return (condition.conditions ?? []).every((child) => matches(row, child));
  if (condition.type === "or")
    return (condition.conditions ?? []).some((child) => matches(row, child));
  const value = row[condition.left?.name ?? ""];
  return value === condition.right?.value;
}
function setup() {
  const edition = { id: editionId, lifecycle: "live", eventDate: "2027-11-21" };
  const center = { id: centerId, editionId, retiredAt: null as Date | null };
  const rows: Record<Table, Row[]> = {
    kalakritiStudent: [studentId, secondId, outsideId].map((id, index) => ({
      id,
      editionId,
      centerId: index === 2 ? "outside" : centerId,
      name: `Student ${index}`,
      humanId: `KAL-2027-000${index + 1}`,
    })),
    kalakritiOperation: [],
    kalakritiCenterScanStage: [],
    kalakritiAuditEntry: [],
    kalakritiTransportStatusHistory: [],
    kalakritiEditionMembership: [],
    kalakritiAssignment: [],
    kalakritiTransportAssignment: [
      { id: "bus", editionId, centerId, status: "planned", deletedAt: null },
      {
        id: "deleted-bus",
        editionId,
        centerId,
        status: "planned",
        deletedAt: 1,
      },
      {
        id: "other-bus",
        editionId,
        centerId: "outside",
        status: "planned",
        deletedAt: null,
      },
    ],
  };
  const locks: string[] = [];
  const tx = {
    location: "server",
    dbTransaction: {
      wrappedTransaction: {
        select: (fields: Row) => {
          const isCenter = "retiredAt" in fields;
          const query = {
            from: () => query,
            where: () => query,
            for: async () => {
              locks.push(isCenter ? "center" : "edition");
              return [isCenter ? center : edition];
            },
          };
          return query;
        },
      },
    },
    run: async (query: {
      ast: { table: Table; where?: Condition; related?: unknown[] };
      format: { singular: boolean };
    }) => {
      let result = (rows[query.ast.table] ?? []).filter((row) =>
        matches(row, query.ast.where)
      );
      if (query.ast.table === "kalakritiStudent" && query.ast.related?.length)
        result = result.map((row) => ({
          ...row,
          operations: rows.kalakritiOperation.filter(
            (operation) => operation.studentId === row.id
          ),
        }));
      return query.format.singular ? result[0] : result;
    },
    mutate: Object.fromEntries(
      Object.keys(rows).map((table) => [
        table,
        {
          insert: async (row: Row) => {
            rows[table as Table].push(row);
          },
          update: async (row: Row) => {
            const existing = rows[table as Table].find(
              (entry) => entry.id === row.id
            );
            if (!existing) throw new Error("Missing row");
            Object.assign(existing, row);
          },
        },
      ])
    ),
  };
  const ctx = {
    userId: "admin",
    role: "admin",
    permissions: ["kalakriti.admin"],
    asyncTasks: [] as unknown[],
  };
  return { tx, ctx, rows, edition, center, locks };
}
function scanArgs(stage: KalakritiCenterScanStage = "pickup", id = studentId) {
  return {
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    editionId,
    centerId,
    expectedStage: stage,
    personQr: JSON.stringify({ id, type: "student" }),
    now: 1000,
    occurredAt: 1000,
  };
}
function finalizeArgs(expectedStage: KalakritiCenterScanStage = "pickup") {
  return {
    id: uuidv7(),
    auditEntryId: uuidv7(),
    editionId,
    centerId,
    expectedStage,
    now: 2000,
  };
}
function scan(state: ReturnType<typeof setup>, args = scanArgs()) {
  return kalakritiCenterScanMutators.record.fn({
    tx: state.tx,
    ctx: state.ctx,
    args,
  } as never);
}
function finalize(state: ReturnType<typeof setup>, args = finalizeArgs()) {
  return kalakritiCenterScanMutators.finalize.fn({
    tx: state.tx,
    ctx: state.ctx,
    args,
  } as never);
}

describe("Center scan sessions", () => {
  it("marks all four rosters without auto advance, finalizes once, and projects every active vehicle", async () => {
    const state = setup();
    const stages = [
      "pickup",
      "venue_arrival",
      "venue_departure",
      "drop_off",
    ] as const;
    const statuses = [
      "departed_center",
      "arrived_at_venue",
      "departed_venue",
      "completed",
    ];
    for (const [index, stage] of stages.entries()) {
      await scan(state, scanArgs(stage));
      if (stage !== "pickup") {
        await expect(finalize(state, finalizeArgs(stage))).rejects.toThrow(
          "Scan every picked-up Student"
        );
      }
      await scan(state, scanArgs(stage));
      expect(state.rows.kalakritiOperation).toHaveLength(index * 2 + 1);
      expect(state.rows.kalakritiTransportAssignment[0]?.status).toBe(
        index === 0 ? "planned" : statuses[index - 1]
      );
      await scan(state, scanArgs(stage, secondId));
      await finalize(state, finalizeArgs(stage));
      await finalize(state, finalizeArgs(stage));
      expect(state.rows.kalakritiTransportAssignment[0]?.status).toBe(
        statuses[index]
      );
      expect(state.rows.kalakritiTransportStatusHistory).toHaveLength(
        index + 1
      );
    }
    expect(state.rows.kalakritiOperation).toHaveLength(8);
    expect(state.rows.kalakritiCenterScanStage).toHaveLength(4);
    expect(
      state.rows.kalakritiCenterScanStage.every(
        (row) => row.finalizedBy === "admin"
      )
    ).toBe(true);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(12);
    expect(state.ctx.asyncTasks).toHaveLength(4);
    expect(
      state.rows.kalakritiTransportAssignment.slice(1).map((row) => row.status)
    ).toEqual(["planned", "planned"]);
    expect(state.locks.slice(0, 2)).toEqual(["edition", "center"]);
  });

  it("finishes pickup with an absentee and requires every picked-up Student at later stages", async () => {
    const state = setup();
    await scan(state, scanArgs("pickup", studentId));
    await finalize(state);
    expect(
      state.rows.kalakritiAuditEntry.find((row) => row.action === "finalized")
        ?.metadata
    ).toMatchObject({
      studentCount: 1,
      absentCount: 1,
    });
    expect(state.rows.kalakritiTransportAssignment[0]?.status).toBe(
      "departed_center"
    );
    for (const stage of [
      "venue_arrival",
      "venue_departure",
      "drop_off",
    ] as const) {
      await expect(finalize(state, finalizeArgs(stage))).rejects.toThrow(
        "Scan every picked-up Student"
      );
      await expect(scan(state, scanArgs(stage, secondId))).rejects.toThrow();
      await scan(state, scanArgs(stage, studentId));
      await finalize(state, finalizeArgs(stage));
    }
    expect(state.rows.kalakritiOperation).toHaveLength(4);
    expect(state.rows.kalakritiTransportAssignment[0]?.status).toBe(
      "completed"
    );
  });

  it("keeps same-operation replay semantics but rejects stale new scans", async () => {
    const state = setup();
    const args = scanArgs();
    await scan(state, args);
    await scan(state, scanArgs("pickup", secondId));
    await finalize(state);
    await scan(state, args);
    await expect(scan(state)).rejects.toThrow("Center scan stage has changed");
    state.edition.lifecycle = "archived";
    await scan(state, {
      ...args,
      expectedStage: "drop_off",
      personQr: JSON.stringify({ id: outsideId, type: "student" }),
    });
    await expect(scan(state, scanArgs("venue_arrival"))).rejects.toThrow(
      "edition_not_live"
    );
    await expect(
      finalize(state, finalizeArgs("venue_arrival"))
    ).rejects.toThrow("edition_not_live");
    expect(state.rows.kalakritiOperation).toHaveLength(2);
  });

  it("rejects another recorder or Edition reusing an operation ID", async () => {
    const state = setup();
    const args = scanArgs();
    await scan(state, args);
    state.ctx = {
      permissions: [],
      userId: "intruder",
      role: "volunteer",
      asyncTasks: [],
    };
    await expect(scan(state, args)).rejects.toThrow(
      "Operation ID is already in use"
    );
    state.ctx = {
      permissions: ["kalakriti.admin"],
      userId: "intruder",
      role: "admin",
      asyncTasks: [],
    };
    await expect(scan(state, { ...args, editionId: uuidv7() })).rejects.toThrow(
      "Operation ID is already in use"
    );
  });

  it("rejects unfinished and empty finalization without mutations", async () => {
    const state = setup();
    await expect(finalize(state)).rejects.toThrow("Mark at least one Student");
    state.rows.kalakritiStudent = [];
    await expect(finalize(state)).rejects.toThrow("Mark at least one Student");
    expect(state.rows.kalakritiCenterScanStage).toEqual([]);
    expect(state.rows.kalakritiAuditEntry).toEqual([]);
  });

  it("binds even administrator scans to the selected Center and permits only Students", async () => {
    const state = setup();
    await expect(scan(state, scanArgs("pickup", outsideId))).rejects.toThrow(
      "selected Center"
    );
    await expect(
      scan(state, {
        ...scanArgs(),
        personQr: JSON.stringify({ id: studentId, type: "guardian" }),
      })
    ).rejects.toThrow("Guardians cannot");
    expect(state.rows.kalakritiOperation).toEqual([]);
  });

  it("cannot bypass Center finalization through the legacy operation APIs", async () => {
    const state = setup();
    await scan(state);
    const args = { ...scanArgs(), type: "venue_arrival" };
    await expect(
      kalakritiOperationMutators.record.fn({
        tx: state.tx,
        ctx: state.ctx,
        args,
      } as never)
    ).rejects.toThrow("Center scan stage has changed");
    await expect(
      kalakritiOperationMutators.recordManual.fn({
        tx: state.tx,
        ctx: state.ctx,
        args: { ...args, humanId: "KAL-2027-0001" },
      } as never)
    ).rejects.toThrow("Center scan stage has changed");
    expect(state.rows.kalakritiOperation).toHaveLength(1);
  });

  it.each(["draft", "registration_open", "registration_locked", "archived"])(
    "rejects new scan/finalization in %s",
    async (lifecycle) => {
      const state = setup();
      state.edition.lifecycle = lifecycle;
      await expect(scan(state)).rejects.toThrow("edition_not_live");
      await expect(finalize(state)).rejects.toThrow("edition_not_live");
      expect(state.rows.kalakritiCenterScanStage).toEqual([]);
    }
  );

  it("rejects retired Centers before recording or finalizing", async () => {
    const state = setup();
    state.center.retiredAt = new Date();
    await expect(scan(state)).rejects.toThrow("Center is retired");
    await expect(finalize(state)).rejects.toThrow("Center is retired");
  });

  it.each([
    ["edition_admin", null, "volunteer", true],
    ["transport_lead", null, "volunteer", true],
    ["liaison", centerId, "volunteer", true],
    ["center_liaison_lead", centerId, "volunteer", true],
    ["liaison", "other", "volunteer", false],
    ["food_lead", null, "volunteer", false],
    ["transport_coordinator", centerId, "volunteer", false],
    ["transport_lead", null, "guardian", false],
  ])(
    "enforces %s/%s/%s scan and finalize scope",
    async (responsibility, assignedCenter, kind, allowed) => {
      const state = setup();
      state.ctx.permissions = [];
      state.rows.kalakritiEditionMembership = [
        { id: "member", userId: "admin", editionId, kind, state: "active" },
      ];
      state.rows.kalakritiAssignment = [
        {
          membershipId: "member",
          editionId,
          responsibility,
          centerId: assignedCenter,
        },
      ];
      if (allowed) {
        await scan(state);
        await scan(state, scanArgs("pickup", secondId));
        await finalize(state);
        expect(state.rows.kalakritiCenterScanStage[0]?.finalizedAt).toBe(2000);
      } else {
        await expect(scan(state)).rejects.toThrow("Unauthorized");
        await expect(finalize(state)).rejects.toThrow("Unauthorized");
        expect(state.rows.kalakritiOperation).toEqual([]);
      }
    }
  );

  it("supports manual yearly IDs and shares duplicate detection with QR scans", async () => {
    const state = setup();
    await kalakritiCenterScanMutators.recordManual.fn({
      tx: state.tx,
      ctx: state.ctx,
      args: { ...scanArgs(), humanId: "KAL-2027-0001" },
    } as never);
    await scan(state);
    expect(state.rows.kalakritiOperation).toHaveLength(1);
  });
});
