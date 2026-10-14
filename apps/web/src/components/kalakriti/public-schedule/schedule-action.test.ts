import { describe, expect, it } from "bun:test";

import { scheduleActionKind } from "./schedule-action";

describe("scheduleActionKind", () => {
  it("offers interest before the event starts", () => {
    expect(
      scheduleActionKind({
        interestClosed: false,
        hasKalakritiAccess: false,
        isAuthenticated: true,
      })
    ).toBe("showInterest");
    expect(
      scheduleActionKind({
        interestClosed: false,
        hasKalakritiAccess: false,
        isAuthenticated: false,
      })
    ).toBe("signUp");
  });

  it("offers neither interest nor sign-up once the event is cancelled or has started", () => {
    for (const isAuthenticated of [true, false]) {
      expect(
        scheduleActionKind({
          interestClosed: true,
          hasKalakritiAccess: false,
          isAuthenticated,
        })
      ).toBe("none");
    }
  });

  it("keeps the dashboard link for Kalakriti members after the start", () => {
    expect(
      scheduleActionKind({
        interestClosed: true,
        hasKalakritiAccess: true,
        isAuthenticated: true,
      })
    ).toBe("dashboard");
  });
});
