import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
  MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { GOVERNANCE_DOCUMENT_MAX_BYTES } from "@pi-dash/shared/governance";
import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";

mock.module("./s3", () => ({ getS3: mock() }));

import { copyR2Object, readGovernanceUpload } from "./r2-upload-claim";

const writer = {
  end: mock(),
  write: mock(),
};
let streamedSize = 1024;

const sourceStream = () => {
  let remaining = streamedSize;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining === 0) {
        controller.close();
        return;
      }
      const chunkSize = Math.min(remaining, 1024 * 1024);
      remaining -= chunkSize;
      controller.enqueue(new Uint8Array(chunkSize));
    },
  });
};

const s3 = {
  exists: mock(),
  file: mock((key: string) =>
    key.includes("/tmp/") && !key.endsWith("-durable")
      ? { stream: sourceStream }
      : { writer: () => writer }
  ),
  stat: mock(),
};
const deps = {
  getS3: () =>
    s3 as unknown as Pick<
      ReturnType<(typeof import("./s3"))["getS3"]>,
      "exists" | "file" | "stat"
    >,
};

const input = {
  mimeType: "application/pdf",
  sourceKey: "app/attachments/tmp/user-1/upload.pdf",
  targetKey: "app/attachments/reimbursements/request-1/upload.pdf",
};

beforeEach(() => {
  mock.clearAllMocks();
  streamedSize = 1024;
  s3.exists.mockResolvedValue(false);
  s3.stat.mockResolvedValue({ size: 1024, type: "application/pdf" });
});

