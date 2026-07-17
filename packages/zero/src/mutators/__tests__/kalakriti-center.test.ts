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
    insertAudit: vi.fn(),
    insertCenter: vi.fn(),
    updateCenter: vi.fn(),
  };
  return {
    spies,
    tx: {
      location: "server" as const,
      mutate: {
        kalakritiAuditEntry: { insert: spies.insertAudit },
        kalakritiCenter: {
          delete: spies.deleteCenter,
          insert: spies.insertCenter,
          update: spies.updateCenter,
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
    const { spies, tx } = createTx([center, { lifecycle: "draft" }]);

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
    const { spies, tx } = createTx([center, { lifecycle: "draft" }]);

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
    const { spies, tx } = createTx([
      { lifecycle: "registration_open" },
      [
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
      ],
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
  });

  it("protects a Center with Guardian or Liaison dependencies", async () => {
    const { spies, tx } = createTx([
      center,
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
});
