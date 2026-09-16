import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import { ALLOWED_IMAGE_TYPES } from "@pi-dash/shared/constants";
import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";
import type { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";

import {
  deleteTemporaryUpload,
  getKalakritiInventoryPhotoUploadUrl,
} from "@/functions/attachments";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";

type DeleteUpload = ReturnType<
  typeof useServerFn<typeof deleteTemporaryUpload>
>;
type SignUpload = ReturnType<
  typeof useServerFn<typeof getKalakritiInventoryPhotoUploadUrl>
>;

export interface InventoryPhotoClaim {
  byteSize: number;
  fileName: string;
  mimeType: (typeof ALLOWED_IMAGE_TYPES)[number];
  objectKey: string;
}

export function getKalakritiInventoryPhotoUrl(itemId: string): string {
  return getProtectedAttachmentHref(
    { id: itemId, kind: "kalakritiInventoryPhoto" },
    "inline"
  );
}

export async function discardTemporaryInventoryPhoto(
  key: string,
  deleteUpload: DeleteUpload = deleteTemporaryUpload
): Promise<void> {
  if (!isTemporaryR2Key(key)) return;
  try {
    await deleteUpload({ data: { key } });
  } catch (error) {
    log.error({
      action: "discardTemporaryInventoryPhoto",
      component: "KalakritiInventoryPhotoUpload",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function uploadKalakritiInventoryPhoto(
  file: File,
  editionId: string,
  getUploadUrl: SignUpload = getKalakritiInventoryPhotoUploadUrl,
  deleteUpload: DeleteUpload = deleteTemporaryUpload
): Promise<InventoryPhotoClaim> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, or GIF image");
  }
  if (file.size < 1 || file.size > MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES) {
    throw new Error("Photo must be between 1 byte and 5 MB");
  }
  const mimeType = file.type as InventoryPhotoClaim["mimeType"];
  const { key, presignedUrl } = await getUploadUrl({
    data: { editionId, fileName: file.name, fileSize: file.size, mimeType },
  });
  try {
    const response = await fetch(presignedUrl, {
      body: file,
      headers: { "Content-Type": mimeType },
      method: "PUT",
    });
    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    log.error({
      action: "putInventoryPhoto",
      component: "KalakritiInventoryPhotoUpload",
      editionId,
      error: error instanceof Error ? error.message : String(error),
    });
    await discardTemporaryInventoryPhoto(key, deleteUpload);
    throw error;
  }
  return { byteSize: file.size, fileName: file.name, mimeType, objectKey: key };
}
