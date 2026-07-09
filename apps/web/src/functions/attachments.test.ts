import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class R2ObjectAccessError extends Error {
    readonly status: 403 | 404;

    constructor(status: 403 | 404, message: string) {
      super(message);
      this.name = "R2ObjectAccessError";
      this.status = status;
    }
  }

  return {
    assertCanDeleteTemporaryUpload: vi.fn(),
    assertCanUploadEventScopedObject: vi.fn(),
    assertCanUploadScheduledMessageObject: vi.fn(),
    getS3: vi.fn(),
    R2ObjectAccessError,
  };
});

vi.mock("@pi-dash/env/server", () => ({
  env: { R2_KEY_PREFIX: "app" },
}));
vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({
        handler: (handler: unknown) => handler,
      }),
    }),
  }),
}));
vi.mock("@/middleware/auth", () => ({ authMiddleware: {} }));
vi.mock("@/lib/authorized-r2-object", () => ({
  assertCanDeleteTemporaryUpload: mocks.assertCanDeleteTemporaryUpload,
  assertCanUploadEventScopedObject: mocks.assertCanUploadEventScopedObject,
  assertCanUploadScheduledMessageObject:
    mocks.assertCanUploadScheduledMessageObject,
  R2ObjectAccessError: mocks.R2ObjectAccessError,
}));
vi.mock("@/lib/s3", () => ({ getS3: mocks.getS3 }));

import {
  buildEventPhotoUploadKey,
  buildScheduledMessageUploadKey,
  createScheduledMessageUpload,
  getEditorImageUploadUrl,
  getEventPhotoUploadUrl,
  getScheduledMessageUploadUrl,
  type ScheduledMessageUploadDeps,
} from "./attachments";

const DRAFT_KEY_RE = /^app\/scheduled-messages\/tmp\/user-1\/.+-media\.png$/;
const SIGNED_DRAFT_KEY_RE =
  /^signed:app\/scheduled-messages\/tmp\/user-1\/.+-media\.png$/;
const EVENT_PHOTO_KEY_RE = /^app\/photos\/tmp\/user-1\/.+-photo\.jpg$/;
const SIGNED_EVENT_PHOTO_KEY_RE = /^signed:app\/photos\/tmp\/user-1\//;
const UPDATE_IMAGE_KEY_RE = /^app\/updates\/event-1\/.+-Update-Image\.png$/;
const SIGNED_UPDATE_IMAGE_KEY_RE =
  /^signed:app\/updates\/event-1\/.+-Update-Image\.png$/;

const session = { user: { id: "user-1", role: "manager" } };
type MockServerFnHandler<TData extends Record<string, unknown>> = (input: {
  context: { session?: typeof session };
  data: TData;
}) => Promise<{ key: string; presignedUrl: string }>;

