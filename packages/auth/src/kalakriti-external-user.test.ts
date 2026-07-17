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
