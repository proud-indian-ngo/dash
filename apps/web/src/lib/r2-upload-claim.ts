import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  ALLOWED_EVENT_MEDIA_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_KALAKRITI_MUSIC_TYPES,
  ALLOWED_KALAKRITI_SCORECARD_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
  MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MIME_TYPE_PATTERN,
} from "@pi-dash/shared/constants";
import {
  GOVERNANCE_DOCUMENT_CONTENT_TYPES,
  GOVERNANCE_DOCUMENT_MAX_BYTES,
} from "@pi-dash/shared/governance";
import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";
import {
  PAYEE_SIGNATURE_MAX_BYTES,
  PAYEE_SIGNATURE_MIME_TYPE,
  payeeSignatureImageProblem,
} from "@pi-dash/shared/payee-signature";

import { HttpError } from "@/lib/http-error";

import { getS3 } from "./s3";

type R2CopyClient = Pick<ReturnType<typeof getS3>, "exists" | "file" | "stat">;
type R2CopyFile = ReturnType<R2CopyClient["file"]>;
type R2CopyWriter = ReturnType<R2CopyFile["writer"]>;

interface CopyR2ObjectDeps {
  getS3: () => Promise<R2CopyClient> | R2CopyClient;
}

const defaultDeps: CopyR2ObjectDeps = { getS3 };

export interface CopyR2ObjectInput {
  byteSize?: number;
  contentCheck?: "payeeSignature";
  mimeType?: string;
  sourceKey: string;
  targetKey: string;
}

const TEMPORARY_KEY_PATTERN = /\/tmp\//;

const normalizeMimeType = (mimeType: string): string =>
  mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

function uploadPolicy(sourceKey: string, mimeType: string) {
  if (sourceKey.includes("/kalakriti-inventory/tmp/")) {
    return {
      allowed: ALLOWED_IMAGE_TYPES as readonly string[],
      maxSize: MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES,
    };
  }
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
  if (sourceKey.includes("/kalakriti-music/tmp/")) {
    return {
      allowed: ALLOWED_KALAKRITI_MUSIC_TYPES as readonly string[],
      maxSize: MAX_KALAKRITI_MUSIC_SIZE_BYTES,
    };
  }
  if (sourceKey.includes("/kalakriti-scorecards/tmp/")) {
    return {
      allowed: ALLOWED_KALAKRITI_SCORECARD_TYPES as readonly string[],
      maxSize: MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
    };
  }
  if (sourceKey.includes("/governance/tmp/")) {
    return {
      allowed: [
        ...new Set(Object.values(GOVERNANCE_DOCUMENT_CONTENT_TYPES).flat()),
      ] as readonly string[],
      maxSize: GOVERNANCE_DOCUMENT_MAX_BYTES,
    };
  }
  throw new HttpError(400, "Invalid temporary upload key");
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
    throw new HttpError(409, "Upload changed during claim");
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
      throw new HttpError(409, "Upload changed during claim");
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
  // A temporary key must still exist even when its durable target does, so a
  // made-up temporary key cannot re-reference an earlier claimed object.
  const sourceIsTemporary =
    input.sourceKey !== input.targetKey &&
    TEMPORARY_KEY_PATTERN.test(input.sourceKey);
  if (sourceIsTemporary && !(await s3.exists(input.sourceKey))) {
    throw new HttpError(404, "Temporary upload not found");
  }
  if (await s3.exists(input.targetKey)) {
    // A signature is checked even when its target already exists: the same
    // temporary key may have been claimed before as an ordinary attachment.
    if (input.contentCheck === "payeeSignature") {
      await checkExistingPayeeSignature(s3, input.targetKey);
      return;
    }
    if (input.byteSize !== undefined) {
      const target = await s3.stat(input.targetKey);
      if (
        target.size !== input.byteSize ||
        (input.mimeType &&
          normalizeMimeType(target.type) !== normalizeMimeType(input.mimeType))
      ) {
        throw new HttpError(400, "Upload metadata mismatch");
      }
    }
    return;
  }
  if (!(sourceIsTemporary || (await s3.exists(input.sourceKey)))) {
    throw new HttpError(404, "Temporary upload not found");
  }
  const source = await s3.stat(input.sourceKey);
  const storedMimeType = normalizeMimeType(source.type);
  if (!storedMimeType) {
    throw new HttpError(400, "Upload content type is missing");
  }
  if (input.mimeType && normalizeMimeType(input.mimeType) !== storedMimeType) {
    throw new HttpError(400, "Upload content type mismatch");
  }
  const policy = uploadPolicy(input.sourceKey, storedMimeType);
  if (
    policy.allowed
      ? !policy.allowed.includes(storedMimeType)
      : !MIME_TYPE_PATTERN.test(storedMimeType)
  ) {
    throw new HttpError(400, `Unsupported upload type: ${storedMimeType}`);
  }
  if (input.byteSize !== undefined && source.size !== input.byteSize) {
    throw new HttpError(400, "Upload byte size mismatch");
  }
  if (source.size <= 0) {
    throw new HttpError(400, "Upload is empty");
  }
  if (source.size > policy.maxSize) {
    throw new HttpError(400, `Upload exceeds ${policy.maxSize} byte limit`);
  }
  const options = { type: storedMimeType };
  const sourceFile = s3.file(input.sourceKey, options);
  const writer = s3.file(input.targetKey, options).writer(options);
  if (input.contentCheck === "payeeSignature") {
    await copyPayeeSignature(sourceFile, writer, storedMimeType, source.size);
    return;
  }
  await copyValidatedStream(sourceFile, writer, source.size, policy.maxSize);
}

