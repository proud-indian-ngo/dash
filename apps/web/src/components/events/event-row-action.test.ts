import { describe, expect, it } from "bun:test";

import { deriveCardActionState } from "./event-row-action";

const base = {
  canManageInterest: false,
  hasStarted: false,
  interest: undefined,
  isMember: false,
  isOwnTeam: false,
  isPublic: true,
};

describe("deriveCardActionState", () => {
  it("offers Show interest on a public event that has not started", () => {
    expect(deriveCardActionState(base)).toEqual({ kind: "showInterest" });
  });

  it("never offers Show interest once the event has started", () => {
    expect(deriveCardActionState({ ...base, hasStarted: true })).toEqual({
      kind: "none",
    });
  });

  it("shows an expired interest as not reviewed, with no cancel or re-offer", () => {
    for (const hasStarted of [true, false]) {
      expect(
        deriveCardActionState({
          ...base,
          hasStarted,
          interest: { id: "interest-1", status: "expired" },
        })
      ).toEqual({ kind: "interestNotReviewed" });
    }
  });

  it("keeps a pending interest cancellable until the event starts", () => {
    const interest = { id: "interest-1", status: "pending" as const };
    expect(deriveCardActionState({ ...base, interest })).toEqual({
      interestId: "interest-1",
      kind: "interestPending",
      started: false,
    });
    expect(
      deriveCardActionState({ ...base, hasStarted: true, interest })
    ).toEqual({
      interestId: "interest-1",
      kind: "interestPending",
      started: true,
    });
  });
});
