import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/jobs/lib/protected-r2-reference", () => ({
  withProtectedR2ObjectDeleteLock: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  runSessionAuditedAction: vi.fn(),
}));
vi.mock("@/lib/private-media-db", () => ({
  defaultPrivateMediaAccessDeps: {},
}));
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));
vi.mock("@/middleware/auth", () => ({ authMiddleware: {} }));

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
    const authorize = vi.fn(async () => undefined);
    const presign = vi.fn(() => "https://r2.example.test/presigned");

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
    const getS3 = vi.fn(async () => ({ presign: vi.fn() }));

    await expect(
      createEventEditorUpload(data, session, {
        authorize: vi.fn(() => Promise.reject(new Error("Forbidden"))),
        createId: () => "upload-id",
        getS3,
        keyPrefix: "app",
      })
    ).rejects.toThrow("Forbidden");
    expect(getS3).not.toHaveBeenCalled();
  });
});