/**
 * A payee signature is small, so it is read whole and its PNG header checked
 * before it is copied: the pad's size and format only, under its own byte
 * cap rather than the generic attachment limit.
 */
async function copyPayeeSignature(
  sourceFile: R2CopyFile,
  writer: R2CopyWriter,
  storedMimeType: string,
  size: number
): Promise<void> {
  assertPayeeSignatureMetadata(storedMimeType, size);
  try {
    const bytes = await readCapped(sourceFile, size);
    assertPayeeSignatureImage(bytes);
    await writer.write(bytes);
    await writer.end();
  } catch (error) {
    await writer.end(
      error instanceof Error ? error : new Error("Upload copy failed")
    );
    throw error;
  }
}

/** An already-claimed target must pass the same checks before it is reused. */
async function checkExistingPayeeSignature(
  s3: R2CopyClient,
  targetKey: string
): Promise<void> {
  const target = await s3.stat(targetKey);
  assertPayeeSignatureMetadata(normalizeMimeType(target.type), target.size);
  assertPayeeSignatureImage(await readCapped(s3.file(targetKey), target.size));
}

function assertPayeeSignatureMetadata(mimeType: string, size: number): void {
  if (mimeType !== PAYEE_SIGNATURE_MIME_TYPE) {
    throw new HttpError(400, `Unsupported upload type: ${mimeType}`);
  }
  if (size > PAYEE_SIGNATURE_MAX_BYTES) {
    throw new HttpError(
      400,
      `Upload exceeds ${PAYEE_SIGNATURE_MAX_BYTES} byte limit`
    );
  }
}

function assertPayeeSignatureImage(bytes: Uint8Array): void {
  const problem = payeeSignatureImageProblem(bytes, bytes.byteLength);
  if (problem) {
    throw new HttpError(400, `Invalid payee signature image: ${problem}`);
  }
}

async function readNextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
  readSize: number,
  limit: number
): Promise<number> {
  const { done, value } = await reader.read();
  if (done) {
    return readSize;
  }
  const nextSize = readSize + value.byteLength;
  if (nextSize > limit) {
    await reader.cancel();
    throw new HttpError(409, "Upload changed during claim");
  }
  chunks.push(value);
  return readNextChunk(reader, chunks, nextSize, limit);
}

/**
 * Reads an object chunk by chunk, stopping as soon as it runs past the size
 * its caller checked, so an object swapped for a bigger one is never
 * buffered whole.
 */
async function readCapped(
  file: R2CopyFile,
  expectedSize: number
): Promise<Uint8Array> {
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    total = await readNextChunk(reader, chunks, 0, expectedSize);
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedSize) {
    throw new HttpError(409, "Upload changed during claim");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Reads a governance upload that exists, no bigger than the vault's cap. A
 * presigned PUT can store more than the size it declared, so the stored
 * size is checked before reading and the read stops if the object grows.
 */
export async function readGovernanceUpload(
  file: R2CopyFile
): Promise<Uint8Array> {
  const { size } = await file.stat();
  if (size > GOVERNANCE_DOCUMENT_MAX_BYTES) {
    throw new HttpError(400, "The file is larger than 25 MB.");
  }
  return await readCapped(file, size);
}
