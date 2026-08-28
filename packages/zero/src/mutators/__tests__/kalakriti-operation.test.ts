import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

import { kalakritiOperationMutators } from "../kalakriti-operation";

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
const transportLeadContext = {
  permissions: ["kalakriti.view"],
  role: "volunteer",
  userId: "transport-1",
};
const foodLeadContext = {
  permissions: ["kalakriti.view"],
  role: "volunteer",
  userId: "food-1",
};
const liaisonContext = {
  permissions: ["kalakriti.view"],
  role: "volunteer",
  userId: "liaison-1",
};

const edition = {
  ageCutoffDate: "2027-06-30",
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "registration_open",
  teamEventId: "team-event-1",
  timezone: "Asia/Kolkata",
  year: 2027,
};
const otherEdition = {
  ageCutoffDate: "2027-06-30",
  eventDate: "2027-11-21",
  id: "edition-2",
  lifecycle: "registration_open",
  teamEventId: "team-event-2",
  timezone: "Asia/Kolkata",
  year: 2027,
};
const student = {
  centerId: "center-assigned",
  editionId: edition.id,
  humanId: "KAL-2027-0001",
  id: "student-1",
};
const credentialToken = "opaque-token-value";
const tokenHash = createHash("sha256")
  .update(credentialToken, "utf8")
  .digest("hex");

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    insertAudit: mock(),
    insertOperation: mock(),
    lockRows: mock(),
  };
  const select = mock(() => {
    const query = {
      for: mock(() => {
        const rows = lockedResults.shift() ?? [];
        spies.lockRows(rows);
        return rows;
      }),
      from: mock(),
      orderBy: mock(),
      where: mock(),
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
      dbTransaction: { wrappedTransaction: { select } },
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiOperation: { insert: spies.insertOperation },
      },
      run: mock(async () => results.shift()),
    },
  };
}

