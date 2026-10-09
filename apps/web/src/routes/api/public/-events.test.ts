// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/public-events", () => ({
  getPublicEvents: mock(),
}));

import type { PublicEvent } from "@pi-dash/shared/public-events";

import {
  clientIp,
  createPublicEventsCache,
  handlePublicEventsPreflight,
  handlePublicEventsRequest,
  isAllowedPublicOrigin,
  type PublicEventsHandlerDeps,
} from "./events";

const NOW = Date.UTC(2026, 9, 8);
const URL_BASE = "https://dash.proudindian.ngo/api/public/events";

const sampleEvent: PublicEvent = {
  area: "Iblur, Bengaluru",
  city: "bangalore",
  endTime: "2026-10-10T07:00:00.000Z",
  id: "019a0000-0000-7000-8000-000000000001",
  name: "Maths class",
  occurrenceDate: "2026-10-10",
  programme: "education",
  signUpUrl:
    "https://dash.proudindian.ngo/register?interestEventId=019a0000-0000-7000-8000-000000000001",
  startTime: "2026-10-10T04:30:00.000Z",
  summary: "Help children with maths.",
  team: "Education",
};

function createDeps(overrides: Partial<PublicEventsHandlerDeps> = {}) {
  const getPublicEvents = mock(async () => [sampleEvent]);
  const checkRateLimit = mock(() => ({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: NOW + 60_000,
  }));
  const deps: PublicEventsHandlerDeps = {
    baseUrl: "https://dash.proudindian.ngo",
    cache: createPublicEventsCache(),
    checkRateLimit,
    getPublicEvents,
    now: () => NOW,
    ...overrides,
  };
  return { checkRateLimit, deps, getPublicEvents };
}

const request = (query = "", headers: Record<string, string> = {}) =>
  new Request(`${URL_BASE}${query}`, { headers });

describe("handlePublicEventsRequest", () => {
  it("returns the events and generatedAt without a session", async () => {
    const { deps, getPublicEvents } = createDeps();

    const response = await handlePublicEventsRequest(request(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [sampleEvent],
      generatedAt: "2026-10-08T00:00:00.000Z",
    });
    expect(getPublicEvents).toHaveBeenCalledWith(
      {
        city: "bangalore",
        from: NOW,
        limit: 20,
        to: NOW + 30 * 24 * 60 * 60 * 1000,
      },
      "https://dash.proudindian.ngo"
    );
  });

  it("returns 200 with an empty list when nothing is scheduled", async () => {
    const { deps } = createDeps({ getPublicEvents: mock(async () => []) });

    const response = await handlePublicEventsRequest(request(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [],
      generatedAt: "2026-10-08T00:00:00.000Z",
    });
  });

  it("sets the public cache headers", async () => {
    const { deps } = createDeps();

    const response = await handlePublicEventsRequest(request(), deps);

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600"
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it.each([
    "https://proudindian.ngo",
    "https://abc123.proud-indian-website.pages.dev",
    "https://proud-indian-website.pages.dev",
  ])("allows CORS from %s", async (origin) => {
    const { deps } = createDeps();

    const response = await handlePublicEventsRequest(
      request("", { origin }),
      deps
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it.each([
    "https://evil.example",
    "http://proudindian.ngo",
    "https://proudindian.ngo.evil.example",
    "https://pages.dev.evil.example",
  ])("does not allow CORS from %s", async (origin) => {
    const { deps } = createDeps();

    const response = await handlePublicEventsRequest(
      request("", { origin }),
      deps
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects bad query params with 400 and no caching", async () => {
    const { deps, getPublicEvents } = createDeps();

    const response = await handlePublicEventsRequest(
      request("?city=delhi", { origin: "https://proudindian.ngo" }),
      deps
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://proudindian.ngo"
    );
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it("rate limits per client IP", async () => {
    const { deps, getPublicEvents } = createDeps({
      checkRateLimit: mock(() => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: Date.now() + 30_000,
      })),
    });

    const response = await handlePublicEventsRequest(
      request("", { "cf-connecting-ip": "203.0.113.7" }),
      deps
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deps.checkRateLimit).toHaveBeenCalledWith(
      "public-events:203.0.113.7",
      60
    );
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it("serves repeat requests from the in-process cache", async () => {
    let now = NOW;
    const { deps, getPublicEvents } = createDeps({ now: () => now });

    await handlePublicEventsRequest(request(), deps);
    now += 30_000;
    const cached = await handlePublicEventsRequest(request(), deps);
    await handlePublicEventsRequest(request("?city=mumbai"), deps);
    now += 31_000;
    await handlePublicEventsRequest(request(), deps);

    expect(getPublicEvents).toHaveBeenCalledTimes(3);
    await expect(cached.json()).resolves.toMatchObject({
      generatedAt: "2026-10-08T00:00:00.000Z",
    });
  });

  it("rejects a far-future from without querying", async () => {
    const { deps, getPublicEvents } = createDeps();

    const response = await handlePublicEventsRequest(
      request("?from=9999-01-01"),
      deps
    );

    expect(response.status).toBe(400);
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it("hides internal errors", async () => {
    const { deps } = createDeps({
      getPublicEvents: mock(async () => {
        throw new Error("connection refused at 10.0.0.5");
      }),
    });

    const response = await handlePublicEventsRequest(request(), deps);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.5");
  });
});

describe("handlePublicEventsPreflight", () => {
  it("allows GET and OPTIONS for allowed origins", () => {
    const response = handlePublicEventsPreflight(
      request("", { origin: "https://proudindian.ngo" })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://proudindian.ngo"
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS"
    );
  });

  it("grants nothing to other origins", () => {
    const response = handlePublicEventsPreflight(
      request("", { origin: "https://evil.example" })
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefers Cloudflare's header, then our proxy's right-most hop", () => {
    expect(
      clientIp(
        request("", {
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "1.1.1.1",
        })
      )
    ).toBe("203.0.113.7");
    expect(
      clientIp(request("", { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))
    ).toBe("203.0.113.9");
    expect(clientIp(request())).toBe("unknown");
  });
});

describe("isAllowedPublicOrigin", () => {
  it("rejects a missing origin", () => {
    expect(isAllowedPublicOrigin(null)).toBe(false);
  });
});
