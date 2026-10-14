import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const {
  handleRazorpayReconcile,
  handleRazorpaySyncPayment,
  handleRazorpaySyncRefund,
} = await import("./worker");
const { RefundNotProcessedError } = await import("./refund");

const job = (paymentId: string) => ({
  data: { day: "2026-10-12", paymentId },
  id: `job-${paymentId}`,
});

describe("handleRazorpaySyncPayment", () => {
  it("syncs each job by payment ID and day only", async () => {
    const sync = mock(async (_input: unknown) => "ready" as const);
    const result = await handleRazorpaySyncPayment(
      [
        {
          ...job("pay_A"),
          // Trace IDs ride along in the payload; they are not passed on.
          data: { ...job("pay_A").data, __traceId: "t" } as never,
        },
        job("pay_B"),
      ],
      sync
    );
    expect(result).toEqual({ outcomes: ["ready", "ready"] });
    expect(sync.mock.calls.map(([input]) => input)).toEqual([
      { day: "2026-10-12", paymentId: "pay_A" },
      { day: "2026-10-12", paymentId: "pay_B" },
    ]);
  });

  it("rethrows a failure for retry without its message, which may quote donor details", async () => {
    const sync = mock(async (_input: unknown): Promise<"ready"> => {
      throw new Error('Failed query params: {"email":"asha@example.test"}');
    });
    const giveUp = mock(async () => true);
    const failure = await handleRazorpaySyncPayment(
      [{ ...job("pay_A"), retryCount: 1, retryLimit: 3 }],
      sync,
      giveUp
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "razorpay_payment_sync_failed: Error"
    );
    // Retries are left: the row stays queued.
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("marks the payment sync_failed when the last retry fails", async () => {
    const sync = mock(async (_input: unknown): Promise<"ready"> => {
      throw new Error("Razorpay API answered 503");
    });
    const giveUp = mock(async (_input: unknown) => true);
    await expect(
      handleRazorpaySyncPayment(
        [{ ...job("pay_A"), retryCount: 3, retryLimit: 3 }],
        sync,
        giveUp
      )
    ).rejects.toThrow("razorpay_payment_sync_failed");
    expect(giveUp.mock.calls).toEqual([
      [{ day: "2026-10-12", paymentId: "pay_A" }],
    ]);
  });
});

describe("handleRazorpaySyncRefund", () => {
  const refundJob = {
    data: {
      __traceId: "t",
      copy: { amount: 500, createdAt: 1, currency: "INR", status: "processed" },
      paymentId: "pay_A",
      refundId: "rfnd_A",
    } as never,
    id: "job-rfnd_A",
    retryCount: 0,
    retryLimit: 26,
  };

  it("applies each refund by its IDs and webhook copy only", async () => {
    const sync = mock(async (_input: unknown) => "applied" as const);
    expect(await handleRazorpaySyncRefund([refundJob], sync)).toEqual({
      outcomes: ["applied"],
    });
    expect(sync.mock.calls[0]?.[0]).toEqual({
      copy: { amount: 500, createdAt: 1, currency: "INR", status: "processed" },
      paymentId: "pay_A",
      refundId: "rfnd_A",
    });
  });

  it("throws a refund not processed yet back to pg-boss to retry", async () => {
    const sync = mock(async (_input: unknown): Promise<"applied"> => {
      throw new RefundNotProcessedError();
    });
    await expect(
      handleRazorpaySyncRefund([refundJob], sync)
    ).rejects.toBeInstanceOf(RefundNotProcessedError);
  });

  it("sanitises any other failure", async () => {
    const sync = mock(async (_input: unknown): Promise<"applied"> => {
      throw new Error("Failed query params: rfnd_A 500");
    });
    await expect(handleRazorpaySyncRefund([refundJob], sync)).rejects.toThrow(
      "razorpay_refund_sync_failed: Error"
    );
  });
});

describe("handleRazorpayReconcile", () => {
  it("runs the window and reason it was given", async () => {
    const run = mock(async (_input: unknown) => ({
      reason: "no_key_secret" as const,
      status: "skipped" as const,
    }));
    await handleRazorpayReconcile(
      [
        {
          data: {
            __traceId: "t",
            from: "2026-04-01",
            reason: "backfill",
            to: "2026-04-02",
          } as never,
          id: "j",
        },
        { data: { reason: "scheduled" }, id: "k" },
      ],
      run
    );
    expect(run.mock.calls.map(([input]) => input)).toEqual([
      { from: "2026-04-01", reason: "backfill", to: "2026-04-02" },
      { reason: "scheduled" },
    ]);
  });

  it("clears the running state and sanitises a crash", async () => {
    const clearRun = mock(async () => undefined);
    await expect(
      handleRazorpayReconcile(
        [{ data: { reason: "manual" }, id: "j" }],
        async () => {
          throw new Error("Failed query params: pay_X");
        },
        clearRun
      )
    ).rejects.toThrow("razorpay_reconcile_failed: Error");
    expect(clearRun).toHaveBeenCalled();
  });
});
