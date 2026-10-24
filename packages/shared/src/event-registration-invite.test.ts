import { describe, expect, it } from "vitest";

import { isEventRegistrationInviteToken } from "./event-registration-invite";

describe("isEventRegistrationInviteToken", () => {
  it("accepts a 32-byte base64url capability", () => {
    expect(
      isEventRegistrationInviteToken(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"
      )
    ).toBe(true);
  });

  it.each([
    "019f0000-0019-7000-8000-000000001982",
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ=",
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP!",
    " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
  ])("rejects a public identifier or malformed capability: %s", (value) => {
    expect(isEventRegistrationInviteToken(value)).toBe(false);
  });
});
