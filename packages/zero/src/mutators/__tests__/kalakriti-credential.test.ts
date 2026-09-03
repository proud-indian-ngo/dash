import { describe, expect, it, mock } from "bun:test";

import { kalakritiCredentialMutators } from "../kalakriti-credential";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
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
  lifecycle: "registration_open",
  nextStudentSequence: 1,
  nextVolunteerSequence: 3,
  timezone: "Asia/Kolkata",
  year: 2027,
};
const tokenHash = "b".repeat(64);
const nextTokenHash = "c".repeat(64);

function createTx(results: unknown[] = []) {
  const lockedResults: unknown[][] = [];
  const spies = {
    insertAudit: mock(),
    insertCredential: mock(),
    lockRows: mock(),
    updateCredential: mock(),
    updateEdition: mock(),
    updateMembership: mock(),
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
        kalakritiCredential: {
          insert: spies.insertCredential,
          update: spies.updateCredential,
        },
        kalakritiEdition: { update: spies.updateEdition },
        kalakritiEditionMembership: { update: spies.updateMembership },
      },
      run: mock(async () => results.shift()),
    },
  };
}

describe("kalakritiCredential.reissue", () => {
  it("reissues a Student credential and revokes the prior active row", async () => {
    const { lockedResults, spies, tx } = createTx([
      { editionId: edition.id, humanId: "KAL-2027-0001", id: "student-1" },
      { humanId: "KAL-2027-0001", id: "credential-old" },
    ]);
    lockedResults.push([edition]);
    await kalakritiCredentialMutators.reissue.fn({
      args: {
        auditEntryId: "audit-1",
        credentialId: "credential-new",
        editionId: edition.id,
        now: 1000,
        studentId: "student-1",
        tokenHash: nextTokenHash,
      },
      ctx: adminContext,
      tx,
    } as never);
    expect(spies.updateCredential).toHaveBeenCalledWith({
      id: "credential-old",
      revokedAt: 1000,
      revokedBy: "admin-1",
    });
    expect(spies.insertCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        humanId: "KAL-2027-0001",
        membershipId: null,
        studentId: "student-1",
        tokenHash: nextTokenHash,
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "credential",
        metadata: { humanId: "KAL-2027-0001", subjectKind: "student" },
      })
    );
  });

  it("issues the first volunteer credential and allocates a yearly ID", async () => {
    const { lockedResults, spies, tx } = createTx([
      {
        editionId: edition.id,
        humanId: null,
        id: "membership-1",
        kind: "volunteer",
      },
      undefined,
      {
        editionId: edition.id,
        humanId: null,
        id: "membership-1",
        kind: "volunteer",
      },
    ]);
    lockedResults.push([edition]);
    await kalakritiCredentialMutators.reissue.fn({
      args: {
        auditEntryId: "audit-2",
        credentialId: "credential-volunteer",
        editionId: edition.id,
        membershipId: "membership-1",
        now: 2000,
        tokenHash,
      },
      ctx: adminContext,
      tx,
    } as never);
    expect(spies.updateMembership).toHaveBeenCalledWith({
      humanId: "KALV-2027-0003",
      id: "membership-1",
    });
    expect(spies.updateEdition).toHaveBeenCalledWith({
      id: edition.id,
      nextVolunteerSequence: 4,
    });
    expect(spies.insertCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        humanId: "KALV-2027-0003",
        membershipId: "membership-1",
        studentId: null,
      })
    );
  });

  it("rejects volunteer coordinators", async () => {
    const { tx } = createTx([{ id: "membership-coordinator" }, undefined]);
    await expect(
      kalakritiCredentialMutators.reissue.fn({
        args: {
          auditEntryId: "audit-3",
          credentialId: "credential-new",
          editionId: edition.id,
          now: 3000,
          studentId: "student-1",
          tokenHash,
        },
        ctx: coordinatorContext,
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
  });
});
