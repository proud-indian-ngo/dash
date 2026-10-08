import { describe, expect, it } from "bun:test";

import {
  isPublicBetterAuthAdminPath,
  registerLinkEventRedirect,
} from "./auth-route-policy";

describe("Better Auth route policy", () => {
  it("blocks direct public admin endpoints", () => {
    expect(
      isPublicBetterAuthAdminPath(
        "https://dashboard.test/api/auth/admin/set-role"
      )
    ).toBe(true);
  });

  it("allows normal authentication endpoints", () => {
    expect(
      isPublicBetterAuthAdminPath(
        "https://dashboard.test/api/auth/sign-in/email"
      )
    ).toBe(false);
  });
});

describe("registerLinkEventRedirect", () => {
  const eventId = "019a0000-0000-7000-8000-000000000001";

  it("marks website links to file an interest", () => {
    expect(registerLinkEventRedirect({ interestEventId: eventId })).toEqual({
      eventId,
      interest: true,
    });
  });

  it("keeps the session of a recurring series", () => {
    expect(
      registerLinkEventRedirect({
        interestEventId: eventId,
        occDate: "2026-10-18",
      })
    ).toEqual({ eventId, interest: true, occDate: "2026-10-18" });
  });

  it("leaves invite links to their own flow", () => {
    expect(registerLinkEventRedirect({ eventId })).toBeNull();
  });

  it("ignores malformed ids and dates", () => {
    expect(
      registerLinkEventRedirect({ interestEventId: "../admin" })
    ).toBeNull();
    expect(registerLinkEventRedirect({})).toBeNull();
    expect(
      registerLinkEventRedirect({
        interestEventId: eventId,
        occDate: "2026-10-18&x=1",
      })
    ).toEqual({ eventId, interest: true });
  });
});
