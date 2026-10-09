import { describe, expect, it } from "vitest";

import {
  eventPagePath,
  formatEventRedirect,
  parseEventRedirect,
} from "./event-redirect";

const ID = "019a0000-0000-7000-8000-000000000001";

describe("event redirects", () => {
  it("round-trips the event, occurrence and interest marker", () => {
    const redirect = { eventId: ID, interest: true, occDate: "2026-10-18" };
    const path = formatEventRedirect(redirect);
    expect(path).toBe(`/events/${ID}?occDate=2026-10-18&interest=1`);
    expect(parseEventRedirect(path)).toEqual(redirect);
    expect(eventPagePath(redirect)).toBe(`/events/${ID}?occDate=2026-10-18`);
  });

  it("accepts a bare event page", () => {
    expect(parseEventRedirect(`/events/${ID}`)).toEqual({
      eventId: ID,
      interest: false,
    });
  });

  it.each([
    undefined,
    "/",
    "//evil.example/events/x",
    "https://evil.example/events/x",
    "/events/not-a-uuid",
    `/events/${ID}/edit`,
    `/events/${ID}?next=https://evil.example`,
    `/events/${ID}?occDate=2026-10-18&x=1`,
    `/events/${ID}?occDate=tomorrow`,
    `/events/${ID}?interest=yes`,
    `/events/${ID}#frag`,
    `/events/${ID}?a?b`,
  ])("rejects %s", (path) => {
    expect(parseEventRedirect(path)).toBeNull();
  });
});