describe("kalakritiOperation.record", () => {
  it("records a pickup from an active credential token hash", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        membershipId: null,
        studentId: student.id,
        tokenHash,
      },
      { centerId: student.centerId, id: student.id },
      undefined,
      [],
    ]);
    lockedResults.push([edition]);

    await kalakritiOperationMutators.record.fn({
      args: {
        auditEntryId: "audit-1",
        credentialToken,
        editionId: edition.id,
        id: "operation-row-1",
        now: 1000,
        occurredAt: 900,
        operationId: "operation-1",
        type: "pickup",
      },
      ctx: adminContext,
      tx,
    } as never);

    expect(spies.insertOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "operation-1",
        studentId: student.id,
        type: "pickup",
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "event_day_operation",
        metadata: {
          operationId: "operation-1",
          subjectKind: "student",
          type: "pickup",
        },
      })
    );
  });

  it("does not insert a second row when operationId is replayed", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        membershipId: null,
        studentId: student.id,
        tokenHash,
      },
      { centerId: student.centerId, id: student.id },
      {
        editionId: edition.id,
        id: "operation-row-1",
        membershipId: null,
        operationId: "operation-1",
        studentId: student.id,
        supersededByOperationId: null,
        type: "pickup",
      },
    ]);
    lockedResults.push([edition]);

    await kalakritiOperationMutators.record.fn({
      args: {
        auditEntryId: "audit-2",
        credentialToken,
        editionId: edition.id,
        id: "operation-row-2",
        now: 2000,
        occurredAt: 1900,
        operationId: "operation-1",
        type: "venue_departure",
      },
      ctx: adminContext,
      tx,
    } as never);

    expect(spies.insertOperation).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });

  it("rejects a revoked credential token", async () => {
    const { lockedResults, spies, tx } = createTx([undefined]);
    lockedResults.push([edition]);

    await expect(
      kalakritiOperationMutators.record.fn({
        args: {
          auditEntryId: "audit-3",
          credentialToken,
          editionId: edition.id,
          id: "operation-row-3",
          now: 3000,
          occurredAt: 2900,
          operationId: "operation-3",
          type: "pickup",
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Credential not found or revoked");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });

  it("rejects breakfast for a student without pickup", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        membershipId: null,
        studentId: student.id,
        tokenHash,
      },
      undefined,
      [],
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiOperationMutators.record.fn({
        args: {
          auditEntryId: "audit-4",
          credentialToken,
          editionId: edition.id,
          id: "operation-row-4",
          now: 4000,
          occurredAt: 3900,
          operationId: "operation-4",
          type: "breakfast",
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Pickup is required before meals");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });
});

describe("kalakritiOperation.recordManual", () => {
  it("rejects a yearly ID from another Edition", async () => {
    const { lockedResults, spies, tx } = createTx([undefined, undefined]);
    lockedResults.push([otherEdition]);

    await expect(
      kalakritiOperationMutators.recordManual.fn({
        args: {
          auditEntryId: "audit-5",
          editionId: otherEdition.id,
          humanId: student.humanId,
          id: "operation-row-5",
          now: 5000,
          occurredAt: 4900,
          operationId: "operation-5",
          type: "pickup",
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Yearly ID not found in this Edition");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });

  it("records pickup via yearly ID for authorized transport lead", async () => {
    const { lockedResults, spies, tx } = createTx([
      student,
      { centerId: student.centerId, id: student.id },
      { id: "transport-membership-1", kind: "volunteer" },
      [{ centerId: null, responsibility: "transport_lead" }],
      undefined,
      [],
    ]);
    lockedResults.push([edition]);

    await kalakritiOperationMutators.recordManual.fn({
      args: {
        auditEntryId: "audit-6",
        editionId: edition.id,
        humanId: student.humanId,
        id: "operation-row-6",
        now: 6000,
        occurredAt: 5900,
        operationId: "operation-6",
        type: "pickup",
      },
      ctx: transportLeadContext,
      tx,
    } as never);

    expect(spies.insertOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: student.id,
        type: "pickup",
      })
    );
  });
});

describe("kalakritiOperation authorization", () => {
  it("rejects guardians even when they have Edition access", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        membershipId: null,
        studentId: student.id,
        tokenHash,
      },
      { centerId: student.centerId, id: student.id },
      { id: "guardian-membership-1", kind: "guardian" },
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiOperationMutators.record.fn({
        args: {
          auditEntryId: "audit-7",
          credentialToken,
          editionId: edition.id,
          id: "operation-row-7",
          now: 7000,
          occurredAt: 6900,
          operationId: "operation-7",
          type: "pickup",
        },
        ctx: guardianContext,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });

  it("rejects food leads for transport pickup", async () => {
    const { lockedResults, spies, tx } = createTx([
      student,
      { centerId: student.centerId, id: student.id },
      { id: "food-membership-1", kind: "volunteer" },
      [{ centerId: null, responsibility: "food_lead" }],
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiOperationMutators.recordManual.fn({
        args: {
          auditEntryId: "audit-8",
          editionId: edition.id,
          humanId: student.humanId,
          id: "operation-row-8",
          now: 8000,
          occurredAt: 7900,
          operationId: "operation-8",
          type: "pickup",
        },
        ctx: foodLeadContext,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });

  it("rejects liaisons scoped to another Center", async () => {
    const { lockedResults, spies, tx } = createTx([
      student,
      { centerId: student.centerId, id: student.id },
      { id: "liaison-membership-1", kind: "volunteer" },
      [{ centerId: "center-outside", responsibility: "liaison" }],
    ]);
    lockedResults.push([edition]);

    await expect(
      kalakritiOperationMutators.recordManual.fn({
        args: {
          auditEntryId: "audit-9",
          editionId: edition.id,
          humanId: student.humanId,
          id: "operation-row-9",
          now: 9000,
          occurredAt: 8900,
          operationId: "operation-9",
          type: "pickup",
        },
        ctx: liaisonContext,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });
});
