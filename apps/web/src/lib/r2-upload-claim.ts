import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  ALLOWED_EVENT_MEDIA_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { getS3 } from "./s3";

type R2CopyClient = Pick<
  ReturnType<typeof getS3>,
  "exists" | "file" | "stat" | "write"
>;

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
  if (
    sourceKey.includes("/attachments/tmp/") ||
    sourceKey.includes("/scheduled-messages/tmp/")
  ) {
    return {
      allowed: ALLOWED_MIME_TYPES as readonly string[],
      maxSize: mimeType.startsWith("video/")
        ? MAX_VIDEO_SIZE_BYTES
        : MAX_ATTACHMENT_FILE_SIZE_BYTES,
    };
  }
  throw new Error("Invalid temporary upload key");
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
  if (!policy.allowed.includes(storedMimeType)) {
    throw new Error(`Unsupported upload type: ${storedMimeType}`);
  }
  if (source.size > policy.maxSize) {
    throw new Error(`Upload exceeds ${policy.maxSize} byte limit`);
  }
  const options = { type: storedMimeType };
  await s3.write(input.targetKey, s3.file(input.sourceKey, options), options);
}
