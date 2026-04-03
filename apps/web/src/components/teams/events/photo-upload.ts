import type { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  type getPresignedUploadUrl,
  toAllowedMimeType,
} from "@/functions/attachments";

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");
const MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export function isAllowedImageType(
  mime: string
): mime is (typeof IMAGE_MIME_TYPES)[number] {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export function validateFiles(files: FileList): File[] {
  const valid: File[] = [];
  for (const file of Array.from(files)) {
    if (!isAllowedImageType(file.type)) {
      toast.error(`${file.name}: unsupported file type`);
      continue;
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error(`${file.name}: exceeds 20 MB limit`);
      continue;
    }
    valid.push(file);
  }
  return valid;
}

export async function uploadFileToR2(
  file: File,
  entityId: string,
  getUploadUrl: ReturnType<typeof useServerFn<typeof getPresignedUploadUrl>>
): Promise<string> {
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: toAllowedMimeType(file.type),
      subfolder: "photos",
      entityId,
    },
  });

  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return key;
}

export function showUploadResultToasts(
  uploadedCount: number,
  failedCount: number
): void {
  if (uploadedCount > 0) {
    toast.success(
      uploadedCount === 1
        ? "Photo uploaded"
        : `${uploadedCount} photos uploaded`
    );
  }
  if (failedCount > 0) {
    toast.error(
      failedCount === 1
        ? "1 photo failed to upload"
        : `${failedCount} photos failed to upload`
    );
  }
}
