import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/server", () => ({
  env: { R2_KEY_PREFIX: "app" },
}));
mock.module("@pi-dash/jobs/lib/protected-r2-reference", () => ({
  withProtectedR2ObjectDeleteLock: mock(),
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: mock(),
}));
mock.module("@/lib/private-media-db", () => ({
  defaultPrivateMediaAccessDeps: {},
}));
mock.module("@/lib/s3", () => ({ getS3: mock() }));
mock.module("@/lib/server/kalakriti-entry-music", () => ({
  authorizeKalakritiEntryMusicUpload: mock(),
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));

import { createEventEditorUpload } from "./attachments";

const data = {
  eventId: "event-1",
  fileName: " agenda %.png ",
  fileSize: 1024,
  mimeType: "image/png" as const,
};
const session = { user: { id: "user-1", role: "editor" } };

describe("createEventEditorUpload", () => {
  it("authorizes before issuing an event-scoped PUT URL", async () => {
    const authorize = mock(async () => undefined);
    const presign = mock(() => "https://r2.example.test/presigned");

    const result = await createEventEditorUpload(data, session, {
      authorize,
      createId: () => "upload-id",
      getS3: async () => ({ presign }),
      keyPrefix: "app",
    });

    const key = "app/updates/event-1/upload-id-agenda-%.png";
    expect(authorize).toHaveBeenCalledWith(session, "event-1");
    expect(presign).toHaveBeenCalledWith(key, {
      expiresIn: 300,
      method: "PUT",
      type: "image/png",
    });
    expect(result).toEqual({
      key,
      presignedUrl: "https://r2.example.test/presigned",
      url: `/api/media/event-update?eventId=event-1&key=${encodeURIComponent(key)}`,
    });
  });

  it("does not presign when authorization fails", async () => {
    const getS3 = mock(async () => ({ presign: mock() }));

    await expect(
      createEventEditorUpload(data, session, {
        authorize: mock(() => Promise.reject(new Error("Forbidden"))),
        createId: () => "upload-id",
        getS3,
        keyPrefix: "app",
      })
    ).rejects.toThrow("Forbidden");
    expect(getS3).not.toHaveBeenCalled();
  });
});
