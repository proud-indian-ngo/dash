import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  ALLOWED_EVENT_MEDIA_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MIME_TYPE_PATTERN,
} from "@pi-dash/shared/constants";
import { getS3 } from "./s3";

type R2CopyClient = Pick<ReturnType<typeof getS3>, "exists" | "file" | "stat">;
type R2CopyFile = ReturnType<R2CopyClient["file"]>;
type R2CopyWriter = ReturnType<R2CopyFile["writer"]>;

interface CopyR2ObjectDeps {
  getS3: () => Promise<R2CopyClient> | R2CopyClient;
}

const defaultDeps: CopyR2ObjectDeps = { getS3 };

export interface CopyR2ObjectInput {
  mimeType?: string;
  sourceKey: string;
  targetKey: string;
}

const normalizeMimeType = (mimeType: string): string =>
  mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

function uploadPolicy(sourceKey: string, mimeType: string) {
  if (sourceKey.includes("/approval-screenshots/tmp/")) {
    return {
      allowed: ALLOWED_APPROVAL_SCREENSHOT_TYPES as readonly string[],
      maxSize: MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
    };
  }
  if (sourceKey.includes("/photos/tmp/")) {
    return {
      allowed: ALLOWED_EVENT_MEDIA_TYPES as readonly string[],
      maxSize: mimeType.startsWith("video/")
        ? MAX_VIDEO_SIZE_BYTES
        : MAX_IMAGE_SIZE_BYTES,
    };
  }
  if (sourceKey.includes("/attachments/tmp/")) {
    return {
      allowed: ALLOWED_MIME_TYPES as readonly string[],
      maxSize: mimeType.startsWith("video/")
        ? MAX_VIDEO_SIZE_BYTES
        : MAX_ATTACHMENT_FILE_SIZE_BYTES,
    };
  }
  if (sourceKey.includes("/scheduled-messages/tmp/")) {
    return {
      allowed: null,
      maxSize: MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
    };
  }
  throw new Error("Invalid temporary upload key");
}

async function writeNextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: R2CopyWriter,
  streamedSize: number,
  expectedSize: number,
  maxSize: number
): Promise<number> {
  const { done, value } = await reader.read();
  if (done) {
    return streamedSize;
  }
  const nextSize = streamedSize + value.byteLength;
  if (nextSize > expectedSize || nextSize > maxSize) {
    throw new Error("Upload changed during claim");
  }
  await writer.write(value);
  return writeNextChunk(reader, writer, nextSize, expectedSize, maxSize);
}

async function copyValidatedStream(
  sourceFile: R2CopyFile,
  writer: R2CopyWriter,
  expectedSize: number,
  maxSize: number
): Promise<void> {
  const reader = sourceFile.stream().getReader();
  try {
    const streamedSize = await writeNextChunk(
      reader,
      writer,
      0,
      expectedSize,
      maxSize
    );
    if (streamedSize !== expectedSize) {
      throw new Error("Upload changed during claim");
    }
    await writer.end();
  } catch (error) {
    await writer.end(
      error instanceof Error ? error : new Error("Upload copy failed")
    );
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function copyR2Object(
  input: CopyR2ObjectInput,
  deps = defaultDeps
): Promise<void> {
  const s3 = await deps.getS3();
  if (await s3.exists(input.targetKey)) {
    return;
  }
  if (!(await s3.exists(input.sourceKey))) {
    throw new Error("Temporary upload not found");
  }
  const source = await s3.stat(input.sourceKey);
  const storedMimeType = normalizeMimeType(source.type);
  if (!storedMimeType) {
    throw new Error("Upload content type is missing");
  }
  if (input.mimeType && normalizeMimeType(input.mimeType) !== storedMimeType) {
    throw new Error("Upload content type mismatch");
  }
  const policy = uploadPolicy(input.sourceKey, storedMimeType);
  if (
    policy.allowed
      ? !policy.allowed.includes(storedMimeType)
      : !MIME_TYPE_PATTERN.test(storedMimeType)
  ) {
    throw new Error(`Unsupported upload type: ${storedMimeType}`);
  }
  if (source.size <= 0) {
    throw new Error("Upload is empty");
  }
  if (source.size > policy.maxSize) {
    throw new Error(`Upload exceeds ${policy.maxSize} byte limit`);
  }
  const options = { type: storedMimeType };
  const sourceFile = s3.file(input.sourceKey, options);
  const writer = s3.file(input.targetKey, options).writer(options);
  await copyValidatedStream(sourceFile, writer, source.size, policy.maxSize);
}
