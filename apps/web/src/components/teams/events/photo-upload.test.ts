import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("evlog", () => ({ log: { error: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { uploadSinglePhoto } from "./photo-upload";

describe("uploadSinglePhoto", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when the authoritative R2 claim fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const mutationError = new Error("claim failed");
    const mutate = vi.fn(() => ({
      server: Promise.resolve({ error: mutationError, type: "error" }),
    }));

    await expect(
      uploadSinglePhoto({
        callImmichUpload: vi.fn(),
        eventId: "event-1",
        file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
        getUploadUrl: vi.fn().mockResolvedValue({
          key: "app/photos/tmp/user-1/upload-photo.jpg",
          presignedUrl: "https://r2.example.test/upload",
        }),
        useImmichDirect: false,
        zero: { mutate } as never,
      })
    ).rejects.toThrow("claim failed");
  });
});
