import { describe, expect, it } from "vitest";

import {
  signEventSignupLink,
  verifyEventSignupLink,
} from "./event-signup-link";

const secret = "test-event-signup-link-secret-0000000000";
const eventId = "019f0000-0019-7000-8000-000000001983";
const otherEventId = "019f0000-0019-7000-8000-000000001982";

describe("event sign-up links", () => {
  it("verifies a link signed for the same event", () => {
    const sig = signEventSignupLink(secret, eventId);
    expect(verifyEventSignupLink(secret, eventId, sig)).toBe(true);
    expect(verifyEventSignupLink(secret, eventId.toUpperCase(), sig)).toBe(
      true
    );
  });

  it("rejects a bare, foreign or forged signature", () => {
    const sig = signEventSignupLink(secret, eventId);
    expect(verifyEventSignupLink(secret, otherEventId, sig)).toBe(false);
    expect(verifyEventSignupLink(secret, eventId, "")).toBe(false);
    expect(verifyEventSignupLink(secret, eventId, "0".repeat(64))).toBe(false);
    expect(verifyEventSignupLink(`${secret}-rotated`, eventId, sig)).toBe(
      false
    );
  });

  it("fails closed without a secret", () => {
    const sig = signEventSignupLink(secret, eventId);
    expect(verifyEventSignupLink(undefined, eventId, sig)).toBe(false);
  });
});
