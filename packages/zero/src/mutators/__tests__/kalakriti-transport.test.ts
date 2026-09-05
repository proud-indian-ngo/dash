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

const edition = {
  ageCutoffDate: "2027-06-30",
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "draft",
  teamEventId: "event-1",
  timezone: "Asia/Kolkata",
};
const center = {
  competitionEntryRegistrationEnabled: false,
  editionId: edition.id,
  id: "center-1",
  retiredAt: null as number | null,
  studentRegistrationEnabled: false,
};
const assignment = {
  capacity: 40,
  centerId: center.id,
  driverName: "Ravi",
  driverPhone: null,
  editionId: edition.id,
  id: "assignment-1",
  notes: null,
  status: "planned",
  vehicleLabel: "Bus 1",
};

function createTx(results: unknown[] = []) {
  const callOrder: string[] = [];
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
        callOrder.push("lock");
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
    callOrder,
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
      run: vi.fn(async () => {
        callOrder.push("read");
        return results.shift();
      }),
    },
  };
}

describe("kalakritiTransport.create", () => {
  it("creates a planned assignment for admins", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([edition], [center]);
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
    const { lockedResults, tx } = createTx([
      { id: "membership-1", kind: "guardian" },
    ]);
    lockedResults.push([edition]);
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

  it("rejects archived Editions", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([{ ...edition, lifecycle: "archived" }]);

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
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Edition is archived");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });

  it("rejects retired Centers", async () => {
    const { lockedResults, spies, tx } = createTx();
    lockedResults.push([edition], [{ ...center, retiredAt: new Date(1) }]);

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
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Retired Centers cannot receive transport assignments");
    expect(spies.insertAssignment).not.toHaveBeenCalled();
  });
});

describe("kalakritiTransport.transitionStatus", () => {
  it("advances status by one step", async () => {
    const { callOrder, lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [center]);
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
    expect(callOrder.slice(0, 2)).toEqual(["lock", "read"]);
  });

  it("rejects completed assignments", async () => {
    const { lockedResults, tx } = createTx([
      { ...assignment, status: "completed" },
    ]);
    lockedResults.push([edition], [center]);
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

  it("rejects archived Editions before reading assignment status", async () => {
    const { callOrder, lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([{ ...edition, lifecycle: "archived" }]);

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
    ).rejects.toThrow("Edition is archived");
    expect(callOrder).toEqual(["lock"]);
    expect(spies.updateAssignment).not.toHaveBeenCalled();
  });

  it("rejects retired Centers", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [{ ...center, retiredAt: new Date(1) }]);

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
    ).rejects.toThrow("Retired Centers cannot receive transport assignments");
    expect(spies.updateAssignment).not.toHaveBeenCalled();
  });
});

describe("kalakritiTransport.update", () => {
  it("enqueues a transport change notification for driver updates", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [center]);
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

  it("does not write or audit an unchanged full form", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [center]);
    const asyncTasks: Array<{ fn: () => Promise<void>; meta: object }> = [];

    await kalakritiTransportMutators.update.fn({
      args: {
        assignmentId: assignment.id,
        auditEntryId: "audit-unchanged",
        capacity: assignment.capacity,
        changeId: "change-unchanged",
        driverName: assignment.driverName,
        driverPhone: assignment.driverPhone,
        editionId: edition.id,
        notes: assignment.notes,
        now: 2,
        vehicleLabel: assignment.vehicleLabel,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as never);

    expect(spies.updateAssignment).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
    expect(asyncTasks).toHaveLength(0);
  });

  it("audits capacity and notes changes without notifying", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [center]);
    const asyncTasks: Array<{ fn: () => Promise<void>; meta: object }> = [];

    await kalakritiTransportMutators.update.fn({
      args: {
        assignmentId: assignment.id,
        auditEntryId: "audit-capacity-notes",
        capacity: 45,
        changeId: "change-capacity-notes",
        editionId: edition.id,
        notes: "Second trip",
        now: 2,
      },
      ctx: { ...adminContext, asyncTasks },
      tx,
    } as never);

    expect(spies.updateAssignment).toHaveBeenCalledWith({
      capacity: 45,
      id: assignment.id,
      notes: "Second trip",
      updatedAt: 2,
    });
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          assignmentId: assignment.id,
          changedFields: ["capacity", "notes"],
        },
      })
    );
    expect(asyncTasks).toHaveLength(0);
  });

  it("allows transport coordinators for their Center", async () => {
    const { lockedResults, spies, tx } = createTx([
      assignment,
      { id: "membership-1", kind: "volunteer" },
      [
        {
          centerId: "center-1",
          responsibility: "transport_coordinator",
        },
      ],
    ]);
    lockedResults.push([edition], [center]);
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

  it("rejects archived Editions", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([{ ...edition, lifecycle: "archived" }]);

    await expect(
      kalakritiTransportMutators.update.fn({
        args: {
          assignmentId: "assignment-1",
          auditEntryId: "audit-1",
          capacity: 45,
          changeId: "change-1",
          editionId: "edition-1",
          now: 2,
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Edition is archived");
    expect(spies.updateAssignment).not.toHaveBeenCalled();
  });

  it("rejects retired Centers", async () => {
    const { lockedResults, spies, tx } = createTx([assignment]);
    lockedResults.push([edition], [{ ...center, retiredAt: new Date(1) }]);

    await expect(
      kalakritiTransportMutators.update.fn({
        args: {
          assignmentId: "assignment-1",
          auditEntryId: "audit-1",
          capacity: 45,
          changeId: "change-1",
          editionId: "edition-1",
          now: 2,
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Retired Centers cannot receive transport assignments");
    expect(spies.updateAssignment).not.toHaveBeenCalled();
  });
});
