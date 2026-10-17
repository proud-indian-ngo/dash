import { describe, expect, it } from "bun:test";

import { QUEUE_NAMES } from "./enqueue";
import { registerSchedules } from "./schedules";

describe("registerSchedules", () => {
  it("only schedules jobs whose queue is created at startup", async () => {
    const scheduled: string[] = [];
    const boss = {
      schedule: async (name: string) => {
        scheduled.push(name);
      },
      unschedule: async () => undefined,
    };
    await registerSchedules(boss as never);
    expect(scheduled).toContain("ensure-fiscal-years");
    expect(scheduled).toContain("expire-import-rows");
    expect(scheduled).toContain("remind-trustee-terms");
    expect(scheduled).toContain("close-due-resolutions");
    expect(scheduled).toContain("expire-event-interests");
    expect(scheduled).toContain("flush-held-notifications");
    expect(scheduled).toContain("ledger-post-pending");
    const queues = new Set<string>(QUEUE_NAMES);
    for (const name of scheduled) {
      expect(queues.has(name)).toBe(true);
    }
  });

  const withEnv = async (values: Record<string, string | undefined>) => {
    const saved = Object.fromEntries(
      Object.keys(values).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, values);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[key];
      }
    }
    const scheduled: { data: unknown; name: string }[] = [];
    const unscheduled: string[] = [];
    try {
      await registerSchedules({
        schedule: async (name: string, _cron: string, data: unknown) => {
          scheduled.push({ data, name });
        },
        unschedule: async (name: string) => {
          unscheduled.push(name);
        },
      } as never);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
    return { scheduled, unscheduled };
  };

  it("schedules the Razorpay reconcile whenever ingestion is on, never a test key in production", async () => {
    for (const env of [
      {
        NODE_ENV: "production",
        RAZORPAY_KEY_ID: "rzp_live_x",
        RAZORPAY_KEY_SECRET: "k",
        RAZORPAY_WEBHOOK_SECRET: "w",
      },
      // Without the key secret it still syncs stuck payments.
      {
        NODE_ENV: "production",
        RAZORPAY_KEY_ID: "rzp_live_x",
        RAZORPAY_KEY_SECRET: undefined,
        RAZORPAY_WEBHOOK_SECRET: "w",
      },
    ]) {
      const on = await withEnv(env);
      expect(on.scheduled).toContainEqual({
        data: { reason: "scheduled" },
        name: "razorpay-reconcile",
      });
    }

    for (const env of [
      {
        RAZORPAY_KEY_ID: "rzp_live_x",
        RAZORPAY_KEY_SECRET: "k",
        RAZORPAY_WEBHOOK_SECRET: undefined,
      },
      {
        NODE_ENV: "production",
        RAZORPAY_KEY_ID: "rzp_test_x",
        RAZORPAY_KEY_SECRET: "k",
        RAZORPAY_WEBHOOK_SECRET: "w",
      },
    ]) {
      const off = await withEnv(env);
      expect(off.scheduled.map((s) => s.name)).not.toContain(
        "razorpay-reconcile"
      );
      expect(off.unscheduled).toContain("razorpay-reconcile");
    }
  });
});
