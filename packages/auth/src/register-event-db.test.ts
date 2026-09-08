import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  invalidate: vi.fn(),
  promote: vi.fn(),
  transaction: vi.fn(),
  effects: [] as Promise<unknown>[],
}));
vi.mock("@pi-dash/db", () => ({
  db: {
    transaction: mocks.transaction,
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ name: "Volunteer" }] }),
      }),
    }),
  },
}));
vi.mock("@pi-dash/db/kalakriti-orientation", () => ({
  promoteKalakritiVolunteer: mocks.promote,
}));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  invalidatePermissionCache: mocks.invalidate,
}));
vi.mock("@pi-dash/jobs/enqueue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@pi-dash/observability", () => ({
  withFireAndForgetLog: (_meta: unknown, fn: () => Promise<unknown>) => {
    mocks.effects.push(fn());
  },
}));

import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiCredential,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";

import { createDbRegisterEventEnrollDeps } from "./register-event-db";

const row = {
  eventMember: {
    addedAt: 1000,
    eventId: "event",
    id: "member",
    userId: "user",
  },
  volunteerMembership: {
    createdBy: "user",
    editionId: "edition",
    id: "membership",
    now: 1000,
    snapshotEmail: null,
    snapshotName: "Volunteer",
    snapshotPhone: null,
    userId: "user",
  },
};

