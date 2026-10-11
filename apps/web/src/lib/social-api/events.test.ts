import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  getSocialEvents: mock(),
}));

import type { SocialEvent } from "@pi-dash/shared/social-api";

import { handleSocialEventsRequest, type SocialEventsDeps } from "./events";
import { stubAuthorize } from "./test-helpers";

const URL_BASE = "https://dash.proudindian.ngo/api/social/v1/events";

const sampleEvent = { id: "e1", status: "scheduled" } as SocialEvent;

function createDeps(overrides: Partial<SocialEventsDeps> = {}) {
  const getSocialEvents = mock(async () => [sampleEvent]);
  const authorize = stubAuthorize();
  const deps: SocialEventsDeps = {
    authorize,
    baseUrl: "https://dash.proudindian.ngo",
    getSocialEvents,
    ...overrides,
  };
  return { authorize, deps, getSocialEvents };
}

const request = (query: string) => new Request(`${URL_BASE}${query}`);

describe("handleSocialEventsRequest", () => {
  it("returns the events with the timezone and requires events:read", async () => {
    const { authorize, deps, getSocialEvents } = createDeps();

    const response = await handleSocialEventsRequest(
      request("?from=2026-09-01&to=2026-10-31"),
      deps
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      events: [sampleEvent],
      timezone: "Asia/Kolkata",
    });
    expect(authorize.mock.calls[0]?.slice(1)).toEqual([
      "events:read",
      "events",
    ]);
    expect(getSocialEvents).toHaveBeenCalledWith(
      {
        from: Date.parse("2026-09-01T00:00:00+05:30"),
        to: Date.parse("2026-11-01T00:00:00+05:30") - 1,
      },
      "https://dash.proudindian.ngo"
    );
  });

  it("returns the auth error before validating the window", async () => {
    const { deps, getSocialEvents } = createDeps({
      authorize: stubAuthorize(401),
    });
    const response = await handleSocialEventsRequest(request(""), deps);
    expect(response.status).toBe(401);
    expect(getSocialEvents).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?from=2026-10-01",
    "?from=2026-10-10&to=2026-10-01",
    "?from=2026-01-01&to=2026-06-01",
    "?from=yesterday&to=2026-10-01",
  ])("returns 400 for %s", async (query) => {
    const { deps, getSocialEvents } = createDeps();
    const response = await handleSocialEventsRequest(request(query), deps);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getSocialEvents).not.toHaveBeenCalled();
  });

  it("returns 500 without details when loading fails", async () => {
    const { deps } = createDeps({
      getSocialEvents: mock(() => Promise.reject(new Error("db down"))),
    });
    const response = await handleSocialEventsRequest(
      request("?from=2026-10-01&to=2026-10-02"),
      deps
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal error" });
  });
});
