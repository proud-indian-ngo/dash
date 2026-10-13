import { beforeEach, describe, expect, it, mock } from "bun:test";

const calls: string[] = [];
let accountActive = true;

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({
  env: { BETTER_AUTH_URL: "http://localhost:3000" },
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: async () => null }));
mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: () => undefined,
}));
mock.module("@pi-dash/db/queries/razorpay-import", () => ({
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
  RAZORPAY_CONFIG_KEYS: {},
  readRazorpayConfig: async () => new Map(),
  withRazorpayStageTransaction: async (run: (tx: unknown) => unknown) => {
    calls.push("lock");
    return await run({});
  },
  writeRazorpayConfig: async (values: Record<string, string>) => {
    calls.push(`write:${Object.keys(values).sort().join(",")}`);
  },
}));

const { saveRazorpaySettings, RazorpaySettingsError } =
  await import("./settings");
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
