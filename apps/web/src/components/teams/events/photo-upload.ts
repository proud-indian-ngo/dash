import {
  ALLOWED_EVENT_MEDIA_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import type { useZero } from "@rocicorp/zero/react";
import type { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import type { getEventPhotoUploadUrl } from "@/functions/attachments";
import type { uploadPhotoToImmich } from "@/functions/immich-upload";
import { handleMutationResult } from "@/lib/mutation-result";

const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

const MEDIA_MIME_TYPES = ALLOWED_EVENT_MEDIA_TYPES;

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
      const limit = isVideoMimeType(file.type) ? "500 MB" : "20 MB";
      toast.error(`${file.name}: exceeds ${limit} limit`);
      continue;
    }
    valid.push(file);
  }
  return valid;
}

export async function uploadFileToR2(
  file: File,
  eventId: string,
  getUploadUrl: ReturnType<typeof useServerFn<typeof getEventPhotoUploadUrl>>
): Promise<string> {
  if (!isAllowedMediaType(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      eventId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    },
  });

  const response = await fetch(presignedUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return key;
}

export async function uploadSinglePhoto({
  callImmichUpload,
  eventId,
  file,
  getUploadUrl,
  occDate,
  useImmichDirect,
  zero,
}: {
  callImmichUpload: ReturnType<typeof useServerFn<typeof uploadPhotoToImmich>>;
  eventId: string;
  file: File;
  getUploadUrl: ReturnType<typeof useServerFn<typeof getEventPhotoUploadUrl>>;
  occDate?: string;
  useImmichDirect: boolean;
  zero: ReturnType<typeof useZero>;
}) {
  const now = Date.now();
  const photoId = uuidv7();

  let mutationResult: { error?: unknown; type: string };
  if (useImmichDirect) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);
    if (occDate) {
      formData.append("occDate", occDate);
    }
    const result = await callImmichUpload({ data: formData });
    if ("error" in result) {
      throw new Error(result.error);
    }
    mutationResult = await zero.mutate(
      mutators.eventPhoto.upload({
        eventId,
        id: photoId,
        immichAssetId: result.immichAssetId,
        mimeType: file.type,
        now,
      })
    ).server;
  } else {
    const key = await uploadFileToR2(file, eventId, getUploadUrl);
    mutationResult = await zero.mutate(
      mutators.eventPhoto.upload({
        eventId,
        id: photoId,
        mimeType: file.type,
        now,
        r2Key: key,
      })
    ).server;
  }

  handleMutationResult(mutationResult, {
    entityId: photoId,
    errorMsg: "Failed to upload media",
    mutation: "eventPhoto.upload",
  });
  if (mutationResult.type === "error") {
    throw mutationResult.error instanceof Error
      ? mutationResult.error
      : new Error("Failed to upload media");
  }
}

export function showUploadResultToasts(
  uploadedCount: number,
  failedCount: number
): void {
  if (uploadedCount > 0) {
    toast.success(
      uploadedCount === 1
        ? "File uploaded!"
        : `${uploadedCount} files uploaded!`
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
