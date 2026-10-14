import { describe, expect, it } from "bun:test";

import { waitingBreakdown } from "./waiting-breakdown";

describe("waitingBreakdown", () => {
  it("groups waiting rows by reason, reviewer decisions first", () => {
    expect(
      waitingBreakdown([
        { outcome: "pending", outcomeReason: "queued" },
        { outcome: "pending", outcomeReason: "needs_review" },
        { outcome: "pending", outcomeReason: "queued" },
        { outcome: "pending", outcomeReason: "sync_failed" },
        { outcome: "pending", outcomeReason: "no_clearing_account" },
        { outcome: "pending", outcomeReason: "clearing_account_inactive" },
        { outcome: "skipped", outcomeReason: "undecided" },
        { outcome: "imported", outcomeReason: null },
        { outcome: "skipped", outcomeReason: "skipped_by_user" },
      ])
    ).toEqual([
      { count: 1, label: "needs review", reason: "needs_review" },
      { count: 1, label: "left for review", reason: "undecided" },
      { count: 2, label: "syncing", reason: "queued" },
      { count: 1, label: "sync failed", reason: "sync_failed" },
      { count: 1, label: "no clearing account", reason: "no_clearing_account" },
      {
        count: 1,
        label: "account inactive",
        reason: "clearing_account_inactive",
      },
    ]);
  });

  it("counts a pending row without a known reason, and nothing when none wait", () => {
    expect(
      waitingBreakdown([{ outcome: "pending", outcomeReason: null }])
    ).toEqual([{ count: 1, label: "not imported", reason: "other" }]);
    expect(
      waitingBreakdown([{ outcome: "imported", outcomeReason: null }])
    ).toEqual([]);
  });
});
