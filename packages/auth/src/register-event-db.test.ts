import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({
  db: { transaction: mocks.transaction },
}));

vi.mock("@pi-dash/jobs/enqueue", () => ({
  enqueue: vi.fn(),
}));

import { createDbRegisterEventEnrollDeps } from "./register-event-db";

const now = 1_700_000_000_000;

function createTransaction(selectResults: Record<string, unknown>[][]) {
  const insertValues: Record<string, unknown>[] = [];
  const updateValues: Record<string, unknown>[] = [];
  const remainingSelectResults = [...selectResults];
  const select = vi.fn(() => {
    const result = remainingSelectResults.shift() ?? [];
    const finish = vi.fn(async () => result);
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: finish,
          limit: finish,
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
    vi.clearAllMocks();
  });

  it("allocates a human ID and credential for a new volunteer", async () => {
    const transaction = createTransaction([
      [],
      [{ lifecycle: "live", nextVolunteerSequence: 12, year: 2027 }],
      [{ humanId: null, kind: "volunteer" }],
      [],
    ]);

    await expect(persistWith(transaction)).resolves.toBe("inserted");

    expect(transaction.insertValues[1]).toEqual(
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
    expect(transaction.insertValues[2]).toEqual(
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
    expect(transaction.insertValues[1]).toEqual(
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
