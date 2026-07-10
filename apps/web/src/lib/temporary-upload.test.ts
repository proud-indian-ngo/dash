import { describe, expect, it } from "vitest";
import {
  assertOwnedTemporaryUploadKey,
  buildTemporaryUploadKey,
  createTemporaryUpload,
  deleteOwnedTemporaryUpload,
} from "./temporary-upload";

describe("temporary upload keys", () => {
  it("builds user-owned keys without accepting a caller parent path", () => {
    expect(
      buildTemporaryUploadKey({
        fileName: " Travel Receipt.pdf ",
        keyPrefix: "app",
        subfolder: "attachments",
        uploadId: "upload-id",
        userId: "user-1",
      })
    ).toBe("app/attachments/tmp/user-1/upload-id-Travel-Receipt.pdf");
  });

  it("accepts only exact protected temp folders owned by the user", () => {
    expect(
      assertOwnedTemporaryUploadKey(
        "app/photos/tmp/user-1/upload-id-photo.jpg",
        { keyPrefix: "app", userId: "user-1" }
      )
    ).toBe("app/photos/tmp/user-1/upload-id-photo.jpg");

    for (const key of [
      "app/photos/event-1/photo.jpg",
      "app/photos/tmp/other-user/photo.jpg",
      "app/updates/tmp/user-1/editor.jpg",
      "other/photos/tmp/user-1/photo.jpg",
    ]) {
      expect(() =>
        assertOwnedTemporaryUploadKey(key, {
          keyPrefix: "app",
          userId: "user-1",
        })
      ).toThrow("Forbidden");
    }
  });
});

describe("temporary upload service", () => {
  it("authorizes before presigning a user-owned key", async () => {
    const calls: string[] = [];
    const result = await createTemporaryUpload(
      {
        fileName: "receipt.pdf",
        keyPrefix: "app",
        mimeType: "application/pdf",
        scope: { kind: "request" },
        subfolder: "attachments",
        uploadId: "upload-id",
        user: { id: "user-1", role: "volunteer" },
      },
      {
        authorize: (_user, scope) => {
          calls.push(`authorize:${scope.kind}`);
          return Promise.resolve();
        },
        presign: (key) => {
          calls.push(`presign:${key}`);
          return "https://upload.example.test";
        },
      }
    );

    expect(calls).toEqual([
      "authorize:request",
      "presign:app/attachments/tmp/user-1/upload-id-receipt.pdf",
    ]);
    expect(result).toEqual({
      key: "app/attachments/tmp/user-1/upload-id-receipt.pdf",
      presignedUrl: "https://upload.example.test",
    });
  });

  it("does not presign when authorization fails", async () => {
    let presigned = false;
    await expect(
      createTemporaryUpload(
        {
          fileName: "photo.jpg",
          keyPrefix: "app",
          mimeType: "image/jpeg",
          scope: { eventId: "event-1", kind: "eventPhoto" },
          subfolder: "photos",
          user: { id: "user-1" },
        },
        {
          authorize: () => Promise.reject(new Error("Forbidden")),
          presign: () => {
            presigned = true;
            return "unused";
          },
        }
      )
    ).rejects.toThrow("Forbidden");
    expect(presigned).toBe(false);
  });

  it("deletes only an exact temp key owned by the current user", async () => {
    const deleted: string[] = [];
    await deleteOwnedTemporaryUpload(
      "app/scheduled-messages/tmp/user-1/upload-id-video.mp4",
      { keyPrefix: "app", userId: "user-1" },
      (key) => {
        deleted.push(key);
        return Promise.resolve();
      }
    );
    expect(deleted).toEqual([
      "app/scheduled-messages/tmp/user-1/upload-id-video.mp4",
    ]);

    await expect(
      deleteOwnedTemporaryUpload(
        "app/scheduled-messages/message-1/video.mp4",
        { keyPrefix: "app", userId: "user-1" },
        async () => undefined
      )
    ).rejects.toThrow("Forbidden");
  });
});