const eventPhotoUploadHandler =
  getEventPhotoUploadUrl as unknown as MockServerFnHandler<{
    eventId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>;
const editorImageUploadHandler =
  getEditorImageUploadUrl as unknown as MockServerFnHandler<{
    eventId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>;
const scheduledMessageUploadHandler =
  getScheduledMessageUploadUrl as unknown as MockServerFnHandler<{
    entityId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertCanUploadEventScopedObject.mockResolvedValue(undefined);
  mocks.assertCanUploadScheduledMessageObject.mockResolvedValue(undefined);
  mocks.getS3.mockReturnValue({
    presign: (key: string) => `signed:${key}`,
  });
});

function createDeps(
  overrides: Partial<ScheduledMessageUploadDeps> = {}
): ScheduledMessageUploadDeps {
  return {
    assertCanUploadScheduledMessageObject: async () => undefined,
    getS3: () => ({
      presign: (key: string) => `signed:${key}`,
    }),
    ...overrides,
  };
}

describe("buildScheduledMessageUploadKey", () => {
  it("stores draft uploads under the current user's temp folder", () => {
    expect(
      buildScheduledMessageUploadKey({
        fileName: "Campaign Media.png",
        uploadId: "upload-id",
        userId: "user-1",
      })
    ).toBe("app/scheduled-messages/tmp/user-1/upload-id-Campaign-Media.png");
  });

  it("stores message uploads under temp even when entity id looks durable", async () => {
    expect(
      await createScheduledMessageUpload(
        {
          entityId: "unsafe/scheduled-messages/message-id",
          fileName: "media.png",
          fileSize: 100,
          mimeType: "image/png",
        },
        session,
        {
          assertCanUploadScheduledMessageObject: async () => undefined,
          getS3: () => ({
            presign: (key: string) => `signed:${key}`,
          }),
        }
      )
    ).toMatchObject({
      key: expect.stringMatching(DRAFT_KEY_RE),
      presignedUrl: expect.stringMatching(SIGNED_DRAFT_KEY_RE),
    });
  });
});

describe("buildEventPhotoUploadKey", () => {
  it("stores event photo uploads under the current user's temp folder", () => {
    expect(
      buildEventPhotoUploadKey({
        fileName: "Team Photo.jpg",
        uploadId: "upload-id",
        userId: "user-1",
      })
    ).toBe("app/photos/tmp/user-1/upload-id-Team-Photo.jpg");
  });

  it("does not include the durable event path in the draft upload key", () => {
    expect(
      buildEventPhotoUploadKey({
        fileName: "photo.jpg",
        userId: "user-1",
      })
    ).toEqual(expect.stringMatching(EVENT_PHOTO_KEY_RE));
  });
});

describe("createScheduledMessageUpload", () => {
  it("presigns scheduled message uploads after permission passes", async () => {
    await expect(
      createScheduledMessageUpload(
        {
          entityId: "scheduled-message-draft",
          fileName: "media.png",
          fileSize: 100,
          mimeType: "image/png",
        },
        session,
        createDeps()
      )
    ).resolves.toMatchObject({
      key: expect.stringMatching(DRAFT_KEY_RE),
      presignedUrl: expect.stringMatching(SIGNED_DRAFT_KEY_RE),
    });
  });

  it("rejects scheduled message uploads when permission fails", async () => {
    const getS3 = vi.fn(() => ({ presign: () => "" }));

    await expect(
      createScheduledMessageUpload(
        {
          entityId: "scheduled-message-draft",
          fileName: "media.png",
          fileSize: 100,
          mimeType: "image/png",
        },
        session,
        createDeps({
          assertCanUploadScheduledMessageObject: () =>
            Promise.reject(new Error("Forbidden")),
          getS3,
        })
      )
    ).rejects.toThrow("Forbidden");
    expect(getS3).not.toHaveBeenCalled();
  });
});

describe("getEventPhotoUploadUrl", () => {
  it("requires a session", async () => {
    await expect(
      eventPhotoUploadHandler({
        context: {},
        data: {
          eventId: "event-1",
          fileName: "photo.jpg",
          fileSize: 100,
          mimeType: "image/jpeg",
        },
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("checks event-scoped access and signs a temporary photo key", async () => {
    await expect(
      eventPhotoUploadHandler({
        context: { session },
        data: {
          eventId: "event-1",
          fileName: "photo.jpg",
          fileSize: 100,
          mimeType: "image/jpeg",
        },
      })
    ).resolves.toMatchObject({
      key: expect.stringMatching(EVENT_PHOTO_KEY_RE),
      presignedUrl: expect.stringMatching(SIGNED_EVENT_PHOTO_KEY_RE),
    });

    expect(mocks.assertCanUploadEventScopedObject).toHaveBeenCalledWith(
      session,
      "event-1",
      "events.manage_photos"
    );
  });

  it("maps event access failures to user-facing errors", async () => {
    mocks.assertCanUploadEventScopedObject.mockRejectedValueOnce(
      new mocks.R2ObjectAccessError(404, "Event not found")
    );

    await expect(
      eventPhotoUploadHandler({
        context: { session },
        data: {
          eventId: "event-1",
          fileName: "photo.jpg",
          fileSize: 100,
          mimeType: "image/jpeg",
        },
      })
    ).rejects.toThrow("Event not found");
  });
});

describe("getEditorImageUploadUrl", () => {
  it("checks update access and signs an event update image key", async () => {
    await expect(
      editorImageUploadHandler({
        context: { session },
        data: {
          eventId: "event-1",
          fileName: "Update Image.png",
          fileSize: 100,
          mimeType: "image/png",
        },
      })
    ).resolves.toMatchObject({
      key: expect.stringMatching(UPDATE_IMAGE_KEY_RE),
      presignedUrl: expect.stringMatching(SIGNED_UPDATE_IMAGE_KEY_RE),
    });

    expect(mocks.assertCanUploadEventScopedObject).toHaveBeenCalledWith(
      session,
      "event-1",
      "event_updates.create"
    );
  });

  it("maps forbidden update uploads", async () => {
    mocks.assertCanUploadEventScopedObject.mockRejectedValueOnce(
      new mocks.R2ObjectAccessError(403, "Forbidden")
    );

    await expect(
      editorImageUploadHandler({
        context: { session },
        data: {
          eventId: "event-1",
          fileName: "image.png",
          fileSize: 100,
          mimeType: "image/png",
        },
      })
    ).rejects.toThrow("Forbidden");
  });
});

describe("getScheduledMessageUploadUrl", () => {
  it("checks schedule permission and signs a temporary scheduled-media key", async () => {
    await expect(
      scheduledMessageUploadHandler({
        context: { session },
        data: {
          entityId: "message-draft",
          fileName: "media.png",
          fileSize: 100,
          mimeType: "image/png",
        },
      })
    ).resolves.toMatchObject({
      key: expect.stringMatching(DRAFT_KEY_RE),
      presignedUrl: expect.stringMatching(SIGNED_DRAFT_KEY_RE),
    });

    expect(mocks.assertCanUploadScheduledMessageObject).toHaveBeenCalledWith(
      session
    );
  });

  it("maps scheduled message upload permission failures", async () => {
    mocks.assertCanUploadScheduledMessageObject.mockRejectedValueOnce(
      new mocks.R2ObjectAccessError(403, "Forbidden")
    );

    await expect(
      scheduledMessageUploadHandler({
        context: { session },
        data: {
          entityId: "message-draft",
          fileName: "media.png",
          fileSize: 100,
          mimeType: "image/png",
        },
      })
    ).rejects.toThrow("Forbidden");
  });
});