function setup(
  existing?: { id: string; kind: string; state: string },
  inserted = true,
  failCommit = false,
  options: {
    edition?: { id: string; lifecycle: string } | null;
    event?: {
      cancelledAt: Date | null;
      startTime: Date;
      managementDomain: string | null;
    } | null;
    external?: boolean;
    user?: { id: string; role: string } | null;
  } = {}
) {
  const values = vi.fn((value: Record<string, unknown>) => {
    if (value.kind === "volunteer") {
      rows.set(kalakritiEditionMembership, [value]);
    }
    return {
      onConflictDoNothing: () => ({
        returning: async () => (inserted ? [{ id: "member" }] : []),
      }),
    };
  });
  const set = vi.fn(() => ({ where: async () => undefined }));
  const rows = new Map<unknown, unknown[]>([
    [
      kalakritiEdition,
      options.edition === null
        ? []
        : [
            options.edition ?? {
              id: "edition",
              lifecycle: "draft",
              year: 2027,
              nextVolunteerSequence: 1,
            },
          ],
    ],
    [
      teamEvent,
      options.event === null
        ? []
        : [
            options.event ?? {
              cancelledAt: null,
              startTime: new Date(2000),
              managementDomain: "kalakriti",
            },
          ],
    ],
    [
      user,
      options.user === null
        ? []
        : [options.user ?? { id: "user", role: "unoriented_volunteer" }],
    ],
    [kalakritiExternalIdentity, options.external ? [{ userId: "user" }] : []],
    [kalakritiEditionMembership, existing ? [existing] : []],
    [kalakritiCredential, existing ? [{ id: "credential" }] : []],
  ]);
  const lock = vi.fn();
  const tx = {
    insert: vi.fn(() => ({ values })),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          for: async (mode: string) => {
            lock(table, mode);
            return rows.get(table) ?? [];
          },
          limit: () =>
            Object.assign(Promise.resolve(rows.get(table) ?? []), {
              for: async (mode: string) => {
                lock(table, mode);
                return rows.get(table) ?? [];
              },
            }),
        }),
      }),
    }),
    update: vi.fn(() => ({ set })),
  };
  mocks.transaction.mockImplementation(async (fn) => {
    const result = await fn(tx);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    if (failCommit) {
      throw new Error("commit failed");
    }
    return result;
  });
  return { tx, set, lock };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1000);
  mocks.effects.length = 0;
  mocks.promote.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signup enrollment orientation persistence", () => {
  it("promotes after membership writes in the transaction and dispatches effects after commit", async () => {
    const { tx, lock } = setup();
    expect(
      await createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
    ).toBe("inserted");
    expect(mocks.promote).toHaveBeenCalledWith(tx, "user", 1000);
    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(lock.mock.calls).toEqual([
      [kalakritiEdition, "update"],
      [teamEvent, "update"],
      [user, "update"],
      [kalakritiEditionMembership, "update"],
      [kalakritiEdition, "update"],
    ]);
    expect(tx.insert.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.promote.mock.invocationCallOrder[0]!
    );
    await Promise.all(mocks.effects);
    expect(mocks.invalidate.mock.calls).toEqual([
      ["unoriented_volunteer"],
      ["volunteer"],
    ]);
    expect(mocks.enqueue).toHaveBeenCalledWith("notify-role-changed", {
      newRole: "Volunteer",
      userId: "user",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith("whatsapp-manage-orientation", {
      isOriented: true,
      userId: "user",
    });
  });

  it.each(["active", "archived"])(
    "handles %s membership even when the event member already exists",
    async (state) => {
      const { set } = setup(
        { id: "membership", kind: "volunteer", state },
        false
      );
      expect(
        await createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
      ).toBe("conflict");
      expect(mocks.promote).toHaveBeenCalledOnce();
      expect(set).toHaveBeenCalledTimes(state === "archived" ? 1 : 0);
      await Promise.all(mocks.effects);
      expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    }
  );

  it("does not repeat role effects when conditional promotion reports no change", async () => {
    setup({ id: "membership", kind: "volunteer", state: "active" }, false);
    mocks.promote.mockResolvedValue(false);
    await createDbRegisterEventEnrollDeps().persistEnrollWrites(row);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "guardian", state: "active" },
    { kind: "guardian", state: "archived" },
    { kind: "volunteer", state: "pending" },
    { kind: "volunteer", state: "rejected" },
  ])("does not promote $kind/$state membership", async (membership) => {
    const { tx } = setup({ id: "membership", ...membership });
    expect(
      await createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
    ).toBe("skipped");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not promote unrelated event enrollment", async () => {
    const { tx } = setup(undefined, true, false, {
      edition: null,
      event: {
        cancelledAt: null,
        startTime: new Date(2000),
        managementDomain: null,
      },
    });
    expect(
      await createDbRegisterEventEnrollDeps().persistEnrollWrites({
        eventMember: row.eventMember,
      })
    ).toBe("inserted");
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it("rechecks time after waiting for locks", async () => {
    const { tx } = setup();
    vi.mocked(Date.now).mockReturnValue(2000);
    expect(
      await createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
    ).toBe("skipped");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
  });

  it.each([
    { edition: { id: "edition", lifecycle: "archived" } },
    { edition: null },
    { edition: { id: "different", lifecycle: "draft" } },
    { event: null },
    {
      event: {
        cancelledAt: new Date(900),
        startTime: new Date(2000),
        managementDomain: "kalakriti",
      },
    },
    {
      event: {
        cancelledAt: null,
        startTime: new Date(1000),
        managementDomain: "kalakriti",
      },
    },
    { user: null },
    { user: { id: "user", role: "external_user" } },
    { external: true },
  ])("skips invalid enrollment without writes: %j", async (options) => {
    const { tx } = setup(undefined, true, false, options);
    expect(
      await createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
    ).toBe("skipped");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("does not dispatch effects if the transaction fails to commit", async () => {
    setup(undefined, true, true);
    await expect(
      createDbRegisterEventEnrollDeps().persistEnrollWrites(row)
    ).rejects.toThrow("commit failed");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});

const now = 1_700_000_000_000;

function createTransaction(selectResults: Record<string, unknown>[][]) {
  const insertValues: Record<string, unknown>[] = [];
  const updateValues: Record<string, unknown>[] = [];
  const remainingSelectResults = [
    [{ id: "edition-1", lifecycle: "live" }],
    [
      {
        cancelledAt: null,
        managementDomain: "kalakriti",
        startTime: new Date(now + 1000),
      },
    ],
    [{ id: "user-1", role: "unoriented_volunteer" }],
    [],
    ...selectResults,
  ];
  const select = vi.fn(() => {
    const result = remainingSelectResults.shift() ?? [];
    const finish = vi.fn(async () => result);
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: finish,
          limit: () => Object.assign(finish(), { for: finish }),
        })),
      })),
    };
  });
  const insert = vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      insertValues.push(values);
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "event-member-1" }]),
        })),
      };
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updateValues.push(values);
      return { where: vi.fn(async () => undefined) };
    }),
  }));

  return {
    insertValues,
    tx: { insert, select, update } as never,
    updateValues,
  };
}