describe("copyR2Object", () => {
  it("rejects claimed music sizes that differ from stored bytes", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 1024, type: "audio/mpeg" });
    await expect(
      copyR2Object(
        {
          ...input,
          sourceKey: "app/kalakriti-music/tmp/user-1/upload.mp3",
          mimeType: "audio/mpeg",
          byteSize: 512,
        },
        deps
      )
    ).rejects.toThrow("byte size mismatch");
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("validates metadata on an existing music target during retries", async () => {
    s3.exists.mockResolvedValue(true);
    s3.stat.mockResolvedValue({ size: 1024, type: "audio/mpeg" });
    await expect(
      copyR2Object({ ...input, mimeType: "audio/mpeg", byteSize: 512 }, deps)
    ).rejects.toThrow("metadata mismatch");
    expect(writer.write).not.toHaveBeenCalled();
  });
  it("copies a temporary object without deleting the retryable source", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await copyR2Object(input, deps);

    expect(s3.exists).toHaveBeenNthCalledWith(1, input.sourceKey);
    expect(s3.exists).toHaveBeenNthCalledWith(2, input.targetKey);
    expect(s3.exists).toHaveBeenCalledTimes(2);
    expect(writer.write).toHaveBeenCalled();
    expect(writer.end).toHaveBeenCalledWith();
  });

  it("treats an existing durable target as an idempotent success", async () => {
    s3.exists.mockResolvedValue(true);

    await copyR2Object(input, deps);

    expect(s3.exists).toHaveBeenCalledTimes(2);
    expect(s3.file).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects a missing temporary source even when the durable target exists", async () => {
    s3.exists.mockImplementation((key: string) =>
      Promise.resolve(key === input.targetKey)
    );

    await expect(copyR2Object(input, deps)).rejects.toThrow(
      "Temporary upload not found"
    );
    expect(s3.exists).toHaveBeenCalledWith(input.sourceKey);
    expect(s3.stat).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("revalidates an existing durable key in place without a temporary source", async () => {
    const durableKey =
      "app/approval-screenshots/reimbursements/request-1/approval-screenshots/proof.png";
    s3.exists.mockResolvedValue(true);

    await copyR2Object({ sourceKey: durableKey, targetKey: durableKey }, deps);

    expect(s3.exists).toHaveBeenCalledTimes(1);
    expect(s3.exists).toHaveBeenCalledWith(durableKey);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects a missing source when the durable target does not exist", async () => {
    s3.exists.mockResolvedValue(false);

    await expect(copyR2Object(input, deps)).rejects.toThrow(
      "Temporary upload not found"
    );
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects an oversized approval screenshot from stored metadata", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
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
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects an unsupported event-photo MIME type", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
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
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects stored content types that differ from mutation input", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 1024, type: "image/png" });

    await expect(copyR2Object(input, deps)).rejects.toThrow(
      "Upload content type mismatch"
    );
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects an empty stored object", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 0, type: "application/pdf" });

    await expect(copyR2Object(input, deps)).rejects.toThrow("empty");
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("rejects when the streamed object is larger than the validated metadata", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 1, type: "application/pdf" });
    streamedSize = 2;

    await expect(copyR2Object(input, deps)).rejects.toThrow("changed");
  });

  it("accepts a valid scheduled-message MIME type outside request uploads", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 1024, type: "audio/mpeg" });

    await copyR2Object(
      {
        mimeType: "audio/mpeg",
        sourceKey: "app/scheduled-messages/tmp/user-1/voice-note.mp3",
        targetKey: "app/scheduled-messages/message-1/voice-note.mp3",
      },
      deps
    );

    expect(writer.write).toHaveBeenCalled();
  });

  it("accepts Kalakriti music MIME types on the dedicated prefix", async () => {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: 1024, type: "audio/mpeg" });

    await copyR2Object(
      {
        mimeType: "audio/mpeg",
        sourceKey: "app/kalakriti-music/tmp/user-1/track.mp3",
        targetKey: "app/kalakriti-music/edition-1/entry-1/track.mp3",
      },
      deps
    );

    expect(writer.write).toHaveBeenCalled();
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
    {
      maxSize: MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
      mimeType: "application/pdf",
      sourceKey: "app/kalakriti-scorecards/tmp/user-1/judge.pdf",
    },
    {
      maxSize: MAX_KALAKRITI_MUSIC_SIZE_BYTES,
      mimeType: "audio/mpeg",
      sourceKey: "app/kalakriti-music/tmp/user-1/track.mp3",
    },
    {
      maxSize: MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES,
      mimeType: "image/png",
      sourceKey: "app/kalakriti-inventory/tmp/user-1/photo.png",
    },
  ])(
    "enforces stored size for $sourceKey",
    async ({ maxSize, mimeType, sourceKey }) => {
      s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      s3.stat.mockResolvedValue({ size: maxSize, type: mimeType });
      streamedSize = maxSize;

      await copyR2Object(
        { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
        deps
      );
      expect(writer.write).toHaveBeenCalled();

      mock.clearAllMocks();
      s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      s3.stat.mockResolvedValue({ size: maxSize + 1, type: mimeType });
      await expect(
        copyR2Object(
          { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
          deps
        )
      ).rejects.toThrow("exceeds");
      expect(writer.write).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["app/attachments/tmp/user-1/audio.mp3", "audio/mpeg"],
    ["app/kalakriti-scorecards/tmp/user-1/audio.mp3", "audio/mpeg"],
    ["app/kalakriti-music/tmp/user-1/notes.pdf", "application/pdf"],
    ["app/kalakriti-inventory/tmp/user-1/notes.pdf", "application/pdf"],
    ["app/approval-screenshots/tmp/user-1/animation.gif", "image/gif"],
    ["app/photos/tmp/user-1/document.pdf", "application/pdf"],
    ["app/scheduled-messages/tmp/user-1/file", "not-a-mime"],
  ])(
    "rejects unsupported stored MIME metadata for %s",
    async (sourceKey, mimeType) => {
      s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      s3.stat.mockResolvedValue({ size: 1024, type: mimeType });

      await expect(
        copyR2Object(
          { mimeType, sourceKey, targetKey: `${sourceKey}-durable` },
          deps
        )
      ).rejects.toThrow("Unsupported upload type");
      expect(writer.write).not.toHaveBeenCalled();
    }
  );
});

