import { describe, expect, it, mock } from "bun:test";

import type { AsyncTask, Context } from "../../context";
import { vendorPaymentMutators } from "../vendor-payment";
import { vendorPaymentTransactionMutators } from "../vendor-payment-transaction";

const clientContext = (permissions: string[]): Context => ({
  permissions,
  role: "admin",
  userId: "user-1",
});

const serverContext = (permissions: string[]): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  permissions,
  role: "admin",
  rollbackTasks: [],
  userId: "user-1",
});

const ADMIN = [
  "requests.approve",
  "requests.edit_all_statuses",
  "requests.record_payment",
];

describe("vendor payment detail edit authorization", () => {
  for (const status of [
    "approved",
    "partially_paid",
    "paid",
    "rejected",
    "invoice_pending",
    "completed",
  ]) {
    it(`refuses requests.edit_all on a ${status} request`, async () => {
      const update = mock();
      const tx = {
        location: "client",
        mutate: { vendorPayment: { update } },
        run: mock().mockResolvedValueOnce({
          id: "vp-1",
          status,
          userId: "owner-1",
          voidedAt: null,
        }),
      };

      await expect(
        vendorPaymentMutators.update.fn({
          args: { id: "vp-1" },
          ctx: clientContext(["requests.edit_all"]),
          tx,
        } as never)
      ).rejects.toThrow("Only pending vendor payments can be updated");
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });
  }

  it("refuses an owner with edit_own after approval", async () => {
    const update = mock();
    const tx = {
      location: "client",
      mutate: { vendorPayment: { update } },
      run: mock().mockResolvedValueOnce({
        id: "vp-1",
        status: "approved",
        userId: "user-1",
        voidedAt: null,
      }),
    };

    await expect(
      vendorPaymentMutators.update.fn({
        args: { id: "vp-1" },
        ctx: clientContext(["requests.edit_own"]),
        tx,
      } as never)
    ).rejects.toThrow("Only pending vendor payments can be updated");
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("vendor payment review applies only to pending requests", () => {
  for (const status of ["approved", "paid", "invoice_pending", "completed"]) {
    it(`refuses to approve a ${status} request, even for admins`, async () => {
      const update = mock();
      const tx = {
        location: "client",
        mutate: { vendorPayment: { update } },
        run: mock().mockResolvedValueOnce({ status, vendorId: "vendor-1" }),
      };

      await expect(
        vendorPaymentMutators.approve.fn({
          args: { id: "vp-1" },
          ctx: clientContext(ADMIN),
          tx,
        } as never)
      ).rejects.toThrow("Only pending vendor payments can be approved");
      expect(update).not.toHaveBeenCalled();
    });

    it(`refuses to reject a ${status} request, even for admins`, async () => {
      const update = mock();
      const tx = {
        location: "client",
        mutate: { vendorPayment: { update } },
        run: mock().mockResolvedValueOnce({ status }),
      };

      await expect(
        vendorPaymentMutators.reject.fn({
          args: { id: "vp-1", reason: "No" },
          ctx: clientContext(ADMIN),
          tx,
        } as never)
      ).rejects.toThrow("Only pending vendor payments can be rejected");
      expect(update).not.toHaveBeenCalled();
    });
  }

  it("moves an approved request that was already paid on to paid", async () => {
    const update = mock();
    const tx = {
      location: "client",
      mutate: {
        vendor: { update: mock() },
        vendorPayment: { update },
        vendorPaymentHistory: { insert: mock() },
      },
      run: mock()
        .mockResolvedValueOnce({ status: "pending", vendorId: "vendor-1" })
        .mockResolvedValueOnce({ id: "vendor-1", status: "approved" })
        .mockResolvedValueOnce([{ amountPaise: 10_000, status: "approved" }])
        .mockResolvedValueOnce([{ amountPaise: 10_000 }])
        .mockResolvedValueOnce({ status: "approved" }),
    };

    await vendorPaymentMutators.approve.fn({
      args: { id: "vp-1" },
      ctx: clientContext(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "vp-1", status: "approved" })
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "vp-1", status: "paid" })
    );
  });
});

describe("approving a request recalculates its payment status", () => {
  const approveTx = (
    transactions: { amountPaise: number; status: string }[],
    location: "client" | "server" = "client"
  ) => {
    const update = mock();
    const tx = {
      dbTransaction: { wrappedTransaction: { execute: async () => [] } },
      location,
      mutate: {
        vendor: { update: mock() },
        vendorPayment: { update },
        vendorPaymentHistory: { insert: mock() },
      },
      run: mock()
        .mockResolvedValueOnce({
          status: "pending",
          title: "Venue",
          userId: "owner-1",
          vendorId: "vendor-1",
        })
        .mockResolvedValueOnce({ id: "vendor-1", status: "approved" })
        .mockResolvedValueOnce(transactions)
        .mockResolvedValueOnce([{ amountPaise: 10_000 }])
        .mockResolvedValueOnce({ status: "approved" }),
    };
    return { tx, update };
  };

  it("lands a partly paid request on partially_paid", async () => {
    const { tx, update } = approveTx([
      { amountPaise: 4000, status: "approved" },
      { amountPaise: 6000, status: "rejected" },
    ]);

    await vendorPaymentMutators.approve.fn({
      args: { id: "vp-1" },
      ctx: clientContext(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "vp-1", status: "partially_paid" })
    );
  });

  it("leaves a request without payments at approved", async () => {
    const { tx, update } = approveTx([]);

    await vendorPaymentMutators.approve.fn({
      args: { id: "vp-1" },
      ctx: clientContext(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vp-1", status: "approved" })
    );
  });

  it("notifies the owner on the server when approval lands on paid", async () => {
    const { tx } = approveTx(
      [{ amountPaise: 10_000, status: "approved" }],
      "server"
    );
    const ctx = serverContext(ADMIN);

    await vendorPaymentMutators.approve.fn({
      args: { id: "vp-1" },
      ctx,
      tx,
    } as never);

    expect((ctx.asyncTasks as AsyncTask[]).map((task) => task.meta)).toEqual([
      {
        mutator: "vendorPayment.approve",
        sourceId: "vp-1",
        sourceType: "vendor_payment",
      },
      expect.objectContaining({
        mutator: "approveVendorPayment",
        vendorPaymentId: "vp-1",
      }),
      { mutator: "approveVendorPayment:vpFullyPaid", vendorPaymentId: "vp-1" },
    ]);
  });
});

describe("rejecting a request", () => {
  it("refuses a request that already has approved payments", async () => {
    const update = mock();
    const tx = {
      location: "client",
      mutate: { vendorPayment: { update } },
      run: mock()
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce([{ amountPaise: 10_000, status: "approved" }]),
    };

    await expect(
      vendorPaymentMutators.reject.fn({
        args: { id: "vp-1", reason: "No" },
        ctx: clientContext(ADMIN),
        tx,
      } as never)
    ).rejects.toThrow(
      "This request already has approved payments; approve it instead"
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("resetting a request to pending", () => {
  const resetTx = (transactions: { status: string }[]) => {
    const update = mock();
    const tx = {
      location: "client",
      mutate: {
        vendorPayment: { update },
        vendorPaymentHistory: { insert: mock() },
      },
      run: mock()
        .mockResolvedValueOnce({ status: "approved" })
        .mockResolvedValueOnce(transactions)
        .mockResolvedValueOnce([]),
    };
    return { tx, update };
  };

  it("keeps rejected payments as history and resets the request", async () => {
    // The query excludes rejected rows, so only rejected payments leave none.
    const { tx, update } = resetTx([]);

    await vendorPaymentMutators.resetToPending.fn({
      args: { id: "vp-1" },
      ctx: clientContext(ADMIN),
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vp-1", status: "pending" })
    );
    const paymentsQuery = tx.run.mock.calls[1]?.[0] as {
      ast: { where: { conditions: unknown[] } };
    };
    expect(paymentsQuery.ast.where.conditions).toContainEqual(
      expect.objectContaining({
        left: { name: "status", type: "column" },
        op: "!=",
        right: { type: "literal", value: "rejected" },
      })
    );
  });

  it("refuses when a payment is not rejected", async () => {
    const { tx, update } = resetTx([{ status: "pending" }]);

    await expect(
      vendorPaymentMutators.resetToPending.fn({
        args: { id: "vp-1" },
        ctx: clientContext(ADMIN),
        tx,
      } as never)
    ).rejects.toThrow(
      "Cannot reset vendor payment to pending after payments exist"
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("payments are recorded only on approved requests", () => {
  it("refuses a payment on a pending request", async () => {
    const insert = mock();
    const tx = {
      location: "client",
      mutate: { vendorPaymentTransaction: { insert } },
      run: mock().mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        status: "pending",
        userId: "user-1",
      }),
    };

    await expect(
      vendorPaymentTransactionMutators.create.fn({
        args: {
          amountPaise: 10_000,
          attachments: [],
          id: "txn-1",
          transactionDate: 1,
          vendorPaymentId: "vp-1",
        },
        ctx: clientContext(ADMIN),
        tx,
      } as never)
    ).rejects.toThrow(
      "Payments can be recorded only after the vendor payment is approved"
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
