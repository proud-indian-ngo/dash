// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/api-auth", () => ({ requireSession: mock() }));
mock.module("@/lib/immich", () => ({
  fetchImmichOriginal: mock(),
  getImmichConfig: mock(),
}));
mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import {
  handleImmichOriginalRequest,
  type ImmichOriginalHandlerDeps,
} from "./original.$id";

const PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const IMMICH_ASSET_ID = "11111111-2222-3333-4444-555555555555";

const handlerDeps = (
  overrides: Partial<ImmichOriginalHandlerDeps> = {}
): ImmichOriginalHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 3000,
    remaining: 2999,
    resetAt: Date.now() + 60_000,
  }),
  fetchImmichOriginal: async () => new Response("original"),
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

describe("handleImmichOriginalRequest", () => {
  it("returns 404 when the authorized photo has no Immich asset", async () => {
    const fetchImmichOriginal = mock();
    const response = await handleImmichOriginalRequest(
      new Request(`https://example.test/api/immich/original/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        fetchImmichOriginal,
        requireSession: async () => ({ session: { user: { id: "member" } } }),
        resolveAuthorizedEventPhoto: async () => ({
          immichAssetId: null,
          r2Key: "events/photo.jpg",
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(fetchImmichOriginal).not.toHaveBeenCalled();
  });

  it("forwards ranges to the stored Immich asset with private headers", async () => {
    const fetchImmichOriginal = mock(
      async () =>
        new Response("partial", {
          headers: {
            "Content-Length": "7",
            "Content-Range": "bytes 0-6/20",
            "Content-Type": "video/mp4",
          },
          status: 206,
        })
    );
    const response = await handleImmichOriginalRequest(
      new Request(`https://example.test/api/immich/original/${PHOTO_ID}`, {
        headers: { Range: "bytes=0-6" },
      }),
      PHOTO_ID,
      handlerDeps({
        fetchImmichOriginal,
        requireSession: async () => ({ session: { user: { id: "member" } } }),
      })
    );

    expect(fetchImmichOriginal).toHaveBeenCalledWith(
      { key: "secret", url: "https://immich.test" },
      IMMICH_ASSET_ID,
      "bytes=0-6"
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-6/20");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store"
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