describe("copyR2Object for a payee signature", () => {
  /** The start of a PNG declaring these header fields, padded to `size`. */
  const png = (
    width: number,
    height: number,
    { colourType = 6, size = 2048 } = {}
  ) => {
    const bytes = new Uint8Array(size);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    bytes[24] = 8;
    bytes[25] = colourType;
    return bytes;
  };
  const signatureInput = {
    contentCheck: "payeeSignature" as const,
    mimeType: "image/png",
    sourceKey: "app/attachments/tmp/user-1/payee-signature.png",
    targetKey: "app/attachments/reimbursements/request-1/payee-signature.png",
  };
  /** A stream of the bytes in 1 KB chunks, counting how many were read. */
  let chunksRead = 0;
  const streamOf = (bytes: Uint8Array) => () =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const start = chunksRead * 1024;
        if (start >= bytes.byteLength) {
          controller.close();
          return;
        }
        chunksRead += 1;
        controller.enqueue(bytes.slice(start, start + 1024));
      },
    });
  const withSource = (
    bytes: Uint8Array,
    type = "image/png",
    statSize = bytes.byteLength
  ) => {
    chunksRead = 0;
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size: statSize, type });
    s3.file.mockImplementation(((key: string) =>
      key === signatureInput.sourceKey
        ? { stream: streamOf(bytes) }
        : { writer: () => writer }) as never);
  };
  /** The durable target already exists, as when the key was claimed before. */
  const withExistingTarget = (bytes: Uint8Array, type = "image/png") => {
    chunksRead = 0;
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    s3.stat.mockResolvedValue({ size: bytes.byteLength, type });
    s3.file.mockImplementation(((key: string) =>
      key === signatureInput.targetKey
        ? { stream: streamOf(bytes) }
        : { writer: () => writer }) as never);
  };

  it("copies a PNG the pad could have drawn", async () => {
    withSource(png(480, 160));
    await copyR2Object(signatureInput, deps);
    expect(writer.write).toHaveBeenCalledTimes(1);
    expect(writer.end).toHaveBeenCalledWith();
  });

  it.each([
    ["huge dimensions in a small file", png(6000, 6000), "too_large"],
    [
      "a wrong colour type",
      png(480, 160, { colourType: 3 }),
      "unsupported_format",
    ],
    ["a blank 1×1", png(1, 1), "too_small"],
  ])("refuses %s", async (_, bytes, problem) => {
    withSource(bytes);
    await expect(copyR2Object(signatureInput, deps)).rejects.toThrow(
      `Invalid payee signature image: ${problem}`
    );
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("refuses a file over the signature cap", async () => {
    withSource(png(480, 160, { size: 512 * 1024 + 1 }));
    await expect(copyR2Object(signatureInput, deps)).rejects.toThrow(
      "Upload exceeds 524288 byte limit"
    );
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("refuses anything but a PNG", async () => {
    withSource(png(480, 160), "image/jpeg");
    await expect(
      copyR2Object({ ...signatureInput, mimeType: "image/jpeg" }, deps)
    ).rejects.toThrow("Unsupported upload type: image/jpeg");
  });

  it("stops reading an object swapped for a bigger one", async () => {
    // Stat said 2 KB, but the stream runs on: reading stops past the size.
    withSource(png(480, 160, { size: 300 * 1024 }), "image/png", 2048);
    await expect(copyR2Object(signatureInput, deps)).rejects.toThrow(
      "Upload changed during claim"
    );
    expect(chunksRead).toBeLessThanOrEqual(3);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("checks a target that already exists", async () => {
    withExistingTarget(png(480, 160));
    await expect(copyR2Object(signatureInput, deps)).resolves.toBeUndefined();
    withExistingTarget(png(6000, 6000));
    await expect(copyR2Object(signatureInput, deps)).rejects.toThrow(
      "Invalid payee signature image: too_large"
    );
    withExistingTarget(png(480, 160), "application/pdf");
    await expect(copyR2Object(signatureInput, deps)).rejects.toThrow(
      "Unsupported upload type: application/pdf"
    );
  });
});

describe("readGovernanceUpload", () => {
  const upload = (statedSize: number) => {
    const stream = mock(sourceStream);
    return {
      file: {
        stat: async () => ({ size: statedSize }),
        stream,
      } as unknown as Parameters<typeof readGovernanceUpload>[0],
      stream,
    };
  };

  it("reads an upload within the cap", async () => {
    const { file } = upload(1024);
    expect((await readGovernanceUpload(file)).byteLength).toBe(1024);
  });

  it("refuses an upload stored bigger than the cap without reading it", async () => {
    const { file, stream } = upload(GOVERNANCE_DOCUMENT_MAX_BYTES + 1);
    await expect(readGovernanceUpload(file)).rejects.toThrow(
      "The file is larger than 25 MB."
    );
    expect(stream).not.toHaveBeenCalled();
  });

  it("stops reading an upload that grew past its stored size", async () => {
    streamedSize = 3 * 1024 * 1024;
    const { file } = upload(1024);
    await expect(readGovernanceUpload(file)).rejects.toThrow(
      "Upload changed during claim"
    );
  });
});

describe("avatar and editor image publication", () => {
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
      "base64"
    )
  );
  const imageInput = {
    sourceKey: "app/avatars/tmp/user-1/image.png",
    targetKey: "app/avatars/user-1/validated/fresh-id",
  };
  function source(bytes: Uint8Array, type = "image/png", size = bytes.length) {
    s3.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    s3.stat.mockResolvedValue({ size, type });
    s3.file.mockImplementation(((key: string) =>
      key === imageInput.sourceKey
        ? { stream: () => new Blob([new Uint8Array(bytes)]).stream() }
        : { writer: () => writer }) as never);
  }

  it("copies only the exact bytes whose image format was checked", async () => {
    source(png);
    await copyR2Object(imageInput, deps);
    expect(writer.write).toHaveBeenCalledWith(png);
    expect(writer.end).toHaveBeenCalledWith();
  });

  it.each([
    ["app/avatars/tmp/user-1/image.png", 5 * 1024 * 1024],
    ["app/updates/tmp/user-1/image.png", 20 * 1024 * 1024],
  ])("rejects stored oversize before reading %s", async (sourceKey, limit) => {
    source(png, "image/png", limit + 1);
    await expect(
      copyR2Object({ ...imageInput, sourceKey }, deps)
    ).rejects.toThrow("exceeds");
    expect(s3.file).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", new TextEncoder().encode("<svg onload=alert(1)></svg>")],
    ["image/jpeg", png],
    ["text/html", png],
    ["image/png", png.slice(0, 29)],
  ])(
    "refuses spoofed or truncated %s without writing durable bytes",
    async (type, bytes) => {
      source(bytes, type);
      await expect(copyR2Object(imageInput, deps)).rejects.toThrow();
      expect(writer.write).not.toHaveBeenCalled();
    }
  );

  it("rejects excessive dimensions before publication", async () => {
    const bytes = png.slice();
    new DataView(bytes.buffer).setUint32(16, 100_000);
    source(bytes);
    await expect(copyR2Object(imageInput, deps)).rejects.toThrow("dimensions");
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("stops a source that grows between HEAD and GET", async () => {
    source(png, "image/png", png.length - 1);
    await expect(copyR2Object(imageInput, deps)).rejects.toThrow("changed");
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("does not overwrite a published target when the temp PUT is replayed", async () => {
    s3.exists.mockResolvedValue(true);
    await copyR2Object(imageInput, deps);
    expect(s3.file).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });
});
