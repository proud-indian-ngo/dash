import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/s3", () => ({ getS3: vi.fn() }));

import {
  buildScheduledMessageUploadKey,
  createScheduledMessageUpload,
  type ScheduledMessageUploadDeps,
} from "./attachments";

const DRAFT_KEY_RE = /^app\/scheduled-messages\/tmp\/user-1\/.+-media\.png$/;
const SIGNED_DRAFT_KEY_RE =
  /^signed:app\/scheduled-messages\/tmp\/user-1\/.+-media\.png$/;

const session = { user: { id: "user-1", role: "manager" } };

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
