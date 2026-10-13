import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const { handleRazorpaySyncPayment } = await import("./worker");

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
    expect(sync.mock.calls).toEqual([
      [{ day: "2026-10-12", paymentId: "pay_A" }],
      [{ day: "2026-10-12", paymentId: "pay_B" }],
    ]);
  });

  it("rethrows a failure for retry without its message, which may quote donor details", async () => {
    const sync = mock(async (_input: unknown): Promise<"ready"> => {
      throw new Error('Failed query params: {"email":"asha@example.test"}');
    });
    const failure = await handleRazorpaySyncPayment([job("pay_A")], sync).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "razorpay_payment_sync_failed: Error"
    );
  });
});
