import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();
const { runtimeEnv } = hoisted(() => ({
  runtimeEnv: { NODE_ENV: "test" as "development" | "production" | "test" },
}));

mock.module("@pi-dash/env/server", () => ({ env: runtimeEnv }));

import { checkRateLimit, rateLimitResponse } from "./rate-limit";

const originalE2EMarker = process.env.VITE_E2E;
let nextKey = 0;
const key = () => `rate-limit-test:${nextKey++}`;

afterEach(() => {
  runtimeEnv.NODE_ENV = "test";
  if (originalE2EMarker === undefined) {
    delete process.env.VITE_E2E;
  } else {
    process.env.VITE_E2E = originalE2EMarker;
  }
});

describe("checkRateLimit", () => {
  it("keeps the passed limit in production, development, and ordinary tests", () => {
    for (const nodeEnv of ["production", "development", "test"] as const) {
      runtimeEnv.NODE_ENV = nodeEnv;
      if (nodeEnv === "test") {
        delete process.env.VITE_E2E;
      } else {
        process.env.VITE_E2E = "true";
      }

      const requestKey = key();
      const first = checkRateLimit(requestKey, 2);
      const second = checkRateLimit(requestKey, 2);
      const third = checkRateLimit(requestKey, 2);

      expect(first).toMatchObject({ allowed: true, limit: 2, remaining: 1 });
      expect(second).toMatchObject({ allowed: true, limit: 2, remaining: 0 });
      expect(third).toMatchObject({ allowed: false, limit: 2, remaining: 0 });
      expect(second.resetAt).toBe(first.resetAt);
      expect(third.resetAt).toBe(first.resetAt);
    }
  });

  it("raises only marked E2E budgets and refuses the first request over them", () => {
    runtimeEnv.NODE_ENV = "test";
    process.env.VITE_E2E = "true";
    const requestKey = key();

    for (let request = 1; request <= 200; request++) {
      expect(checkRateLimit(requestKey, 2)).toMatchObject({
        allowed: true,
        limit: 200,
        remaining: 200 - request,
      });
    }
    expect(checkRateLimit(requestKey, 2)).toMatchObject({
      allowed: false,
      limit: 200,
      remaining: 0,
    });
  });

  it("resets expired windows and keeps keys independent", () => {
    runtimeEnv.NODE_ENV = "test";
    process.env.VITE_E2E = "true";
    const now = spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const firstKey = key();
      const secondKey = key();
      const first = checkRateLimit(firstKey, 1, 100);
      expect(first).toMatchObject({
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAt: 1_100,
      });
      expect(checkRateLimit(firstKey, 1, 100).remaining).toBe(98);
      expect(checkRateLimit(secondKey, 1, 100)).toMatchObject({
        allowed: true,
        limit: 100,
        remaining: 99,
      });

      now.mockReturnValue(1_100);
      expect(checkRateLimit(firstKey, 1, 100)).toMatchObject({
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAt: 1_200,
      });
    } finally {
      now.mockRestore();
    }
  });
});

describe("rateLimitResponse", () => {
  it("returns HTTP 429 with a coherent retry delay and effective budget", async () => {
    runtimeEnv.NODE_ENV = "test";
    process.env.VITE_E2E = "true";
    const now = spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const requestKey = key();
      for (let request = 0; request <= 100; request++) {
        const result = checkRateLimit(requestKey, 1, 1_500);
        if (request === 100) {
          const response = rateLimitResponse(result);
          expect(result.allowed).toBe(false);
          expect(response.status).toBe(429);
          expect(response.headers.get("Retry-After")).toBe("2");
          expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
          expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
          expect(response.headers.get("X-RateLimit-Reset")).toBe("3");
          expect(await response.json()).toEqual({ error: "Too many requests" });
        }
      }
    } finally {
      now.mockRestore();
    }
  });
});
