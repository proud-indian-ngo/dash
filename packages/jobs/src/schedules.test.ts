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
    expect(scheduled).toContain("retimestamp-governance-archives");
    expect(scheduled).toContain("generate-compliance-items");
    expect(scheduled).toContain("remind-compliance-items");
    expect(scheduled).toContain("expire-event-interests");
    expect(scheduled).toContain("flush-held-notifications");
    expect(scheduled).toContain("ledger-post-pending");
    const queues = new Set<string>(QUEUE_NAMES);
    for (const name of scheduled) {
      expect(queues.has(name)).toBe(true);
    }
  });

  it("catches up missed maintenance runs once and skips missed reminders", async () => {
    const missed = new Map<string, unknown>();
    await registerSchedules({
      schedule: async (
        name: string,
        _cron: string,
        _data: unknown,
        options: { missed?: string }
      ) => {
        missed.set(name, options.missed);
      },
      unschedule: async () => undefined,
    } as never);
    for (const name of [
      "ensure-fiscal-years",
      "close-due-resolutions",
      "retimestamp-governance-archives",
      "generate-compliance-items",
      "ledger-post-pending",
      "expire-import-rows",
    ]) {
      expect(missed.get(name)).toBe("once");
    }
    expect(missed.get("remind-compliance-items")).toBeUndefined();
    expect(missed.get("send-weekly-events-digest")).toBeUndefined();
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

  it("checks for Aadhaar eSign signatures only with Leegality set up", async () => {
    const on = await withEnv({
      LEEGALITY_API_URL: "https://app1.leegality.com",
      LEEGALITY_AUTH_TOKEN: "t",
    });
    expect(on.scheduled.map((s) => s.name)).toContain(
      "collect-esign-signatures"
    );
    const off = await withEnv({
      LEEGALITY_API_URL: undefined,
      LEEGALITY_AUTH_TOKEN: "t",
    });
    expect(off.scheduled.map((s) => s.name)).not.toContain(
      "collect-esign-signatures"
    );
    expect(off.unscheduled).toContain("collect-esign-signatures");
  });
});
