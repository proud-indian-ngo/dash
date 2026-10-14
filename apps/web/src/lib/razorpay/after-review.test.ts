import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: (_fields: unknown, work: () => Promise<void>) => {
    work().catch(() => undefined);
  },
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: async () => null }));

const { queueRefundChecks } = await import("./after-review");

import type { RazorpaySetup } from "./config";

const setup = (apiKey: { id: string; secret: string } | null) =>
  ({
    apiKey,
    enabled: true,
    mode: "test",
    testInProduction: false,
    webhookSecret: "s",
  }) satisfies RazorpaySetup;

describe("queueRefundChecks", () => {
  it("queues each reviewed payment's sync on its batch day, with the key secret", () => {
    const queued: unknown[] = [];
    const queue = async (payload: unknown) => {
      queued.push(payload);
    };
    expect(
      queueRefundChecks(
        "razorpay:test:2026-10-12",
        ["pay_A", "pay_B"],
        setup({ id: "rzp_test_x", secret: "k" }),
        queue
      )
    ).toBe(2);
    expect(queued).toEqual([
      { day: "2026-10-12", paymentId: "pay_A" },
      { day: "2026-10-12", paymentId: "pay_B" },
    ]);
  });

  it("does nothing without the key secret, for another mode or a CSV batch", () => {
    const queue = mock(async () => undefined);
    expect(
      queueRefundChecks(
        "razorpay:test:2026-10-12",
        ["pay_A"],
        setup(null),
        queue
      )
    ).toBe(0);
    expect(
      queueRefundChecks(
        "razorpay:live:2026-10-12",
        ["pay_A"],
        setup({ id: "rzp_test_x", secret: "k" }),
        queue
      )
    ).toBe(0);
    expect(
      queueRefundChecks(
        "h1:filehash",
        ["pay_A"],
        setup({ id: "rzp_test_x", secret: "k" }),
        queue
      )
    ).toBe(0);
    expect(queue).not.toHaveBeenCalled();
  });
});
