import { beforeEach, describe, expect, it, mock } from "bun:test";

const calls: string[] = [];
let accountActive = true;
const config = new Map<string, string>();
const written: Record<string, string>[] = [];

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({
  env: { BETTER_AUTH_URL: "http://localhost:3000" },
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: async () => null }));
mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: () => undefined,
}));
const noop = async () => undefined;
mock.module("@pi-dash/db/queries/razorpay-refunds", () => ({
  applyRazorpayRefund: noop,
  countRefundsNeedingAttention: async () => new Map(),
}));
mock.module("@pi-dash/db/queries/razorpay-import", () => ({
  appendImportRow: noop,
  failPendingPaymentRow: noop,
  findRazorpayBatch: noop,
  findRazorpayPaymentRow: noop,
  insertRazorpayBatch: noop,
  listStaleRazorpayRows: async () => [],
  markImportRowWaiting: noop,
  recountImportBatches: async () => 0,
  REOPENABLE_REASONS: ["not_captured", "not_found"],
  reopenFailedPaymentRow: noop,
  replacePendingRaw: noop,
  attachClearingAccount: async (_tx: unknown, id: string) => {
    calls.push(`attach:${id}`);
    return 1;
  },
  countRazorpayPending: async () => 0,
  countRazorpayWaitingByReason: async () => new Map(),
  findClearingAccount: async (id: string) =>
    accountActive ? { id, name: "Razorpay clearing" } : null,
  listWaitingPayments: async (reasons: readonly string[]) => {
    calls.push(`list:${reasons.join(",")}`);
    return [
      { batchKey: "razorpay:test:2026-10-12", paymentId: "pay_A" },
      { batchKey: "not-a-key", paymentId: "pay_B" },
    ];
  },
  RAZORPAY_CONFIG_KEYS: {
    lastReconcile: "razorpay_last_reconcile",
    reconcileRun: "razorpay_reconcile_run",
  },
  readRazorpayConfig: async () => config,
  withRazorpayStageTransaction: async (run: (tx: unknown) => unknown) => {
    calls.push("lock");
    return await run({});
  },
  writeRazorpayConfig: async (values: Record<string, string>) => {
    calls.push(`write:${Object.keys(values).sort().join(",")}`);
    written.push(values);
  },
}));

const {
  requestRazorpayReconcile,
  saveRazorpaySettings,
  RazorpaySettingsError,
} = await import("./settings");
const { DEFAULT_NOTES_KEYS } = await import("./notes-keys");

const ACCOUNT = "0190a000-0000-7000-8000-000000000001";

describe("saveRazorpaySettings", () => {
  beforeEach(() => {
    calls.length = 0;
    accountActive = true;
  });

  it("saves the notes keys alone, leaving the account and the queue alone", async () => {
    const queued: unknown[] = [];
    expect(
      await saveRazorpaySettings({ notesKeys: DEFAULT_NOTES_KEYS }, (p) => {
        queued.push(...p);
      })
    ).toEqual({ attachedBatchCount: 0, requeuedCount: 0 });
    expect(calls).toEqual(["lock", "write:notesKeys"]);
    expect(queued).toEqual([]);
  });

  it("attaches the account under the stage lock and queues the payments that waited for it", async () => {
    const queued: unknown[] = [];
    expect(
      await saveRazorpaySettings({ clearingAccountId: ACCOUNT }, (p) => {
        queued.push(...p);
      })
    ).toEqual({ attachedBatchCount: 1, requeuedCount: 1 });
    expect(calls).toEqual([
      "lock",
      "write:clearingAccountId",
      `attach:${ACCOUNT}`,
      "list:no_clearing_account,clearing_account_inactive",
    ]);
    // Keyed by payment ID and the batch's day; unreadable keys are dropped.
    expect(queued).toEqual([{ day: "2026-10-12", paymentId: "pay_A" }]);
  });

  it("refuses an account that is not an active gateway clearing account", async () => {
    accountActive = false;
    await expect(
      saveRazorpaySettings({ clearingAccountId: ACCOUNT }, () => undefined)
    ).rejects.toBeInstanceOf(RazorpaySettingsError);
    expect(calls).toEqual([]);
  });
});

