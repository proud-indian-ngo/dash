import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api-token", () => ({
  findActiveSocialApiToken: mock(),
  touchSocialApiToken: mock(),
}));

import {
  authorizeSocialRequest,
  hashSocialToken,
  requireSocialToken,
  type SocialAuthDeps,
} from "./social-api-auth";

const RAW = "raw-token-value";
const TOKEN = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  name: "social-artifacts",
  scopes: ["events:read" as const, "social:write" as const],
};

function createDeps(token: typeof TOKEN | null = TOKEN) {
  const findToken = mock(async (_hash: string) => token);
  const touchToken = mock(async () => undefined);
  const deps: SocialAuthDeps = {
    findToken,
    now: () => new Date(0),
    touchToken,
  };
  return { deps, findToken, touchToken };
}

const request = (authorization?: string) =>
  new Request("https://dash.proudindian.ngo/api/social/v1/events", {
    headers: authorization ? { authorization } : {},
  });

describe("requireSocialToken", () => {
  it("returns 401 without a bearer token and never looks one up", async () => {
    const { deps, findToken } = createDeps();
    for (const header of [undefined, "Basic abc", "Bearer", "Bearer  "]) {
      const { error } = await requireSocialToken(
        request(header),
        "events:read",
        deps
      );
      expect(error?.status).toBe(401);
      expect(error?.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(findToken).not.toHaveBeenCalled();
  });

  it("looks the token up by its sha256 hex and returns 401 when unknown or revoked", async () => {
    const { deps, findToken } = createDeps(null);
    const { error } = await requireSocialToken(
      request(`Bearer ${RAW}`),
      "events:read",
      deps
    );
    expect(error?.status).toBe(401);
    expect(findToken).toHaveBeenCalledWith(hashSocialToken(RAW));
    expect(hashSocialToken(RAW)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns 403 when the token lacks the scope", async () => {
    const { deps, touchToken } = createDeps();
    const { error } = await requireSocialToken(
      request(`Bearer ${RAW}`),
      "photos:read",
      deps
    );
    expect(error?.status).toBe(403);
    expect(touchToken).not.toHaveBeenCalled();
  });

  it("accepts any one of several scopes and records last use", async () => {
    const { deps, touchToken } = createDeps();
    const result = await requireSocialToken(
      request(`bearer ${RAW}`),
      ["photos:read", "social:write"],
      deps
    );
    expect(result.token).toEqual(TOKEN);
    expect(touchToken).toHaveBeenCalledWith(TOKEN.id, new Date(0));
  });

  it("still authenticates when recording last use fails", async () => {
    const { deps } = createDeps();
    deps.touchToken = mock(() => Promise.reject(new Error("db down")));
    const result = await requireSocialToken(
      request(`Bearer ${RAW}`),
      "events:read",
      deps
    );
    expect(result.token?.id).toBe(TOKEN.id);
  });
});

describe("authorizeSocialRequest", () => {
  it("rate limits per token and endpoint", async () => {
    const { deps } = createDeps();
    const checkRateLimit = mock(() => ({
      allowed: false,
      limit: 600,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    }));
    const { error } = await authorizeSocialRequest(
      request(`Bearer ${RAW}`),
      "events:read",
      "events",
      { auth: deps, checkRateLimit }
    );
    expect(error?.status).toBe(429);
    expect(error?.headers.get("Cache-Control")).toBe("no-store");
    expect(checkRateLimit).toHaveBeenCalledWith(
      `social-api:events:${TOKEN.id}`,
      600
    );
  });

  it("does not count unauthenticated requests against a token", async () => {
    const { deps } = createDeps();
    const checkRateLimit = mock();
    const { error } = await authorizeSocialRequest(
      request(),
      "events:read",
      "events",
      { auth: deps, checkRateLimit }
    );
    expect(error?.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
