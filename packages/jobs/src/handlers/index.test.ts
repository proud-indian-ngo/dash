import { describe, expect, it, mock } from "bun:test";

import type { PgBoss } from "pg-boss";

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({ env: {} }));
mock.module("bun", () => ({ S3Client: class S3Client {} }));

const { registerHandlers } = await import("./index");

describe("registerHandlers", () => {
  it("registers every Kalakriti notification worker", async () => {
    const createQueue = mock().mockResolvedValue(undefined);
    const work = mock().mockResolvedValue(undefined);

    await registerHandlers({ createQueue, work } as unknown as PgBoss);

    expect(work.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "notify-kalakriti-guardian-access",
        "notify-kalakriti-guardian-reactivated",
        "notify-kalakriti-registration-open",
        "notify-kalakriti-registration-closed",
        "notify-kalakriti-schedule-changed",
        "notify-kalakriti-transport-changed",
        "remind-kalakriti-registration-close",
      ])
    );
  });

  it("creates the Razorpay sync queue one-per-payment and leaves its worker to the web server", async () => {
    const createQueue = mock().mockResolvedValue(undefined);
    const work = mock().mockResolvedValue(undefined);

    await registerHandlers({ createQueue, work } as unknown as PgBoss);

    expect(createQueue).toHaveBeenCalledWith(
      "razorpay-sync-payment",
      expect.objectContaining({ policy: "stately" })
    );
    expect(work.mock.calls.map(([name]) => name)).not.toContain(
      "razorpay-sync-payment"
    );
  });

  it("runs one Razorpay reconcile at a time, never retried, and keys refunds by ID with a day of retries", async () => {
    const createQueue = mock().mockResolvedValue(undefined);
    const work = mock().mockResolvedValue(undefined);

    await registerHandlers({ createQueue, work } as unknown as PgBoss);

    expect(createQueue).toHaveBeenCalledWith(
      "razorpay-reconcile",
      expect.objectContaining({
        expireInSeconds: 4 * 60 * 60,
        policy: "exclusive",
        retryLimit: 0,
      })
    );
    expect(createQueue).toHaveBeenCalledWith(
      "razorpay-sync-refund",
      expect.objectContaining({
        policy: "stately",
        retryBackoff: true,
        retryDelayMax: 3600,
        retryLimit: 26,
      })
    );
    const workers = work.mock.calls.map(([name]) => name);
    expect(workers).not.toContain("razorpay-reconcile");
    expect(workers).not.toContain("razorpay-sync-refund");
  });
});