function enrollment() {
  return {
    eventMember: {
      addedAt: now,
      eventId: "event-1",
      id: "event-member-1",
      userId: "user-1",
    },
    volunteerMembership: {
      createdBy: "user-1",
      editionId: "edition-1",
      id: "membership-new",
      now,
      snapshotEmail: "volunteer@example.test",
      snapshotName: "Volunteer",
      snapshotPhone: "+919999999999",
      userId: "user-1",
    },
  };
}

async function persistWith(transaction: ReturnType<typeof createTransaction>) {
  mocks.transaction.mockImplementationOnce(
    async (callback: (tx: never) => Promise<unknown>) =>
      await callback(transaction.tx)
  );
  return await createDbRegisterEventEnrollDeps().persistEnrollWrites(
    enrollment()
  );
}

describe("createDbRegisterEventEnrollDeps persistEnrollWrites", () => {
  beforeEach(() => {
    mocks.promote.mockResolvedValue(false);
  });

  it("allocates a human ID and credential for a new volunteer", async () => {
    const transaction = createTransaction([
      [],
      [{ lifecycle: "live", nextVolunteerSequence: 12, year: 2027 }],
      [{ humanId: null, kind: "volunteer" }],
      [],
    ]);

    await expect(persistWith(transaction)).resolves.toBe("inserted");

    expect(transaction.insertValues[0]).toEqual(
      expect.objectContaining({
        humanId: null,
        id: "membership-new",
        kind: "volunteer",
        state: "active",
      })
    );
    expect(transaction.updateValues).toEqual([
      { humanId: "KALV-2027-0012", updatedAt: new Date(now) },
      { nextVolunteerSequence: 13 },
    ]);
    expect(transaction.insertValues[1]).toEqual(
      expect.objectContaining({
        editionId: "edition-1",
        humanId: "KALV-2027-0012",
        issuedBy: "user-1",
        membershipId: "membership-new",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
  });

  it("preserves an archived volunteer human ID and issues one credential", async () => {
    const transaction = createTransaction([
      [{ id: "membership-existing", kind: "volunteer", state: "archived" }],
      [],
      [{ lifecycle: "live", nextVolunteerSequence: 20, year: 2027 }],
      [{ humanId: "KALV-2027-0007", kind: "volunteer" }],
      [],
    ]);

    await persistWith(transaction);

    expect(transaction.updateValues).toEqual([
      expect.objectContaining({
        archivedAt: null,
        state: "active",
        updatedAt: new Date(now),
      }),
    ]);
    expect(transaction.insertValues).toHaveLength(2);
    expect(transaction.insertValues[0]).toEqual(
      expect.objectContaining({
        humanId: "KALV-2027-0007",
        membershipId: "membership-existing",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
  });

  it("leaves an existing active volunteer membership unchanged", async () => {
    const transaction = createTransaction([
      [{ id: "membership-existing", kind: "volunteer", state: "active" }],
    ]);

    await persistWith(transaction);

    expect(transaction.insertValues).toHaveLength(1);
    expect(transaction.updateValues).toEqual([]);
  });

  it("does not duplicate an existing active credential when reenrolling", async () => {
    const transaction = createTransaction([
      [{ id: "membership-existing", kind: "volunteer", state: "archived" }],
      [{ id: "credential-existing" }],
    ]);

    await persistWith(transaction);

    expect(transaction.updateValues).toHaveLength(1);
    expect(transaction.insertValues).toHaveLength(1);
  });
});
