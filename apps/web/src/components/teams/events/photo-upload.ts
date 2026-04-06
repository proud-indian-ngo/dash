import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
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

const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

const MEDIA_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

export const MEDIA_ACCEPT = MEDIA_MIME_TYPES.join(",");

export function isAllowedMediaType(
  mime: string
): mime is (typeof MEDIA_MIME_TYPES)[number] {
  return (MEDIA_MIME_TYPES as readonly string[]).includes(mime);
}

export function isVideoMimeType(mime: string): boolean {
  return (VIDEO_MIME_TYPES as readonly string[]).includes(mime);
}

export function validateFiles(files: FileList): File[] {
  const valid: File[] = [];
  for (const file of Array.from(files)) {
    if (!isAllowedMediaType(file.type)) {
      toast.error(`${file.name}: unsupported file type`);
      continue;
    }
    const maxSize = isVideoMimeType(file.type)
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_IMAGE_SIZE_BYTES;
    if (file.size > maxSize) {
      const limit = isVideoMimeType(file.type) ? "100 MB" : "20 MB";
      toast.error(`${file.name}: exceeds ${limit} limit`);
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
      uploadedCount === 1 ? "File uploaded" : `${uploadedCount} files uploaded`
    );
  }
  if (failedCount > 0) {
    toast.error(
      failedCount === 1
        ? "1 file failed to upload"
        : `${failedCount} files failed to upload`
    );
  }
}
