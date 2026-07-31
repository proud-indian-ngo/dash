// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/private-media-db", () => ({
  defaultPrivateMediaAccessDeps: {},
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));

import { PrivateMediaAccessError } from "@/lib/private-media-access";
import {
  type AvatarMediaHandlerDeps,
  handleAvatarMediaRequest,
} from "./avatar.$userId";

const USER_ID = "user-1";
const KEY = "app/avatars/user-1/avatar.jpg";

const deps = (
  overrides: Partial<AvatarMediaHandlerDeps> = {}
): AvatarMediaHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 300,
    remaining: 299,
    resetAt: Date.now() + 60_000,
  }),
  getS3: () => ({ presign: () => "https://r2.example.test/avatar" }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  requireSession: async () => ({
    error: Response.json({ error: "Unauthorized" }, { status: 401 }),
  }),
  resolveAvatarMedia: async () => ({ key: KEY }),
  ...overrides,
});

describe("handleAvatarMediaRequest", () => {
  it("requires authentication before resolving the avatar", async () => {
    const resolveAvatarMedia = vi.fn();
    const response = await handleAvatarMediaRequest(
      new Request(
        `https://example.test/api/media/avatar/${USER_ID}?key=${encodeURIComponent(KEY)}`
      ),
      USER_ID,
      deps({ resolveAvatarMedia })
    );

    expect(response.status).toBe(401);
    expect(resolveAvatarMedia).not.toHaveBeenCalled();
  });

  it("rejects a missing key", async () => {
    const response = await handleAvatarMediaRequest(
      new Request(`https://example.test/api/media/avatar/${USER_ID}`),
      USER_ID,
      deps({
        requireSession: async () => ({ session: { user: { id: "viewer" } } }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("maps a missing stored avatar to 404", async () => {
    const response = await handleAvatarMediaRequest(
      new Request(
        `https://example.test/api/media/avatar/${USER_ID}?key=${encodeURIComponent(KEY)}`
      ),
      USER_ID,
      deps({
        requireSession: async () => ({ session: { user: { id: "viewer" } } }),
        resolveAvatarMedia: () =>
          Promise.reject(new PrivateMediaAccessError(404, "Media not found")),
      })
    );

    expect(response.status).toBe(404);
  });

  it("redirects an authenticated viewer to a two-minute signed URL", async () => {
    const presign = vi.fn(() => "https://r2.example.test/avatar");
    const response = await handleAvatarMediaRequest(
      new Request(
        `https://example.test/api/media/avatar/${USER_ID}?key=${encodeURIComponent(KEY)}`
      ),
      USER_ID,
      deps({
        getS3: () => ({ presign }),
        requireSession: async () => ({ session: { user: { id: "viewer" } } }),
      })
    );

    expect(presign).toHaveBeenCalledWith(KEY, {
      expiresIn: 120,
      method: "GET",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://r2.example.test/avatar"
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store"
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
