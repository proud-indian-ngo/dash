import { describe, expect, it } from "vitest";

import { batchCounts, NEEDS_REVIEW_REASONS } from "./queries/income-import";

const outcomes = (overrides: Partial<Record<string, number>> = {}) => ({
  conflict: 0,
  error: 0,
  imported: 0,
  linked_existing: 0,
  pending: 0,
  skipped: 0,
  ...overrides,
});

describe("import batch counters", () => {
  it("counts every pending row as waiting, whatever its reason, never as skipped", () => {
    // Queued for sync, sync gave up, needs review, no or inactive account.
    expect(batchCounts(outcomes({ imported: 2, pending: 5 }), 0)).toEqual({
      conflictCount: 0,
      errorCount: 0,
      importedCount: 2,
      linkedCount: 0,
      pendingCount: 5,
      skippedCount: 0,
    });
  });

  it("counts skipped rows left undecided as waiting, and the rest as skipped", () => {
    expect(batchCounts(outcomes({ pending: 1, skipped: 4 }), 3)).toMatchObject({
      pendingCount: 4,
      skippedCount: 1,
    });
  });

  it("treats Razorpay's waiting reasons as waiting", () => {
    expect([...NEEDS_REVIEW_REASONS]).toEqual(
      expect.arrayContaining([
        "clearing_account_inactive",
        "needs_review",
        "no_clearing_account",
        "queued",
        "sync_failed",
        "undecided",
      ])
    );
  });

  it("records API errors as errors, not waiting", () => {
    expect(batchCounts(outcomes({ error: 2 }), 0)).toMatchObject({
      errorCount: 2,
      pendingCount: 0,
    });
  });
});
