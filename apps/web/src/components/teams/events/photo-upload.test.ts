import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("evlog", () => ({ log: { error: mock() } }));
mock.module("sonner", () => ({ toast: { error: mock(), success: mock() } }));

import { uploadSinglePhoto } from "./photo-upload";

describe("uploadSinglePhoto", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("rejects when the authoritative R2 claim fails", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const mutationError = new Error("claim failed");
    const mutate = mock(() => ({
      server: Promise.resolve({ error: mutationError, type: "error" }),
    }));

    await expect(
      uploadSinglePhoto({
        callImmichUpload: mock(),
        eventId: "event-1",
        file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
        getUploadUrl: mock().mockResolvedValue({
          key: "app/photos/tmp/user-1/upload-photo.jpg",
          presignedUrl: "https://r2.example.test/upload",
        }),
        useImmichDirect: false,
        zero: { mutate } as never,
      })
    ).rejects.toThrow("claim failed");
  });
});
