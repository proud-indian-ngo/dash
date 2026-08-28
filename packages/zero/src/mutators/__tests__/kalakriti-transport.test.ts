import { describe, expect, it, vi } from "vitest";
import { kalakritiTransportMutators } from "../kalakriti-transport";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};
const guardianContext = {
  permissions: ["kalakriti.view"],
  role: "guardian",
  userId: "guardian-1",
};
const coordinatorContext = {
  permissions: ["kalakriti.view"],
  role: "volunteer",
  userId: "coordinator-1",
};

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    insertAssignment: vi.fn(),
    insertAudit: vi.fn(),
    insertHistory: vi.fn(),
    lockRows: vi.fn(),
    updateAssignment: vi.fn(),
  };
  const select = vi.fn(() => {
    const query = {
      for: vi.fn(() => {
        const rows = lockedResults.shift() ?? [];
        spies.lockRows(rows);
        return rows;
      }),
      from: vi.fn(),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  });
  return {
    lockedResults,
    spies,
    tx: {
      asyncTasks: [],
      dbTransaction: { wrappedTransaction: { select } },
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiTransportAssignment: {
          insert: spies.insertAssignment,
          update: spies.updateAssignment,
        },
        kalakritiTransportStatusHistory: { insert: spies.insertHistory },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

describe("kalakritiTransport.create", () => {
  it("creates a planned assignment for admins", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([
      {
        competitionEntryRegistrationEnabled: false,
        editionId: "edition-1",
        id: "center-1",
        retiredAt: null,
        studentRegistrationEnabled: false,
      },
    ]);
    await kalakritiTransportMutators.create.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        capacity: 40,
        centerId: "center-1",
        driverName: "Ravi",
        driverPhone: null,
        editionId: "edition-1",
        historyId: "history-1",
        notes: null,
        now: 1,
        vehicleLabel: "Bus 1",
      },
      ctx: adminContext,
      tx,
    } as never);
    expect(spies.insertAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: "center-1",
        status: "planned",
        vehicleLabel: "Bus 1",
      })
    );
    expect(spies.insertHistory).toHaveBeenCalled();
  });

  it("rejects guardians", async () => {
    const { tx } = createTx([{ id: "membership-1", kind: "guardian" }]);
    await expect(
      kalakritiTransportMutators.create.fn({
        args: {
          assignmentId: "assignment-1",
          auditEntryId: "audit-1",
          capacity: 40,
          centerId: "center-1",
          driverName: "Ravi",
          driverPhone: null,
          editionId: "edition-1",
          historyId: "history-1",
          notes: null,
          now: 1,
          vehicleLabel: "Bus 1",
        },
        ctx: guardianContext,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
  });
});

describe("kalakritiTransport.transitionStatus", () => {
  it("advances status by one step", async () => {
    const { spies, tx } = createTx([
      {
        centerId: "center-1",
        driverName: "Ravi",
        driverPhone: null,
        editionId: "edition-1",
        id: "assignment-1",
        status: "planned",
        vehicleLabel: "Bus 1",
      },
    ]);
    await kalakritiTransportMutators.transitionStatus.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        editionId: "edition-1",
        historyId: "history-1",
        now: 2,
        occurredAt: 2,
      },
      ctx: adminContext,
      tx,
    } as never);
    expect(spies.updateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "assignment-1",
        status: "arrived_at_center",
      })
    );
  });

  it("rejects completed assignments", async () => {
    const { tx } = createTx([
      {
        centerId: "center-1",
        driverName: "Ravi",
        driverPhone: null,
        editionId: "edition-1",
        id: "assignment-1",
        status: "completed",
        vehicleLabel: "Bus 1",
      },
    ]);
    await expect(
      kalakritiTransportMutators.transitionStatus.fn({
        args: {
          assignmentId: "assignment-1",
          auditEntryId: "audit-1",
          editionId: "edition-1",
          historyId: "history-1",
          now: 2,
          occurredAt: 2,
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Transport status cannot advance further");
  });
});

describe("kalakritiTransport.update", () => {
  it("enqueues a transport change notification for driver updates", async () => {
    const { spies, tx } = createTx([
      {
        centerId: "center-1",
        driverName: "Ravi",
        driverPhone: null,
        editionId: "edition-1",
        id: "assignment-1",
        status: "planned",
        vehicleLabel: "Bus 1",
      },
    ]);
    const asyncTasks: Array<{ fn: () => Promise<void>; meta: object }> = [];
    await kalakritiTransportMutators.update.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        changeId: "change-1",
        driverName: "Suresh",
        editionId: "edition-1",
        now: 2,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as never);
    expect(spies.updateAssignment).toHaveBeenCalled();
    expect(asyncTasks).toHaveLength(1);
  });

  it("allows transport coordinators for their Center", async () => {
    const { spies, tx } = createTx([
      {
        centerId: "center-1",
        driverName: "Ravi",
        driverPhone: null,
        editionId: "edition-1",
        id: "assignment-1",
        status: "planned",
        vehicleLabel: "Bus 1",
      },
      { id: "membership-1", kind: "volunteer" },
      [
        {
          centerId: "center-1",
          responsibility: "transport_coordinator",
        },
      ],
    ]);
    await kalakritiTransportMutators.update.fn({
      args: {
        assignmentId: "assignment-1",
        auditEntryId: "audit-1",
        capacity: 45,
        changeId: "change-1",
        editionId: "edition-1",
        now: 2,
      },
      ctx: coordinatorContext,
      tx,
    } as never);
    expect(spies.updateAssignment).toHaveBeenCalled();
  });
});
