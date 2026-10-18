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
const gravatarUrl = `https://0.gravatar.com/avatar/${"a".repeat(64)}`;

const deps = (
  overrides: Partial<AvatarHandlerDeps> = {}
): AvatarHandlerDeps => ({
  fetchImage: async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "Content-Type": "image/png" },
    }),
  findUser: async () => avatarUser,
  requireSession: async () => ({ session: { user: { id: "viewer-1" } } }),
  resolveAvatarUrl: async () => gravatarUrl,
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

  it("serves image bytes without exposing Gravatar hashes or upstream headers", async () => {
    const findUser = mock(async () => avatarUser);
    const resolveAvatarUrl = mock(async () => gravatarUrl);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchImage = mock(
      async () =>
        new Response(bytes, {
          headers: {
            "Content-Type": "image/png",
            "Content-Location": gravatarUrl,
            Location: gravatarUrl,
            "Set-Cookie": "upstream=private",
          },
        })
    );
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({ findUser, resolveAvatarUrl, fetchImage })
    );

    expect(findUser).toHaveBeenCalledWith("user-1");
    expect(resolveAvatarUrl).toHaveBeenCalledWith(avatarUser);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetchImage).toHaveBeenCalledWith(new URL(gravatarUrl), {
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("proxies the DiceBear fallback without exposing its gender parameters", async () => {
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({
        resolveAvatarUrl: async () =>
          "https://api.dicebear.com/9.x/notionists/png?seed=private&beardProbability=0",
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "http://0.gravatar.com/avatar/hash",
    "https://gravatar.com.evil.test/avatar/hash",
    "https://127.0.0.1/avatar/hash",
    "https://api.dicebear.com/other",
    "https://0.gravatar.com:444/avatar/hash",
  ])("refuses to fetch an unsupported image URL: %s", async (url) => {
    const fetchImage = mock();
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({ fetchImage, resolveAvatarUrl: async () => url })
    );
    expect(response.status).toBe(502);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it.each([
    { status: 302, contentType: "image/png" },
    { status: 200, contentType: "text/html" },
    { status: 200, contentType: "image/svg+xml" },
    { status: 503, contentType: "image/png" },
  ])("rejects unsafe or failed upstream responses: %j", async (init) => {
    const response = await handleAvatarRequest(
      new Request("https://example.test/api/avatar?userId=user-1"),
      deps({
        fetchImage: async () =>
          new Response("upstream body", {
            status: init.status,
            headers: {
              "Content-Type": init.contentType,
              Location: "http://127.0.0.1/private",
            },
          }),
      })
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("upstream body");
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
