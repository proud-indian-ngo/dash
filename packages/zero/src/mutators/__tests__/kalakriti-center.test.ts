import { describe, expect, it, vi } from "vitest";
import { kalakritiCenterMutators } from "../kalakriti-center";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};

const center = {
  competitionEntryRegistrationEnabled: false,
  editionId: "edition-1",
  id: "center-1",
  retiredAt: null,
  studentRegistrationEnabled: false,
};

function createTx(results: unknown[]) {
  const spies = {
    deleteCenter: vi.fn(),
    deleteGuardianCenter: vi.fn(),
    insertAudit: vi.fn(),
    insertCenter: vi.fn(),
    insertGuardianCenter: vi.fn(),
    lockRows: vi.fn(),
    updateCenter: vi.fn(),
  };
  const lockedResults: unknown[][] = [[center]];
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
      dbTransaction: { wrappedTransaction: { select } },
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiCenter: {
          delete: spies.deleteCenter,
          insert: spies.insertCenter,
          update: spies.updateCenter,
        },
        kalakritiGuardianCenter: {
          delete: spies.deleteGuardianCenter,
          insert: spies.insertGuardianCenter,
        },
      },
      run: vi.fn(async () => results.shift()),
    },
  };
}

describe("kalakritiCenter commands", () => {
  it("creates a normalized Center with registration locked", async () => {
    const { spies, tx } = createTx([{ lifecycle: "draft" }]);

    await kalakritiCenterMutators.create.fn({
      args: {
        auditEntryId: "audit-1",
        centerId: "center-1",
        editionId: "edition-1",
        name: "  North   Centre ",
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<typeof kalakritiCenterMutators.create.fn>[0]);

    expect(spies.insertCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionEntryRegistrationEnabled: false,
        name: "North Centre",
        normalizedName: "north centre",
        studentRegistrationEnabled: false,
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created" })
    );
  });

  it("requires explicit confirmation before either control reopens", async () => {
    const { spies, tx } = createTx([{ lifecycle: "draft" }]);

    await expect(
      kalakritiCenterMutators.setRegistrationControls.fn({
        args: {
          auditEntryId: "audit-1",
          centerId: "center-1",
          competitionEntryRegistrationEnabled: false,
          confirmReopen: false,
          now: 1_700_000_000_000,
          studentRegistrationEnabled: true,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<
        typeof kalakritiCenterMutators.setRegistrationControls.fn
      >[0])
    ).rejects.toThrow("requires confirmation");
    expect(spies.updateCenter).not.toHaveBeenCalled();
    expect(spies.insertAudit).not.toHaveBeenCalled();
  });

  it("audits an explicit reopen without changing another Center", async () => {
    const { spies, tx } = createTx([{ lifecycle: "draft" }]);

    await kalakritiCenterMutators.setRegistrationControls.fn({
      args: {
        auditEntryId: "audit-1",
        centerId: "center-1",
        competitionEntryRegistrationEnabled: true,
        confirmReopen: true,
        now: 1_700_000_000_000,
        studentRegistrationEnabled: false,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiCenterMutators.setRegistrationControls.fn
    >[0]);

    expect(spies.updateCenter).toHaveBeenCalledOnce();
    expect(spies.updateCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionEntryRegistrationEnabled: true,
        id: "center-1",
        studentRegistrationEnabled: false,
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reopened" })
    );
  });

  it("bulk locks both controls only on enabled Centers", async () => {
    const { lockedResults, spies, tx } = createTx([
      { lifecycle: "registration_open" },
    ]);
    lockedResults.splice(0, 1, [
      {
        ...center,
        id: "center-1",
        studentRegistrationEnabled: true,
      },
      {
        ...center,
        competitionEntryRegistrationEnabled: true,
        id: "center-2",
      },
      { ...center, id: "center-3" },
    ]);

    await kalakritiCenterMutators.lockAllRegistration.fn({
      args: {
        auditEntryId: "audit-1",
        confirmLock: true,
        editionId: "edition-1",
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx,
    } as unknown as Parameters<
      typeof kalakritiCenterMutators.lockAllRegistration.fn
    >[0]);

    expect(spies.updateCenter).toHaveBeenCalledTimes(2);
    expect(spies.updateCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionEntryRegistrationEnabled: false,
        id: "center-1",
        studentRegistrationEnabled: false,
      })
    );
    expect(spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "bulk_locked",
        metadata: { centerCount: 2 },
      })
    );
    expect(spies.lockRows).toHaveBeenCalledOnce();
  });

  it("protects a Center with Guardian or Liaison dependencies", async () => {
    const { spies, tx } = createTx([
      { lifecycle: "draft" },
      { id: "guardian-center-1" },
      undefined,
    ]);

    await expect(
      kalakritiCenterMutators.delete.fn({
        args: {
          auditEntryId: "audit-1",
          centerId: "center-1",
          now: 1_700_000_000_000,
        },
        ctx: adminContext,
        tx,
      } as unknown as Parameters<typeof kalakritiCenterMutators.delete.fn>[0])
    ).rejects.toThrow("dependent assignments");
    expect(spies.deleteCenter).not.toHaveBeenCalled();
  });

  it("rejects Center changes from a user without Edition authority", async () => {
    const { spies, tx } = createTx([]);

    await expect(
      kalakritiCenterMutators.update.fn({
        args: {
          auditEntryId: "audit-1",
          centerId: "center-1",
          name: "Renamed Center",
          now: 1_700_000_000_000,
        },
        ctx: {
          permissions: ["kalakriti.view"],
          role: "volunteer",
          userId: "volunteer-1",
        },
        tx,
      } as unknown as Parameters<typeof kalakritiCenterMutators.update.fn>[0])
    ).rejects.toThrow("Unauthorized");
    expect(spies.updateCenter).not.toHaveBeenCalled();
  });

  it("assigns and removes a Guardian through the Center mutation boundary", async () => {
    const membership = {
      editionId: "edition-1",
      id: "guardian-membership-1",
      kind: "guardian" as const,
      state: "active" as const,
    };
    const assignment = {
      centerId: "center-1",
      editionId: "edition-1",
      id: "guardian-center-1",
      membershipId: membership.id,
    };
    const assign = createTx([membership, undefined]);
    assign.lockedResults.splice(0, 1, [membership], [center]);

    await kalakritiCenterMutators.assignGuardian.fn({
      args: {
        auditEntryId: "audit-1",
        centerId: center.id,
        guardianCenterId: assignment.id,
        membershipId: membership.id,
        now: 1_700_000_000_000,
      },
      ctx: adminContext,
      tx: assign.tx,
    } as unknown as Parameters<
      typeof kalakritiCenterMutators.assignGuardian.fn
    >[0]);

    expect(assign.spies.insertGuardianCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId: center.id,
        membershipId: membership.id,
      })
    );
    expect(assign.spies.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "guardian_center_assignment" })
    );

    const remove = createTx([assignment]);
    remove.lockedResults.splice(0, 1, [membership], [assignment]);
    await kalakritiCenterMutators.removeGuardian.fn({
      args: {
        auditEntryId: "audit-2",
        guardianCenterId: assignment.id,
        now: 1_700_000_000_001,
      },
      ctx: adminContext,
      tx: remove.tx,
    } as unknown as Parameters<
      typeof kalakritiCenterMutators.removeGuardian.fn
    >[0]);

    expect(remove.spies.deleteGuardianCenter).toHaveBeenCalledWith({
      id: assignment.id,
    });
  });

  it("rejects cross-Edition, retired, and duplicate Guardian assignments", async () => {
    const membership = {
      editionId: "edition-1",
      id: "guardian-membership-1",
      kind: "guardian" as const,
      state: "active" as const,
    };
    const args = {
      auditEntryId: "audit-1",
      centerId: "center-1",
      guardianCenterId: "guardian-center-1",
      membershipId: membership.id,
      now: 1_700_000_000_000,
    };

    const crossEdition = createTx([membership]);
    crossEdition.lockedResults.splice(
      0,
      1,
      [membership],
      [{ ...center, editionId: "edition-2" }]
    );
    await expect(
      kalakritiCenterMutators.assignGuardian.fn({
        args,
        ctx: adminContext,
        tx: crossEdition.tx,
      } as unknown as Parameters<
        typeof kalakritiCenterMutators.assignGuardian.fn
      >[0])
    ).rejects.toThrow("Center not found in this Edition");

    const retired = createTx([membership]);
    retired.lockedResults.splice(
      0,
      1,
      [membership],
      [{ ...center, retiredAt: new Date() }]
    );
    await expect(
      kalakritiCenterMutators.assignGuardian.fn({
        args,
        ctx: adminContext,
        tx: retired.tx,
      } as unknown as Parameters<
        typeof kalakritiCenterMutators.assignGuardian.fn
      >[0])
    ).rejects.toThrow("Retired Centers cannot receive assignments");

    const duplicate = createTx([membership, { id: "guardian-center-1" }]);
    duplicate.lockedResults.splice(0, 1, [membership], [center]);
    await expect(
      kalakritiCenterMutators.assignGuardian.fn({
        args,
        ctx: adminContext,
        tx: duplicate.tx,
      } as unknown as Parameters<
        typeof kalakritiCenterMutators.assignGuardian.fn
      >[0])
    ).rejects.toThrow("already assigned");
    expect(duplicate.spies.insertGuardianCenter).not.toHaveBeenCalled();
  });
});
