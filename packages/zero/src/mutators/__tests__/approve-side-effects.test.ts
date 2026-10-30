import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { AsyncTask, Context } from "../../context";
import { advancePaymentMutators } from "../advance-payment";
import { OWN_REQUEST_APPROVAL_MESSAGE } from "../lead-approval";
import { reimbursementMutators } from "../reimbursement";

const SCREENSHOT_KEY =
  "app/approval-screenshots/tmp/approver-1/upload-proof.png";

const serverContext = (): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object: mock(),
  enqueue: mock() as unknown as Context["enqueue"],
  lockR2Object: mock(),
  lockR2ObjectForClaim: mock(),
  permissions: ["requests.approve"],
  r2KeyPrefix: "app",
  role: "admin",
  rollbackTasks: [],
  traceId: "trace-1",
  userId: "approver-1",
});

const taskByMutator = (tasks: AsyncTask[] | undefined, mutator: string) =>
  tasks?.find((task) => task.meta.mutator === mutator);

const lineItem = (
  id: string,
  amountPaise: number,
  generateVoucher: boolean
) => ({ amountPaise, generateVoucher, id, reimbursementId: "request-1" });

beforeEach(() => {
  enqueue.mockReset();
});

describe("approve side effects", () => {
  it("notifies the claimant and queues vouchers for opted-in qualifying line items", async () => {
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: {
        reimbursement: { update: mock() },
        reimbursementHistory: { insert: mock() },
      },
      run: mock()
        .mockResolvedValueOnce({
          approvalScreenshotKey: null,
          status: "pending",
          title: "Travel",
          userId: "owner-1",
        })
        .mockResolvedValueOnce([
          lineItem("li-voucher", 50_000, true),
          lineItem("li-at-threshold", 100_000, true),
          lineItem("li-over-threshold", 100_001, true),
          lineItem("li-not-opted-in", 20_000, false),
          lineItem("li-zero", 0, true),
        ]),
    };

    await reimbursementMutators.approve.fn({
      args: {
        approvalScreenshotKey: SCREENSHOT_KEY,
        id: "request-1",
        note: "Paid by UPI",
      },
      ctx,
      tx,
    } as never);

    const task = taskByMutator(ctx.asyncTasks, "approveReimbursement");
    expect(task?.meta).toMatchObject({
      reimbursementId: "request-1",
      submitterId: "owner-1",
      title: "Travel",
    });
    await task?.fn();

    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-approved",
      {
        note: "Paid by UPI",
        reimbursementId: "request-1",
        reviewedAt: expect.any(Number),
        submitterId: "owner-1",
        title: "Travel",
      },
      { traceId: "trace-1" }
    );
    const voucherCalls = enqueue.mock.calls.filter(
      ([name]) => name === "generate-cash-voucher"
    );
    expect(voucherCalls).toEqual([
      [
        "generate-cash-voucher",
        {
          approverUserId: "approver-1",
          lineItemId: "li-voucher",
          reimbursementId: "request-1",
        },
        { singletonKey: "voucher-li-voucher", traceId: "trace-1" },
      ],
      [
        "generate-cash-voucher",
        {
          approverUserId: "approver-1",
          lineItemId: "li-at-threshold",
          reimbursementId: "request-1",
        },
        { singletonKey: "voucher-li-at-threshold", traceId: "trace-1" },
      ],
    ]);
  });

  it("queues no side effects when approval is refused for a missing screenshot", async () => {
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: {
        reimbursement: { update: mock() },
        reimbursementHistory: { insert: mock() },
      },
      run: mock().mockResolvedValueOnce({
        approvalScreenshotKey: null,
        status: "pending",
        title: "Travel",
        userId: "owner-1",
      }),
    };

    await expect(
      reimbursementMutators.approve.fn({
        args: { id: "request-1" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Attach the payment screenshot to approve");
    expect(ctx.asyncTasks).toHaveLength(0);
    expect(ctx.beforeCommitTasks).toHaveLength(0);
  });

  it("notifies the claimant when an advance payment is approved", async () => {
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: {
        advancePayment: { update: mock() },
        advancePaymentHistory: { insert: mock() },
      },
      run: mock().mockResolvedValueOnce({
        approvalScreenshotKey: null,
        status: "pending",
        title: "Supplies",
        userId: "owner-1",
      }),
    };

    await advancePaymentMutators.approve.fn({
      args: { approvalScreenshotKey: SCREENSHOT_KEY, id: "advance-1" },
      ctx,
      tx,
    } as never);

    await taskByMutator(ctx.asyncTasks, "approveAdvancePayment")?.fn();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "notify-advance-payment-approved",
      {
        advancePaymentId: "advance-1",
        note: undefined,
        reviewedAt: expect.any(Number),
        submitterId: "owner-1",
        title: "Supplies",
      },
      { traceId: "trace-1" }
    );
  });

  it("refuses an approver's own advance payment unless one person handles finance", async () => {
    const ownAdvance = {
      approvalScreenshotKey: null,
      status: "pending",
      title: "Supplies",
      userId: "approver-1",
    };
    const approve = (soleApprover: null | { value: string }) => {
      const tx = {
        location: "server",
        mutate: {
          advancePayment: { update: mock() },
          advancePaymentHistory: { insert: mock() },
        },
        run: mock()
          .mockResolvedValueOnce(ownAdvance)
          .mockResolvedValueOnce(soleApprover),
      };
      return {
        result: advancePaymentMutators.approve.fn({
          args: { approvalScreenshotKey: SCREENSHOT_KEY, id: "advance-1" },
          ctx: serverContext(),
          tx,
        } as never),
        tx,
      };
    };

    const refused = approve(null);
    await expect(refused.result).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);
    expect(refused.tx.mutate.advancePayment.update).not.toHaveBeenCalled();

    const allowed = approve({ value: "true" });
    await allowed.result;
    expect(allowed.tx.mutate.advancePayment.update).toHaveBeenCalledTimes(1);
  });
});
