import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: mock(), error: mock(), set: mock() }),
  log: { error: mock() },
}));
mock.module("sonner", () => ({ toast: { error: mock(), success: mock() } }));
const eventPhotoUpload = mock((args: unknown) => args);
mock.module("@pi-dash/zero/mutators", () => ({
  mutators: { eventPhoto: { upload: eventPhotoUpload } },
}));

import { uploadSinglePhoto } from "./photo-upload";

describe("uploadSinglePhoto", () => {
  beforeEach(() => {
    mock.restore();
    eventPhotoUpload.mockClear();
  });

  it("binds the direct upload receipt to the generated photo ID", async () => {
    let uploadedFormData: FormData | undefined;
    const callImmichUpload = mock(async ({ data }: { data: FormData }) => {
      uploadedFormData = data;
      return {
        immichAssetId: "asset-1",
        immichUploadReceipt: "signed-receipt",
      };
    });
    const mutate = mock(() => ({
      server: Promise.resolve({ type: "completed" }),
    }));
    const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });

    await uploadSinglePhoto({
      callImmichUpload: callImmichUpload as never,
      eventId: "event-1",
      file,
      getUploadUrl: mock(),
      useImmichDirect: true,
      zero: { mutate } as never,
    });

    const mutationArgs = eventPhotoUpload.mock.calls[0]?.[0] as {
      id: string;
      immichUploadReceipt: string;
    };
    expect(uploadedFormData?.get("photoId")).toBe(mutationArgs.id);
    expect(mutationArgs.immichUploadReceipt).toBe("signed-receipt");
    expect(uploadedFormData?.get("eventId")).toBe("event-1");
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