describe("requestRazorpayReconcile", () => {
  const NOW = new Date("2026-10-14T06:00:00Z");
  const KEYED = {
    apiKey: { id: "rzp_test_x", secret: "k" },
    enabled: true as const,
    mode: "test" as const,
    testInProduction: false,
    webhookSecret: "w",
  };

  beforeEach(() => {
    config.clear();
    written.length = 0;
  });

  it("is refused without the key secret or with a test key in production", async () => {
    const queue = mock(async () => "job");
    await expect(
      requestRazorpayReconcile(
        { reason: "manual" },
        { ...KEYED, apiKey: null },
        queue,
        NOW
      )
    ).rejects.toThrow("RAZORPAY_KEY_SECRET");
    await expect(
      requestRazorpayReconcile(
        { reason: "manual" },
        { ...KEYED, testInProduction: true },
        queue,
        NOW
      )
    ).rejects.toThrow("test key");
    expect(queue).not.toHaveBeenCalled();
  });

  it("queues the last three days, shown as queued", async () => {
    const queue = mock(async (_payload: unknown) => "job");
    expect(
      await requestRazorpayReconcile({ reason: "manual" }, KEYED, queue, NOW)
    ).toEqual({ days: 4, from: "2026-10-11", to: "2026-10-14" });
    expect(queue.mock.calls[0]?.[0]).toEqual({
      from: "2026-10-11",
      reason: "manual",
      to: "2026-10-14",
    });
    expect(JSON.parse(written[0]?.reconcileRun ?? "{}")).toMatchObject({
      status: "queued",
      windowsDone: 0,
      windowsTotal: 4,
    });
  });

  it("checks a backfill range before queueing it", async () => {
    const queue = mock(async () => "job");
    await expect(
      requestRazorpayReconcile(
        { from: "2025-01-01", reason: "backfill", to: "2026-10-14" },
        KEYED,
        queue,
        NOW
      )
    ).rejects.toThrow("400 days");
    expect(queue).not.toHaveBeenCalled();
    expect(
      await requestRazorpayReconcile(
        { from: "2026-04-01", reason: "backfill", to: "2026-10-14" },
        KEYED,
        queue,
        NOW
      )
    ).toEqual({ days: 197, from: "2026-04-01", to: "2026-10-14" });
  });

  it("is refused while a run is active, and puts the state back when the queue holds one", async () => {
    config.set(
      "razorpay_reconcile_run",
      JSON.stringify({
        counts: {},
        from: "2026-10-11",
        reason: "scheduled",
        status: "running",
        to: "2026-10-14",
        updatedAt: "2026-10-14T05:55:00Z",
        windowsDone: 1,
        windowsTotal: 4,
      })
    );
    const queue = mock(async () => "job");
    await expect(
      requestRazorpayReconcile({ reason: "manual" }, KEYED, queue, NOW)
    ).rejects.toThrow("already running");
    expect(queue).not.toHaveBeenCalled();

    // A run whose progress stopped long ago is not active; the queue still
    // refuses while its job exists, and the old state is put back.
    const stale = config.get("razorpay_reconcile_run") ?? "";
    config.set(
      "razorpay_reconcile_run",
      stale.replace("2026-10-14T05:55:00Z", "2026-10-14T01:00:00Z")
    );
    await expect(
      requestRazorpayReconcile(
        { reason: "manual" },
        KEYED,
        async () => null,
        NOW
      )
    ).rejects.toThrow("already running");
    expect(written.at(-1)?.reconcileRun).toBe(
      config.get("razorpay_reconcile_run")
    );
  });
});
