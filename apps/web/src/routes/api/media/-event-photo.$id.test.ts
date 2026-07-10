// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));
vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import { R2ObjectAccessError } from "@/lib/r2-object-access";
import {
  type EventPhotoHandlerDeps,
  handleEventPhotoRequest,
} from "./event-photo.$id";

const PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";

const handlerDeps = (
  overrides: Partial<EventPhotoHandlerDeps> = {}
): EventPhotoHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 300,
    remaining: 299,
    resetAt: Date.now() + 60_000,
  }),
  getS3: () => ({
    presign: () => "https://r2.example.test/signed-event-photo",
  }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  requireSession: async () => ({
    error: Response.json({ error: "Unauthorized" }, { status: 401 }),
  }),
  resolveAuthorizedR2Object: async () => ({
    filename: "photo.jpg",
    key: "legacy/events/photo.jpg",
  }),
  ...overrides,
});

describe("handleEventPhotoRequest", () => {
  it("returns 401 before resolving the photo", async () => {
    const response = await handleEventPhotoRequest(
      new Request(`https://example.test/api/media/event-photo/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps()
    );

    expect(response.status).toBe(401);
  });

  it("returns the resolver authorization error", async () => {
    const response = await handleEventPhotoRequest(
      new Request(`https://example.test/api/media/event-photo/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        requireSession: async () => ({ session: { user: { id: "other" } } }),
        resolveAuthorizedR2Object: () =>
          Promise.reject(new R2ObjectAccessError(403, "Forbidden")),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("rejects malformed database IDs before resolving the photo", async () => {
    const resolveAuthorizedR2Object = vi.fn();
    const response = await handleEventPhotoRequest(
      new Request("https://example.test/api/media/event-photo/not-a-uuid"),
      "not-a-uuid",
      handlerDeps({
        requireSession: async () => ({ session: { user: { id: "member" } } }),
        resolveAuthorizedR2Object,
      })
    );

    expect(response.status).toBe(400);
    expect(resolveAuthorizedR2Object).not.toHaveBeenCalled();
  });

  it("returns 429 when one photo exceeds its per-photo limit", async () => {
    const checkRateLimit = vi
      .fn()
      .mockReturnValueOnce({
        allowed: true,
        limit: 3000,
        remaining: 2999,
        resetAt: Date.now() + 60_000,
      })
      .mockReturnValueOnce({
        allowed: false,
        limit: 30,
        remaining: 0,
        resetAt: Date.now() + 60_000,
      });
    const resolveAuthorizedR2Object = vi.fn();

    const response = await handleEventPhotoRequest(
      new Request(`https://example.test/api/media/event-photo/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        checkRateLimit,
        requireSession: async () => ({ session: { user: { id: "member" } } }),
        resolveAuthorizedR2Object,
      })
    );

    expect(response.status).toBe(429);
    expect(resolveAuthorizedR2Object).not.toHaveBeenCalled();
  });

  it("redirects authorized viewers to a two-minute signed URL", async () => {
    const checkRateLimit = vi.fn(() => ({
      allowed: true,
      limit: 3000,
      remaining: 2999,
      resetAt: Date.now() + 60_000,
    }));
    const presign = vi.fn(() => "https://r2.example.test/signed-event-photo");
    const response = await handleEventPhotoRequest(
      new Request(`https://example.test/api/media/event-photo/${PHOTO_ID}`),
      PHOTO_ID,
      handlerDeps({
        checkRateLimit,
        getS3: () => ({ presign }),
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
    expect(presign).toHaveBeenCalledWith("legacy/events/photo.jpg", {
      expiresIn: 120,
      method: "GET",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://r2.example.test/signed-event-photo"
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store"
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
