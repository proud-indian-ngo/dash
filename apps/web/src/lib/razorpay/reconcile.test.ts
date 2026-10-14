import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

const {
  activeRun,
  addDays,
  backfillRangeError,
  daysBetween,
  indiaDayWindow,
  recentRange,
  runRazorpayReconcile,
} = await import("./reconcile");

import { RazorpayApiError, type RazorpayClient, type UnixWindow } from "./api";
import type { RazorpaySetup } from "./config";
import type { StageResult } from "./ingest";
import type { RazorpayPayment } from "./payment";
import type { ReconcileDeps, ReconcileState } from "./reconcile";
import type { RazorpayRefund } from "./refund-schema";

const unix = (iso: string) => Date.parse(iso) / 1000;

describe("India day windows", () => {
  it("covers one India day, midnight to 23:59:59 IST", () => {
    const window = indiaDayWindow("2026-10-13");
    expect(window.from).toBe(unix("2026-10-12T18:30:00Z"));
    expect(window.to).toBe(unix("2026-10-13T18:29:59Z"));
    // Consecutive days meet without a gap or an overlap.
    expect(indiaDayWindow("2026-10-14").from).toBe(window.to + 1);
  });

  it("walks a range day by day across month and year ends", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(daysBetween("2026-10-14", "2026-10-13")).toEqual([]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("syncs today and the three days before, in India", () => {
    // 20:00 UTC on 13 Oct is already 14 Oct in India.
    expect(recentRange(new Date("2026-10-13T20:00:00Z"))).toEqual({
      from: "2026-10-11",
      to: "2026-10-14",
    });
  });

  it("refuses a backfill range that is reversed, in the future or over 400 days", () => {
    const now = new Date("2026-10-14T06:00:00Z");
    expect(backfillRangeError("2026-04-01", "2026-10-14", now)).toBeNull();
    expect(backfillRangeError("2026-10-10", "2026-10-01", now)).toContain(
      "on or before"
    );
    expect(backfillRangeError("2026-10-01", "2026-10-15", now)).toContain(
      "future"
    );
    // 10 Sep 2025 to 14 Oct 2026 is exactly 400 days.
    expect(backfillRangeError("2025-09-09", "2026-10-14", now)).toContain(
      "400"
    );
    expect(backfillRangeError("2025-09-10", "2026-10-14", now)).toBeNull();
    expect(backfillRangeError("", "2026-10-14", now)).not.toBeNull();
  });
});

describe("activeRun", () => {
  const run = (status: ReconcileState["status"], updatedAt: string) =>
    ({
      counts: {} as ReconcileState["counts"],
      from: "2026-10-11",
      reason: "manual",
      status,
      to: "2026-10-14",
      updatedAt,
      windowsDone: 0,
      windowsTotal: 4,
    }) satisfies ReconcileState;
  const now = new Date("2026-10-14T10:00:00Z");

  it("is a queued or running run whose progress moved in the last half hour", () => {
    expect(activeRun(run("running", "2026-10-14T09:50:00Z"), now)).not.toBe(
      null
    );
    expect(activeRun(run("queued", "2026-10-14T09:59:00Z"), now)).not.toBe(
      null
    );
    expect(activeRun(run("running", "2026-10-14T09:00:00Z"), now)).toBeNull();
    expect(activeRun(run("ok", "2026-10-14T09:59:00Z"), now)).toBeNull();
    expect(activeRun(null, now)).toBeNull();
  });
});

const KEY = { id: "rzp_test_x", secret: "k" };
const enabled = (
  apiKey: { id: string; secret: string } | null = KEY,
  testInProduction = false
) =>
  ({
    apiKey,
    enabled: true,
    mode: "test",
    testInProduction,
    webhookSecret: "s",
  }) satisfies RazorpaySetup;

const payment = (
  id: string,
  overrides: Partial<RazorpayPayment> = {}
): RazorpayPayment => ({
  amount: 10_000,
  captured: true,
  created_at: unix("2026-10-13T05:00:00Z"),
  currency: "INR",
  id,
  status: "captured",
  ...overrides,
});

const refund = (id: string, paymentId: string): RazorpayRefund => ({
  amount: 5000,
  created_at: unix("2026-10-13T06:00:00Z"),
  currency: "INR",
  id,
  payment_id: paymentId,
  status: "processed",
});

interface Harness {
  calls: string[];
  deps: ReconcileDeps;
  last: ReconcileState[];
  recounted: string[][];
  runs: (ReconcileState | null)[];
}

function harness({
  payments = {},
  refunds = {},
  failListOn,
  staged = {},
  stale = [],
  clockStep = 0,
}: {
  clockStep?: number;
  failListOn?: string;
  payments?: Record<string, RazorpayPayment[]>;
  refunds?: Record<string, RazorpayRefund[]>;
  stale?: { batchId: string; batchKey: string; paymentId: string }[];
  staged?: Record<string, Partial<StageResult>>;
} = {}): Harness {
  const calls: string[] = [];
  const last: ReconcileState[] = [];
  const runs: (ReconcileState | null)[] = [];
  const recounted: string[][] = [];
  let clock = Date.parse("2026-10-14T06:00:00Z");
  const dayOf = (window: UnixWindow) =>
    new Date((window.from + 19_800) * 1000).toISOString().slice(0, 10);
  const client = {
    listPaymentRefunds: async () => ({ items: [], pages: 1, unreadable: 0 }),
    listPayments: async (window: UnixWindow) => {
      const day = dayOf(window);
      calls.push(`payments:${day}`);
      if (failListOn === day) {
        throw new RazorpayApiError(502);
      }
      return { items: payments[day] ?? [], pages: 1, unreadable: 0 };
    },
    listRefunds: async (window: UnixWindow) => {
      const day = dayOf(window);
      calls.push(`refunds:${day}`);
      return { items: refunds[day] ?? [], pages: 1, unreadable: 0 };
    },
  } as unknown as RazorpayClient;
  return {
    calls,
    deps: {
      applyPaymentRefunds: async (paymentId) => {
        calls.push(`payment-refunds:${paymentId}`);
        return { applied: 1, changed: 0, waiting: 0 };
      },
      applyRefund: async (r) => {
        calls.push(`refund:${r.id}`);
        return r.payment_id === "pay_Waiting"
          ? "payment_not_imported"
          : "applied";
      },
      client: () => client,
      listStale: async () => stale,
      now: () => {
        clock += clockStep;
        return new Date(clock);
      },
      process: async (id) => {
        calls.push(`process:${id}`);
        return id === "pay_Review" ? "needs_review" : "new_donor";
      },
      recount: async (ids) => {
        recounted.push([...ids].sort());
        return 0;
      },
      saveLast: async (state) => {
        last.push(structuredClone(state));
      },
      saveRun: async (state) => {
        runs.push(state ? structuredClone(state) : null);
      },
      stage: async (p) => {
        calls.push(`stage:${p.id}`);
        return {
          batchId: `batch-${p.id.endsWith("Old") ? "old" : "today"}`,
          day: "2026-10-13",
          pending: true,
          rowId: `row-${p.id}`,
          staged: "new",
          ...staged[p.id],
        };
      },
      syncStale: async (input) => {
        calls.push(`stale:${input.paymentId}:${input.day}`);
        if (input.paymentId === "pay_Broken") {
          throw new Error("still failing");
        }
        return "new_donor";
      },
    },
    last,
    recounted,
    runs,
  };
}

describe("runRazorpayReconcile", () => {
  it("does nothing when Razorpay is off, without a key secret, or with a test key in production", async () => {
    const off = harness();
    expect(
      await runRazorpayReconcile(
        { reason: "scheduled" },
        { enabled: false },
        off.deps
      )
    ).toEqual({ reason: "disabled", status: "skipped" });
    expect(off.calls).toEqual([]);

    const keyless = harness();
    expect(
      await runRazorpayReconcile(
        { reason: "manual" },
        enabled(null),
        keyless.deps
      )
    ).toEqual({ reason: "no_key_secret", status: "skipped" });
    // A run queued from Settings no longer shows as running.
    expect(keyless.runs).toEqual([null]);
    expect(keyless.calls).toEqual([]);

    const testProd = harness();
    expect(
      await runRazorpayReconcile(
        { reason: "scheduled" },
        enabled(KEY, true),
        testProd.deps
      )
    ).toEqual({ reason: "test_mode_refused", status: "skipped" });
    expect(testProd.calls).toEqual([]);
  });

  it("walks the last four India days and puts captured payments through the webhook's path", async () => {
    const h = harness({
      payments: {
        "2026-10-13": [
          payment("pay_New"),
          payment("pay_Refunded", {
            amount_refunded: 10_000,
            status: "refunded",
          }),
          payment("pay_Failed", { captured: false, status: "failed" }),
          payment("pay_Known"),
          payment("pay_Review"),
        ],
      },
      refunds: {
        "2026-10-13": [
          refund("rfnd_A", "pay_Old"),
          refund("rfnd_B", "pay_Waiting"),
        ],
      },
      staged: { pay_Known: { pending: false, staged: "existing" } },
    });
    const outcome = await runRazorpayReconcile(
      { reason: "scheduled" },
      enabled(),
      h.deps
    );
    expect(outcome).toEqual({
      counts: {
        checked: 5,
        errors: 0,
        imported: 2,
        known: 1,
        new: 3,
        refundsApplied: 2,
        refundsChanged: 0,
        refundsWaiting: 1,
        retried: 0,
        waiting: 1,
      },
      pages: 8,
      status: "ok",
      windowsDone: 4,
      windowsTotal: 4,
    });
    // The clock reads 14 Oct, 11:30 in India.
    expect(h.calls.filter((c) => c.startsWith("payments:"))).toEqual([
      "payments:2026-10-11",
      "payments:2026-10-12",
      "payments:2026-10-13",
      "payments:2026-10-14",
    ]);
    // Captured (even refunded since) payments only; a known decided one is not processed again.
    expect(h.calls).toContain("stage:pay_Refunded");
    expect(h.calls).toContain("payment-refunds:pay_Refunded");
    expect(h.calls).not.toContain("stage:pay_Failed");
    expect(h.calls).toContain("stage:pay_Known");
    expect(h.calls).not.toContain("process:pay_Known");
    expect(h.recounted).toEqual([["batch-today"]]);
    // Progress after every day, then the result, then no active run.
    expect(h.runs.at(-2)?.windowsDone).toBe(4);
    expect(h.runs.at(-1)).toBeNull();
    expect(h.last).toHaveLength(1);
    expect(h.last[0]).toMatchObject({
      from: "2026-10-11",
      reason: "scheduled",
      status: "ok",
      to: "2026-10-14",
    });
  });

  it("walks a backfill range and records its progress", async () => {
    const h = harness();
    const outcome = await runRazorpayReconcile(
      { from: "2026-04-01", reason: "backfill", to: "2026-04-03" },
      enabled(),
      h.deps
    );
    expect(outcome).toMatchObject({ status: "ok", windowsTotal: 3 });
    expect(h.runs.map((r) => r?.windowsDone ?? null)).toEqual([
      0,
      1,
      2,
      3,
      null,
    ]);
  });

  it("syncs payments stuck queued or failed once more, then recounts their batches", async () => {
    const h = harness({
      stale: [
        {
          batchId: "batch-old",
          batchKey: "razorpay:test:2026-10-01",
          paymentId: "pay_Stuck",
        },
        {
          batchId: "batch-older",
          batchKey: "razorpay:test:2026-09-30",
          paymentId: "pay_Broken",
        },
        {
          batchId: "batch-live",
          batchKey: "razorpay:live:2026-09-30",
          paymentId: "pay_OtherMode",
        },
      ],
    });
    const outcome = await runRazorpayReconcile(
      { reason: "scheduled" },
      enabled(),
      h.deps
    );
    expect(h.calls.filter((c) => c.startsWith("stale:"))).toEqual([
      "stale:pay_Stuck:2026-10-01",
      "stale:pay_Broken:2026-09-30",
    ]);
    expect(outcome).toMatchObject({
      counts: { errors: 1, retried: 1 },
      status: "ok",
    });
    expect(h.recounted).toEqual([["batch-old", "batch-older"]]);
  });

  it("stops on an API error and records a safe code, keeping the counts so far", async () => {
    const h = harness({
      failListOn: "2026-10-12",
      payments: { "2026-10-11": [payment("pay_New")] },
    });
    const outcome = await runRazorpayReconcile(
      { reason: "manual" },
      enabled(),
      h.deps
    );
    expect(outcome).toMatchObject({
      counts: { checked: 1, new: 1 },
      errorCode: "api_502",
      status: "failed",
      windowsDone: 1,
    });
    expect(h.last[0]).toMatchObject({ errorCode: "api_502", status: "failed" });
    expect(h.runs.at(-1)).toBeNull();
    expect(h.recounted).toEqual([["batch-today"]]);
  });

  it("stops before the queue's expiry", async () => {
    // Each clock read moves an hour on: the time limit trips part-way.
    const h = harness({ clockStep: 60 * 60 * 1000 });
    const outcome = await runRazorpayReconcile(
      { from: "2026-01-01", reason: "backfill", to: "2026-03-01" },
      enabled(),
      h.deps
    );
    expect(outcome).toMatchObject({
      errorCode: "time_limit",
      status: "failed",
    });
    expect(outcome.status === "failed" && outcome.windowsDone).toBeLessThan(5);
  });
});
