import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(async () => ({ user: { id: "external-1" } })),
}));

vi.mock("@pi-dash/db", () => ({ db: {} }));

vi.mock("./auth", () => ({
  auth: {
    api: { createUser: mocks.createUser },
  },
}));

import {
  createKalakritiExternalUser,
  setKalakritiExternalUserBlocked,
  updateKalakritiExternalUserContact,
} from "./kalakriti-external-user";

function createTransaction() {
  const returning = vi.fn(async () => [{ id: "external-1" }]);
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));
  return {
    deleteFn,
    deleteWhere,
    set,
    tx: { delete: deleteFn, update: vi.fn(() => ({ set })) } as never,
  };
}

function createContactTransaction({
  emailOwners = [] as { id: string }[],
  phoneOwners = [] as { id: string }[],
  updated = [{ id: "external-1" }] as { id: string }[],
  updateError,
}: {
  emailOwners?: { id: string }[];
  phoneOwners?: { id: string }[];
  updateError?: unknown;
  updated?: { id: string }[];
}) {
  const limit = vi
    .fn()
    .mockResolvedValueOnce(emailOwners)
    .mockResolvedValueOnce(phoneOwners);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const returning = updateError
    ? vi.fn(() => Promise.reject(updateError))
    : vi.fn(() => Promise.resolve(updated));
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  return {
    set,
    tx: { select, update: vi.fn(() => ({ set })) } as never,
  };
}

describe("Kalakriti external authentication capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an external credential identity without caller admin headers", async () => {
    await expect(
      createKalakritiExternalUser({
        email: "guardian@example.test",
        name: "Guardian",
        password: "secure-password",
        phone: "+919999999999",
      })
    ).resolves.toEqual({ id: "external-1" });

    expect(mocks.createUser).toHaveBeenCalledWith({
      body: {
        data: {
          emailVerified: true,
          isActive: true,
          phone: "+919999999999",
        },
        email: "guardian@example.test",
        name: "Guardian",
        password: "secure-password",
        role: "external_user",
      },
    });
  });

  it("blocks sign-in and revokes sessions in the caller transaction", async () => {
    const transaction = createTransaction();

    await setKalakritiExternalUserBlocked(transaction.tx, {
      blocked: true,
      userId: "external-1",
    });

    expect(transaction.set).toHaveBeenCalledWith({
      banExpires: null,
      banned: true,
      banReason: "No active Kalakriti Edition membership",
    });
    expect(transaction.deleteFn).toHaveBeenCalledTimes(1);
    expect(transaction.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("unblocks sign-in without creating or revoking sessions", async () => {
    const transaction = createTransaction();

    await setKalakritiExternalUserBlocked(transaction.tx, {
      blocked: false,
      userId: "external-1",
    });

    expect(transaction.set).toHaveBeenCalledWith({
      banExpires: null,
      banned: false,
      banReason: null,
    });
    expect(transaction.deleteFn).not.toHaveBeenCalled();
  });
});

describe("Kalakriti external contact update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates name, email, and phone on an external identity", async () => {
    const transaction = createContactTransaction({});

    await updateKalakritiExternalUserContact(transaction.tx, {
      email: "guardian-edited@example.test",
      name: "Edited Guardian",
      phone: "+919888888888",
      userId: "external-1",
    });

    expect(transaction.set).toHaveBeenCalledWith({
      email: "guardian-edited@example.test",
      name: "Edited Guardian",
      phone: "+919888888888",
    });
  });

  it("rejects a colliding email", async () => {
    const transaction = createContactTransaction({
      emailOwners: [{ id: "other-1" }],
    });

    await expect(
      updateKalakritiExternalUserContact(transaction.tx, {
        email: "taken@example.test",
        name: "Guardian",
        phone: null,
        userId: "external-1",
      })
    ).rejects.toThrow("email already exists");
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("rejects a colliding phone", async () => {
    const transaction = createContactTransaction({
      phoneOwners: [{ id: "other-1" }],
    });

    await expect(
      updateKalakritiExternalUserContact(transaction.tx, {
        email: "guardian@example.test",
        name: "Guardian",
        phone: "+919999999999",
        userId: "external-1",
      })
    ).rejects.toThrow("phone number already exists");
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it("rejects a non-external account", async () => {
    const transaction = createContactTransaction({ updated: [] });

    await expect(
      updateKalakritiExternalUserContact(transaction.tx, {
        email: "guardian@example.test",
        name: "Guardian",
        phone: null,
        userId: "central-1",
      })
    ).rejects.toThrow("Kalakriti external identity not found");
  });

  it("maps a unique-constraint race to a contact collision", async () => {
    const transaction = createContactTransaction({
      updateError: { code: "23505" },
    });

    await expect(
      updateKalakritiExternalUserContact(transaction.tx, {
        email: "guardian@example.test",
        name: "Guardian",
        phone: null,
        userId: "external-1",
      })
    ).rejects.toThrow("email or phone already exists");
  });
});
