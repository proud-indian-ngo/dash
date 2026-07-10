import {
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./s3", () => ({ getS3: vi.fn() }));

import { copyR2Object } from "./r2-upload-claim";

const s3 = {
  exists: vi.fn(),
  file: vi.fn((key: string, options?: { type: string }) => ({
    key,
    options,
  })),
  stat: vi.fn(),
  write: vi.fn(),
};
const deps = {
  getS3: () =>
    s3 as unknown as Pick<
      ReturnType<typeof import("./s3")["getS3"]>,
      "exists" | "file" | "stat" | "write"
    >,
};

const input = {
  mimeType: "application/pdf",
  sourceKey: "app/attachments/tmp/user-1/upload.pdf",
  targetKey: "app/attachments/reimbursements/request-1/upload.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
  s3.exists.mockResolvedValue(false);
  s3.stat.mockResolvedValue({ size: 1024, type: "application/pdf" });
});

describe("copyR2Object", () => {
  it("copies a temporary object without deleting the retryable source", async () => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await copyR2Object(input, deps);

    expect(s3.exists).toHaveBeenNthCalledWith(1, input.targetKey);
    expect(s3.exists).toHaveBeenNthCalledWith(2, input.sourceKey);
    expect(s3.write).toHaveBeenCalledWith(
      input.targetKey,
      { key: input.sourceKey, options: { type: input.mimeType } },
      { type: input.mimeType }
    );
  });

  it("treats an existing durable target as an idempotent success", async () => {
    s3.exists.mockResolvedValueOnce(true);

    await copyR2Object(input, deps);

    expect(s3.exists).toHaveBeenCalledTimes(1);
    expect(s3.file).not.toHaveBeenCalled();
    expect(s3.write).not.toHaveBeenCalled();
  });

  it("rejects a missing source when the durable target does not exist", async () => {
    s3.exists.mockResolvedValue(false);

    await expect(copyR2Object(input, deps)).rejects.toThrow(
      "Temporary upload not found"
    );
    expect(s3.write).not.toHaveBeenCalled();
  });

  it("rejects an oversized approval screenshot from stored metadata", async () => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({
      size: MAX_APPROVAL_SCREENSHOT_SIZE_BYTES + 1,
      type: "image/png",
    });

    await expect(
      copyR2Object(
        {
          mimeType: "image/png",
          sourceKey: "app/approval-screenshots/tmp/user-1/proof.png",
          targetKey:
            "app/approval-screenshots/reimbursements/request-1/proof.png",
        },
        deps
      )
    ).rejects.toThrow("exceeds");
    expect(s3.write).not.toHaveBeenCalled();
  });

  it("rejects an unsupported event-photo MIME type", async () => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({
      size: MAX_IMAGE_SIZE_BYTES,
      type: "application/pdf",
    });

    await expect(
      copyR2Object(
        {
          mimeType: "application/pdf",
          sourceKey: "app/photos/tmp/user-1/document.pdf",
          targetKey: "app/photos/event-1/document.pdf",
        },
        deps
      )
    ).rejects.toThrow("Unsupported upload type");
    expect(s3.write).not.toHaveBeenCalled();
  });

  it("rejects stored content types that differ from mutation input", async () => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: 1024, type: "image/png" });

    await expect(copyR2Object(input, deps)).rejects.toThrow(
      "Upload content type mismatch"
    );
    expect(s3.write).not.toHaveBeenCalled();
  });

  it("accepts a valid scheduled-message MIME type outside request uploads", async () => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: 1024, type: "audio/mpeg" });

    await copyR2Object(
      {
        mimeType: "audio/mpeg",
        sourceKey: "app/scheduled-messages/tmp/user-1/voice-note.mp3",
        targetKey: "app/scheduled-messages/message-1/voice-note.mp3",
      },
      deps
    );

    expect(s3.write).toHaveBeenCalled();
  });

  it.each([
    {
      maxSize: MAX_ATTACHMENT_FILE_SIZE_BYTES,
      mimeType: "application/pdf",
      sourceKey: "app/attachments/tmp/user-1/document.pdf",
    },
    {
      maxSize: MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
      mimeType: "image/png",
      sourceKey: "app/approval-screenshots/tmp/user-1/proof.png",
    },
    {
      maxSize: MAX_VIDEO_SIZE_BYTES,
      mimeType: "video/mp4",
      sourceKey: "app/photos/tmp/user-1/clip.mp4",
    },
    {
      maxSize: MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
      mimeType: "application/zip",
      sourceKey: "app/scheduled-messages/tmp/user-1/archive.zip",
    },
  ])("enforces stored size for $sourceKey", async ({
    maxSize,
    mimeType,
    sourceKey,
  }) => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: maxSize, type: mimeType });

    await copyR2Object(
      { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
      deps
    );
    expect(s3.write).toHaveBeenCalled();

    vi.clearAllMocks();
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: maxSize + 1, type: mimeType });
    await expect(
      copyR2Object(
        { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
        deps
      )
    ).rejects.toThrow("exceeds");
    expect(s3.write).not.toHaveBeenCalled();
  });

  it.each([
    ["app/attachments/tmp/user-1/audio.mp3", "audio/mpeg"],
    ["app/approval-screenshots/tmp/user-1/animation.gif", "image/gif"],
    ["app/photos/tmp/user-1/document.pdf", "application/pdf"],
    ["app/scheduled-messages/tmp/user-1/file", "not-a-mime"],
  ])("rejects unsupported stored MIME metadata for %s", async (sourceKey, mimeType) => {
    s3.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: 1024, type: mimeType });

    await expect(
      copyR2Object(
        { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
        deps
      )
    ).rejects.toThrow("Unsupported upload type");
    expect(s3.write).not.toHaveBeenCalled();
  });
});
