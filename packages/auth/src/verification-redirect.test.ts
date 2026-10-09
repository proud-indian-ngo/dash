import { EVENT_REDIRECT_HEADER } from "@pi-dash/shared/event-redirect";
import { describe, expect, it } from "vitest";

import { getVerificationEventRedirect } from "./verification-redirect";

const EVENT_ID = "019a0000-0000-7000-8000-000000000001";
const verifyUrl = (callbackURL: string) =>
  `https://dash.proudindian.ngo/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(callbackURL)}`;

describe("getVerificationEventRedirect", () => {
  it("keeps the interest marker", () => {
    expect(
      getVerificationEventRedirect(
        verifyUrl(`/events/${EVENT_ID}?occDate=2026-10-18&interest=1`)
      )
    ).toBe(`/events/${EVENT_ID}?occDate=2026-10-18&interest=1`);
  });

  it("keeps event page callbacks, including the occurrence date", () => {
    expect(getVerificationEventRedirect(verifyUrl(`/events/${EVENT_ID}`))).toBe(
      `/events/${EVENT_ID}`
    );
    expect(
      getVerificationEventRedirect(
        verifyUrl(`/events/${EVENT_ID}?occDate=2026-10-18`)
      )
    ).toBe(`/events/${EVENT_ID}?occDate=2026-10-18`);
  });

  it.each([
    "/",
    "https://evil.example/events/x",
    "//evil.example",
    `/events/${EVENT_ID}?next=https://evil.example`,
  ])("drops %s", (callbackURL) => {
    expect(
      getVerificationEventRedirect(verifyUrl(callbackURL))
    ).toBeUndefined();
  });

  it("tolerates malformed URLs", () => {
    expect(getVerificationEventRedirect("not a url")).toBeUndefined();
  });

  it("falls back to the login form's header on sign-in re-sends", () => {
    const request = new Request(
      "https://dash.proudindian.ngo/api/auth/sign-in/email",
      {
        headers: {
          [EVENT_REDIRECT_HEADER]: `/events/${EVENT_ID}?occDate=2026-10-18&interest=1`,
        },
      }
    );
    expect(getVerificationEventRedirect(verifyUrl("/"), request)).toBe(
      `/events/${EVENT_ID}?occDate=2026-10-18&interest=1`
    );
  });

  it("prefers the sign-up callbackURL over the header", () => {
    const request = new Request("https://dash.proudindian.ngo/", {
      headers: { [EVENT_REDIRECT_HEADER]: `/events/${EVENT_ID}` },
    });
    expect(
      getVerificationEventRedirect(
        verifyUrl(`/events/${EVENT_ID}?interest=1`),
        request
      )
    ).toBe(`/events/${EVENT_ID}?interest=1`);
  });

  it("drops a forged header", () => {
    const request = new Request("https://dash.proudindian.ngo/", {
      headers: { [EVENT_REDIRECT_HEADER]: "https://evil.example/events/x" },
    });
    expect(
      getVerificationEventRedirect(verifyUrl("/"), request)
    ).toBeUndefined();
    expect(getVerificationEventRedirect(verifyUrl("/"), null)).toBeUndefined();
  });
});
