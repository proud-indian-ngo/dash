// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/public-events", () => ({
  getPublicCostCentres: mock(),
  getPublicEvents: mock(),
}));

import type { PublicEvent } from "@pi-dash/shared/public-events";

import {
  clientIp,
  createCostCentresCache,
  createPublicEventsCache,
  handlePublicEventsPreflight,
  handlePublicEventsRequest,
  type PublicEventsHandlerDeps,
} from "./events";

const NOW = Date.UTC(2026, 9, 8);
const URL_BASE = "https://dash.proudindian.ngo/api/public/events";

const sampleEvent: PublicEvent = {
  area: "Iblur, Bangalore",
  city: "BLR",
  cityName: "Bangalore",
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
  const getPublicCostCentres = mock(async () => [
    { code: "BLR", name: "Bangalore" },
    { code: "DEL", name: "Delhi" },
  ]);
  const deps: PublicEventsHandlerDeps = {
    baseUrl: "https://dash.proudindian.ngo",
    cache: createPublicEventsCache(),
    centresCache: createCostCentresCache(),
    checkRateLimit,
    getPublicCostCentres,
    getPublicEvents,
    now: () => NOW,
    ...overrides,
  };
  return { checkRateLimit, deps, getPublicCostCentres, getPublicEvents };
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
    // Without a city: every active cost centre.
    expect(getPublicEvents).toHaveBeenCalledWith(
      {
        cities: ["BLR", "DEL"],
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
  });

  it.each([
    "https://proudindian.ngo",
    "https://abc123.proud-indian-website.pages.dev",
    "https://example.com",
    null,
  ])("allows CORS from any origin (%s)", async (origin) => {
    const { deps } = createDeps();

    const response = await handlePublicEventsRequest(
      request("", origin ? { origin } : {}),
      deps
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("lists one cost centre by its code, in any case, or the deprecated alias", async () => {
    for (const city of ["BLR", "blr", "bangalore", "bengaluru"]) {
      const { deps, getPublicEvents } = createDeps();
      const response = await handlePublicEventsRequest(
        request(`?city=${city}`),
        deps
      );
      expect(response.status).toBe(200);
      expect(getPublicEvents).toHaveBeenCalledWith(
        expect.objectContaining({ cities: ["BLR"] }),
        "https://dash.proudindian.ngo"
      );
    }
  });

  it("refuses an unknown or inactive code with the active codes", async () => {
    for (const city of ["MUM", "mumbai", "delhi"]) {
      const { deps } = createDeps();
      const response = await handlePublicEventsRequest(
        request(`?city=${city}`),
        deps
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "city must be one of BLR, DEL",
      });
    }
  });

  it("rejects bad query params with 400 and no caching", async () => {
    const { deps, getPublicEvents } = createDeps();

    const response = await handlePublicEventsRequest(
      request("?city=pune", { origin: "https://proudindian.ngo" }),
      deps
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
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
      request("", { "x-forwarded-for": "203.0.113.7" }),
      deps
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(deps.checkRateLimit).toHaveBeenCalledWith(
      "public-events:203.0.113.7",
      60
    );
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it("serves repeat requests from the in-process cache", async () => {
    let now = NOW;
    const { deps, getPublicCostCentres, getPublicEvents } = createDeps({
      now: () => now,
    });

    await handlePublicEventsRequest(request(), deps);
    now += 30_000;
    const cached = await handlePublicEventsRequest(request(), deps);
    await handlePublicEventsRequest(request("?city=del"), deps);
    now += 31_000;
    await handlePublicEventsRequest(request(), deps);

    expect(getPublicEvents).toHaveBeenCalledTimes(3);
    // The active cost centres are cached for as long.
    expect(getPublicCostCentres).toHaveBeenCalledTimes(2);
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

  it("keeps serving on the last codes when the cost centres can't be read", async () => {
    let now = NOW;
    let failing = false;
    const { deps, getPublicEvents } = createDeps({
      getPublicCostCentres: mock(async () => {
        if (failing) {
          throw new Error("db down");
        }
        return [{ code: "BLR", name: "Bangalore" }];
      }),
      now: () => now,
    });
    await handlePublicEventsRequest(request(), deps);
    failing = true;
    now += 61_000;
    const response = await handlePublicEventsRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(getPublicEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ cities: ["BLR"] }),
      "https://dash.proudindian.ngo"
    );
  });

  it("hides an error reading the cost centres", async () => {
    const { deps, getPublicEvents } = createDeps({
      getPublicCostCentres: mock(async () => {
        throw new Error("connection refused at 10.0.0.5");
      }),
    });

    const response = await handlePublicEventsRequest(request(), deps);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.5");
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
  it("allows GET and OPTIONS from any origin", () => {
    const response = handlePublicEventsPreflight();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS"
    );
  });
});

describe("clientIp", () => {
  it("ignores Cloudflare headers and uses Traefik's right-most hop", () => {
    expect(
      clientIp(
        request("", {
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "1.1.1.1",
        })
      )
    ).toBe("1.1.1.1");
    expect(
      clientIp(request("", { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))
    ).toBe("203.0.113.9");
    expect(clientIp(request("", { "cf-connecting-ip": "203.0.113.7" }))).toBe(
      "unknown"
    );
    expect(clientIp(request("", { "x-forwarded-for": "6.6.6.6, " }))).toBe(
      "unknown"
    );
    expect(clientIp(request("", { "x-forwarded-for": " 2001:db8::7 " }))).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0000"
    );
    expect(clientIp(request())).toBe("unknown");
  });
});
