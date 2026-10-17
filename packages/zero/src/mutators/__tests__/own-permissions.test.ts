import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { advancePaymentMutators } from "../advance-payment";
import { bankAccountMutators } from "../bank-account";
import { reimbursementMutators } from "../reimbursement";

const contextWith = (permissions: string[]): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  enqueue: mock() as Context["enqueue"],
  permissions,
  r2KeyPrefix: "app",
  role: "volunteer",
  rollbackTasks: [],
  userId: "user-1",
});

const ownPending = {
  approvalScreenshotKey: null,
  status: "pending",
  userId: "user-1",
  voidedAt: null,
};

// The first read returns the request; every later read (books, relations)
// finds nothing.
const requestTx = (entity: unknown, table: string) => {
  const remove = mock();
  const tx = {
    location: "client",
    mutate: new Proxy(
      {},
      {
        get: (_target, name) =>
          name === table ? { delete: remove } : { delete: mock() },
      }
    ),
    run: mock().mockResolvedValueOnce(entity).mockResolvedValue([]),
  };
  return { remove, tx };
};

beforeEach(() => {
  mock.clearAllMocks();
});

describe("deleting your own request needs requests.delete_own", () => {
  it("refuses the owner of a pending reimbursement without it", async () => {
    const { remove, tx } = requestTx(ownPending, "reimbursement");
    await expect(
      reimbursementMutators.delete.fn({
        args: { id: "r-1" },
        ctx: contextWith(["requests.create"]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(remove).not.toHaveBeenCalled();
  });

  it("lets the owner with it delete a pending reimbursement", async () => {
    const { remove, tx } = requestTx(ownPending, "reimbursement");
    await reimbursementMutators.delete.fn({
      args: { id: "r-1" },
      ctx: contextWith(["requests.delete_own"]),
      tx,
    } as never);
    expect(remove).toHaveBeenCalledWith({ id: "r-1" });
  });

  it("lets requests.delete_all delete someone else's request", async () => {
    const { remove, tx } = requestTx(
      { ...ownPending, status: "rejected", userId: "user-2" },
      "reimbursement"
    );
    await reimbursementMutators.delete.fn({
      args: { id: "r-1" },
      ctx: contextWith(["requests.delete_all"]),
      tx,
    } as never);
    expect(remove).toHaveBeenCalledWith({ id: "r-1" });
  });

  it("refuses the owner of a pending advance payment without it", async () => {
    const { remove, tx } = requestTx(ownPending, "advancePayment");
    await expect(
      advancePaymentMutators.delete.fn({
        args: { id: "a-1" },
        ctx: contextWith([]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(remove).not.toHaveBeenCalled();
  });

  it("lets the owner with it delete a pending advance payment", async () => {
    const { remove, tx } = requestTx(ownPending, "advancePayment");
    await advancePaymentMutators.delete.fn({
      args: { id: "a-1" },
      ctx: contextWith(["requests.delete_own"]),
      tx,
    } as never);
    expect(remove).toHaveBeenCalledWith({ id: "a-1" });
  });
});

describe("bank account mutators need bank_accounts.manage_own", () => {
  const ownAccount = {
    accountNumber: "1234567890",
    createdAt: 1,
    id: "ba-1",
    isDefault: false,
    userId: "user-1",
  };

  const bankTx = (accounts: unknown[]) => {
    const insert = mock();
    const update = mock();
    const remove = mock();
    const run = mock().mockImplementation(() => Promise.resolve(accounts));
    return {
      insert,
      remove,
      tx: {
        location: "server",
        mutate: { bankAccount: { delete: remove, insert, update } },
        run,
      },
      update,
    };
  };

  const createArgs = {
    accountName: "Asha",
    accountNumber: "",
    id: "ba-2",
    ifscCode: "",
    upiId: "asha@okhdfc",
  };

  it("refuses create without it", async () => {
    const { insert, tx } = bankTx([]);
    await expect(
      bankAccountMutators.create.fn({
        args: createArgs,
        ctx: contextWith([]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates with it", async () => {
    const { insert, tx } = bankTx([]);
    await bankAccountMutators.create.fn({
      args: createArgs,
      ctx: contextWith(["bank_accounts.manage_own"]),
      tx,
    } as never);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ba-2", userId: "user-1" })
    );
  });

  it("refuses delete without it", async () => {
    const { remove, tx } = bankTx([]);
    tx.run.mockImplementation(() => Promise.resolve(ownAccount));
    await expect(
      bankAccountMutators.delete.fn({
        args: { id: "ba-1" },
        ctx: contextWith([]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes your own entry with it", async () => {
    const { remove, tx } = bankTx([]);
    tx.run.mockImplementation(() => Promise.resolve(ownAccount));
    await bankAccountMutators.delete.fn({
      args: { id: "ba-1" },
      ctx: contextWith(["bank_accounts.manage_own"]),
      tx,
    } as never);
    expect(remove).toHaveBeenCalledWith({ id: "ba-1" });
  });

  it("still refuses someone else's entry with it", async () => {
    const { remove, tx } = bankTx([]);
    tx.run.mockImplementation(() =>
      Promise.resolve({ ...ownAccount, userId: "user-2" })
    );
    await expect(
      bankAccountMutators.delete.fn({
        args: { id: "ba-1" },
        ctx: contextWith(["bank_accounts.manage_own"]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses setDefault without it", async () => {
    const { tx, update } = bankTx([ownAccount]);
    await expect(
      bankAccountMutators.setDefault.fn({
        args: { id: "ba-1" },
        ctx: contextWith([]),
        tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(update).not.toHaveBeenCalled();
  });

  it("sets the default with it", async () => {
    const { tx, update } = bankTx([ownAccount]);
    await bankAccountMutators.setDefault.fn({
      args: { id: "ba-1" },
      ctx: contextWith(["bank_accounts.manage_own"]),
      tx,
    } as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ba-1", isDefault: true })
    );
  });
});
