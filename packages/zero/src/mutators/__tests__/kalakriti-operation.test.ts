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
  editionId: edition.id,
  humanId: "KAL-2027-0001",
  id: "student-1",
};
const credentialToken = "opaque-token-value";
const tokenHash = createHash("sha256")
  .update(credentialToken, "utf8")
  .digest("hex");

function createTx(results: unknown[] = []) {
  results.unshift(undefined);
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

  it("replays a committed operation without resolving a now-revoked credential", async () => {
    const existing = {
      competitionSessionId: null,
      editionId: edition.id,
      id: "operation-row-1",
      membershipId: null,
      operationId: "operation-1",
      recordedBy: adminContext.userId,
      studentId: student.id,
      supersededByOperationId: null,
      type: "pickup",
    };
    const { lockedResults, spies, tx } = createTx([]);
    tx.run.mockImplementationOnce(async () => existing);
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

  it("keeps one effective pickup when a second device uses a new operation ID", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        membershipId: null,
        studentId: student.id,
        tokenHash,
      },
      [
        {
          competitionSessionId: null,
          editionId: edition.id,
          id: "first-row",
          membershipId: null,
          operationId: "first-id",
          studentId: student.id,
          supersededByOperationId: null,
          type: "pickup",
        },
      ],
    ]);
    lockedResults.push([edition]);
    await kalakritiOperationMutators.record.fn({
      args: {
        auditEntryId: "audit-repeat",
        credentialToken,
        editionId: edition.id,
        id: "repeat-row",
        now: 2000,
        occurredAt: 1900,
        operationId: "repeat-id",
        type: "pickup",
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

  it("rejects a removed volunteer yearly ID", async () => {
    const { lockedResults, spies, tx } = createTx([undefined, undefined]);
    lockedResults.push([edition]);
    await expect(
      kalakritiOperationMutators.recordManual.fn({
        args: {
          auditEntryId: "audit-archived",
          editionId: edition.id,
          humanId: "KALV-2027-0001",
          id: "archived-row",
          now: 2000,
          occurredAt: 1900,
          operationId: "archived-id",
          type: "volunteer_check_in",
        },
        ctx: adminContext,
        tx,
      } as never)
    ).rejects.toThrow("Yearly ID not found");
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });

  it("records pickup via yearly ID for authorized transport lead", async () => {
    const { lockedResults, spies, tx } = createTx([
      student,
      { id: "transport-membership-1", kind: "volunteer" },
      undefined,
      { id: "transport-assignment-1" },
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
});

describe("event-day authoritative resolution", () => {
  it("defers QR and yearly-ID resolution when the client has no subject rows", async () => {
    const { tx, spies } = createTx();
    const args = {
      auditEntryId: "audit-client",
      editionId: edition.id,
      id: "client-row",
      now: 1000,
      occurredAt: 1000,
      operationId: "client-operation",
      type: "pickup",
    };
    await kalakritiOperationMutators.record.fn({
      args: { ...args, credentialToken },
      ctx: adminContext,
      tx: { ...tx, location: "client" },
    } as never);
    await kalakritiOperationMutators.recordManual.fn({
      args: { ...args, humanId: student.humanId },
      ctx: adminContext,
      tx: { ...tx, location: "client" },
    } as never);
    expect(tx.run).not.toHaveBeenCalled();
    expect(spies.insertOperation).not.toHaveBeenCalled();
  });
});
