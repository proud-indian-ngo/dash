// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/private-media-db", () => ({
  defaultPrivateMediaAccessDeps: {},
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));

import { PrivateMediaAccessError } from "@/lib/private-media-access";
import {
  type EventUpdateMediaHandlerDeps,
  handleEventUpdateMediaRequest,
} from "./event-update";

const EVENT_ID = "e2e00000-0000-0000-0000-000000000101";
const KEY = `app/updates/${EVENT_ID}/photo.jpg`;

const deps = (
  overrides: Partial<EventUpdateMediaHandlerDeps> = {}
): EventUpdateMediaHandlerDeps => ({
  checkRateLimit: () => ({
    allowed: true,
    limit: 300,
    remaining: 299,
    resetAt: Date.now() + 60_000,
  }),
  getS3: () => ({ presign: () => "https://r2.example.test/event-image" }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  requireSession: async () => ({
    error: Response.json({ error: "Unauthorized" }, { status: 401 }),
  }),
  resolveEventUpdateMedia: async () => ({ key: KEY }),
  ...overrides,
});

const request = (eventId = EVENT_ID, key = KEY) =>
  new Request(
    `https://example.test/api/media/event-update?eventId=${encodeURIComponent(eventId)}&key=${encodeURIComponent(key)}`
  );

describe("handleEventUpdateMediaRequest", () => {
  it("requires authentication before resolving media", async () => {
    const resolveEventUpdateMedia = vi.fn();
    const response = await handleEventUpdateMediaRequest(
      request(),
      deps({ resolveEventUpdateMedia })
    );

    expect(response.status).toBe(401);
    expect(resolveEventUpdateMedia).not.toHaveBeenCalled();
  });

  it("rejects a malformed event ID", async () => {
    const response = await handleEventUpdateMediaRequest(
      request("not-an-id"),
      deps({
        requireSession: async () => ({ session: { user: { id: "viewer" } } }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("maps access denial to 403", async () => {
    const response = await handleEventUpdateMediaRequest(
      request(),
      deps({
        requireSession: async () => ({ session: { user: { id: "viewer" } } }),
        resolveEventUpdateMedia: () =>
          Promise.reject(new PrivateMediaAccessError(403, "Forbidden")),
      })
    );

    expect(response.status).toBe(403);
  });

  it("redirects an authorized viewer to a two-minute signed URL", async () => {
    const presign = vi.fn(() => "https://r2.example.test/event-image");
    const response = await handleEventUpdateMediaRequest(
      request(),
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
      "https://r2.example.test/event-image"
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store"
    );
  });
});
