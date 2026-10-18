// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({ requireSession: mock() }));
mock.module("@/lib/immich", () => ({
  fetchImmichThumbnail: mock(),
  getImmichConfig: mock(),
}));
mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import { R2ObjectAccessError } from "@/lib/r2-object-access";

import {
  handleImmichThumbnailRequest,
  type ImmichThumbnailHandlerDeps,
} from "./thumbnail.$id";

const PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const IMMICH_ASSET_ID = "11111111-2222-3333-4444-555555555555";

const handlerDeps = (
  overrides: Partial<ImmichThumbnailHandlerDeps> = {}
): ImmichThumbnailHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 3000,
    remaining: 2999,
    resetAt: Date.now() + 60_000,
  }),
  fetchImmichThumbnail: async () =>
    new Response("thumbnail", { headers: { "Content-Type": "image/webp" } }),
  getImmichConfig: () => ({ key: "secret", url: "https://immich.test" }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  requireSession: async () => ({
    error: Response.json({ error: "Unauthorized" }, { status: 401 }),
  }),
  resolveAuthorizedEventPhoto: async () => ({
    immichAssetId: IMMICH_ASSET_ID,
    r2Key: null,
  }),
  ...overrides,
});

describe("handleImmichThumbnailRequest", () => {
  it("returns 401 before resolving the photo", async () => {
    const resolveAuthorizedEventPhoto = mock();
    const response = await handleImmichThumbnailRequest(
      new Request(`https://example.test/api/immich/thumbnail/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({ resolveAuthorizedEventPhoto })
    );

    expect(response.status).toBe(401);
    expect(resolveAuthorizedEventPhoto).not.toHaveBeenCalled();
  });

  it("rejects malformed photo IDs before resolving", async () => {
    const resolveAuthorizedEventPhoto = mock();
    const response = await handleImmichThumbnailRequest(
      new Request("https://example.test/api/immich/thumbnail/not-a-uuid"),
      "not-a-uuid",
      handlerDeps({
        requireSession: async () => ({ session: { user: { id: "member" } } }),
        resolveAuthorizedEventPhoto,
      })
    );

    expect(response.status).toBe(400);
    expect(resolveAuthorizedEventPhoto).not.toHaveBeenCalled();
  });

  it("returns the resolver authorization error", async () => {
    const response = await handleImmichThumbnailRequest(
      new Request(`https://example.test/api/immich/thumbnail/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        requireSession: async () => ({ session: { user: { id: "other" } } }),
        resolveAuthorizedEventPhoto: () =>
          Promise.reject(new R2ObjectAccessError(403, "Forbidden")),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("fetches the stored Immich asset with private response headers", async () => {
    const checkRateLimit = mock(() => ({
      allowed: true,
      limit: 3000,
      remaining: 2999,
      resetAt: Date.now() + 60_000,
    }));
    const fetchImmichThumbnail = mock(
      async () =>
        new Response("thumbnail", { headers: { "Content-Type": "image/webp" } })
    );
    const response = await handleImmichThumbnailRequest(
      new Request(`https://example.test/api/immich/thumbnail/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        checkRateLimit,
        fetchImmichThumbnail,
        requireSession: async () => ({ session: { user: { id: "member" } } }),
      })
    );

    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      "event-media:member",
      3000
    );
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      `event-media:member:${PHOTO_ID}`,
      30
    );
    expect(fetchImmichThumbnail).toHaveBeenCalledWith(
      { key: "secret", url: "https://immich.test" },
      IMMICH_ASSET_ID
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store"
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
