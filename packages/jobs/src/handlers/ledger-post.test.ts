import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/ledger/income-runner", () => ({
  postIncomeSourceNow: async () => ({
    related: 0,
    result: { posted: 0, reason: null, reversed: 0, status: "posted" },
  }),
  postPendingIncome: async () => ({}),
}));

const { handleLedgerPostPending, isFullSweepDay } =
  await import("./ledger-post");

const result = {
  checked: 0,
  failed: 0,
  posted: 0,
  remaining: 0,
  reversed: 0,
  waiting: 0,
};

describe("ledger-post-pending", () => {
  // 18 Oct 2026 is a Sunday; 19 Oct a Monday (India time).
  const sunday = new Date("2026-10-18T00:00:00Z");
  const monday = new Date("2026-10-19T00:00:00Z");

  it("looks at everything only on the Sunday scheduled run", () => {
    expect(isFullSweepDay("scheduled", sunday)).toBe(true);
    expect(isFullSweepDay("scheduled", monday)).toBe(false);
    expect(isFullSweepDay("manual", sunday)).toBe(false);
  });

  it("sweeps incrementally with a deadline, unless asked for a full run", async () => {
    const run = mock(async (_options: unknown) => result);
    await handleLedgerPostPending(
      [
        { data: { reason: "scheduled" }, id: "a" },
        { data: { full: true, reason: "manual" }, id: "b" },
      ] as never,
      run,
      () => monday
    );
    const [first, second] = run.mock.calls.map(
      ([options]) => options as { deadline: number; incremental: boolean }
    );
    expect(first?.incremental).toBe(true);
    expect(second?.incremental).toBe(false);
    expect(first?.deadline).toBe(monday.getTime() + 45 * 60 * 1000);
  });
});
