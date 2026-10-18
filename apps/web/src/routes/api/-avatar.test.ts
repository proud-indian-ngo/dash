// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({ requireSession: mock() }));
mock.module("@pi-dash/db", () => ({ db: { query: { user: {} } } }));
mock.module("@pi-dash/env/server", () => ({
  env: {
    AVATAR_FALLBACK_SEED: "fallback-seed",
    GRAVATAR_API_BASE_URL: "https://api.gravatar.com/v3",
    GRAVATAR_API_KEY: "",
    GRAVATAR_TIMEOUT_MS: 1000,
  },
}));

import { type AvatarHandlerDeps, handleAvatarRequest } from "./avatar";

const avatarUser = {
  email: "member@example.com",
  gender: "female",
};

const deps = (
  overrides: Partial<AvatarHandlerDeps> = {}
): AvatarHandlerDeps => ({
  findUser: async () => avatarUser,
  requireSession: async () => ({ session: { user: { id: "viewer-1" } } }),
  resolveAvatarUrl: async () => "https://avatar.example.test/image.png",
  ...overrides,
});

describe("handleAvatarRequest", () => {
  it("requires authentication before looking up a user", async () => {
    const findUser = mock();
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({
        findUser,
        requireSession: async () => ({
          error: Response.json({ error: "Unauthorized" }, { status: 401 }),
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
  });

  it("rejects the old private email and gender query contract", async () => {
    const findUser = mock();
    const response = await handleAvatarRequest(
      new Request(
        "https://example.test/api/avatar?email=member%40example.com&gender=female"
      ),
      deps({ findUser })
    );

    expect(response.status).toBe(400);
    expect(findUser).not.toHaveBeenCalled();
  });

  it("looks up fallback inputs by user ID without exposing them in the URL", async () => {
    const findUser = mock(async () => avatarUser);
    const resolveAvatarUrl = mock(
      async () => "https://avatar.example.test/image.png"
    );
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({ findUser, resolveAvatarUrl })
    );

    expect(findUser).toHaveBeenCalledWith("user-1");
    expect(resolveAvatarUrl).toHaveBeenCalledWith(avatarUser);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://avatar.example.test/image.png"
    );
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("returns 404 for an unknown user", async () => {
    const resolveAvatarUrl = mock();
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=missing"),
      deps({ findUser: async () => undefined, resolveAvatarUrl })
    );

    expect(response.status).toBe(404);
    expect(resolveAvatarUrl).not.toHaveBeenCalled();
  });
});
