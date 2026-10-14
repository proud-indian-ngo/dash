import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const {
  handleRazorpayReconcile,
  handleRazorpaySyncPayment,
  handleRazorpaySyncRefund,
  handleRazorpaySyncSettlement,
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

describe("queueing the books", () => {
  it("queues the books for each synced payment, refund and recorded settlement", async () => {
    const books = mock(async (_id: string) => undefined);
    await handleRazorpaySyncPayment(
      [job("pay_A")],
      async () => "ready" as const,
      async () => true,
      books
    );
    await handleRazorpaySyncRefund(
      [{ data: { paymentId: "pay_A", refundId: "rfnd_A" }, id: "r" }],
      async () => "applied" as never,
      books
    );
    await handleRazorpaySyncSettlement(
      [{ data: { settlementId: "setl_A" }, id: "s" }],
      async () => ({
        created: true,
        lines: 1,
        linked: 1,
        outcome: "recorded" as const,
        unlinked: 0,
      }),
      books
    );
    await handleRazorpaySyncSettlement(
      [{ data: { settlementId: "setl_B" }, id: "t" }],
      async () => ({ outcome: "no_key_secret" as const }),
      books
    );
    expect(books.mock.calls.map(([id]) => id)).toEqual([
      "pay_A",
      "rfnd_A",
      "setl_A",
    ]);
  });

  it("never fails a sync when the books can't be queued", async () => {
    const result = await handleRazorpaySyncPayment(
      [job("pay_A")],
      async () => "ready" as const,
      async () => true,
      async () => {
        throw new Error("database down");
      }
    );
    expect(result).toEqual({ outcomes: ["ready"] });
  });

  it("sweeps the books after a reconcile run, not after a skipped one", async () => {
    const sweep = mock(() => undefined);
    await handleRazorpayReconcile(
      [{ data: { reason: "scheduled" }, id: "j" }],
      async () => ({
        reason: "no_key_secret" as const,
        status: "skipped" as const,
      }),
      async () => undefined,
      sweep
    );
    expect(sweep).not.toHaveBeenCalled();
    await handleRazorpayReconcile(
      [{ data: { reason: "scheduled" }, id: "k" }],
      async () =>
        ({
          counts: {},
          pages: 1,
          status: "completed",
          windowsDone: 1,
          windowsTotal: 1,
        }) as never,
      async () => undefined,
      sweep
    );
    expect(sweep).toHaveBeenCalledTimes(1);
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

describe("handleRazorpaySyncSettlement", () => {
  it("syncs each job by settlement ID only", async () => {
    const sync = mock(async (_input: unknown) => ({
      outcome: "no_key_secret" as const,
    }));
    const result = await handleRazorpaySyncSettlement(
      [
        {
          data: { __traceId: "t", settlementId: "setl_A" } as never,
          id: "j",
        },
      ],
      sync
    );
    expect(result).toEqual({ outcomes: [{ outcome: "no_key_secret" }] });
    expect(sync.mock.calls.map(([input]) => input)).toEqual([
      { settlementId: "setl_A" },
    ]);
  });

  it("rethrows a failure for retry, sanitised", async () => {
    await expect(
      handleRazorpaySyncSettlement(
        [{ data: { settlementId: "setl_A" }, id: "j" }],
        async () => {
          throw new Error("Failed query params: setl_A");
        }
      )
    ).rejects.toThrow("razorpay_settlement_sync_failed: Error");
  });
});
