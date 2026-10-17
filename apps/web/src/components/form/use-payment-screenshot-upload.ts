import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { log } from "evlog";
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";

import {
  deleteTemporaryUpload,
  getApprovalScreenshotUploadUrl,
} from "@/functions/attachments";

type ScreenshotType = (typeof ALLOWED_APPROVAL_SCREENSHOT_TYPES)[number];

/** Uploads the file to a temporary R2 key and returns the key. */
async function uploadScreenshot(file: File, mimeType: ScreenshotType) {
  const { presignedUrl, key } = await getApprovalScreenshotUploadUrl({
    data: {
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    },
  });

  const uploadRes = await fetch(presignedUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }
  return key;
}

/**
 * Uploads a payment screenshot to a temporary R2 key for a mutator to
 * claim, with a local preview. Used at approval and when payment proof is
 * added after it. `reset` drops an unclaimed upload.
 */
export function usePaymentScreenshotUpload(
  component: string,
  entityId: string
) {
  const [screenshotKey, setScreenshotKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const dropTemporaryUpload = (key: string | null, action: string) => {
    if (!key) {
      return;
    }
    deleteTemporaryUpload({ data: { key } }).catch((error) => {
      log.error({
        action,
        component,
        error: error instanceof Error ? error.message : String(error),
        screenshotKey: key,
      });
    });
  };

  /**
   * Forgets the upload and deletes the temporary file: a mutator that took
   * it has already copied it to its lasting place.
   */
  const reset = useEventCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    dropTemporaryUpload(screenshotKey, "cleanup");
    setScreenshotKey(null);
    setPreviewUrl(null);
    setUploading(false);
  });

  const remove = useEventCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    dropTemporaryUpload(screenshotKey, "removeScreenshot");
    setScreenshotKey(null);
    setPreviewUrl(null);
  });

  const handleFileChange = useEventCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      const mimeType = file.type as ScreenshotType;
      if (!ALLOWED_APPROVAL_SCREENSHOT_TYPES.includes(mimeType)) {
        toast.error(
          "Invalid file type. Please upload a JPEG, PNG, or WebP image."
        );
        return;
      }
      if (file.size > MAX_APPROVAL_SCREENSHOT_SIZE_BYTES) {
        toast.error("File too large. Maximum size is 10 MB.");
        return;
      }

      setUploading(true);
      await uploadScreenshot(file, mimeType)
        .then((key) => {
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }
          setScreenshotKey(key);
          setPreviewUrl(URL.createObjectURL(file));
        })
        .catch((error: unknown) => {
          log.error({
            action: "uploadScreenshot",
            component,
            entityId,
            error: error instanceof Error ? error.message : String(error),
            fileName: file.name,
          });
          toast.error("Couldn't upload screenshot — try again");
        })
        .finally(() => setUploading(false));
    }
  );

  return {
    handleFileChange,
    previewUrl,
    remove,
    reset,
    screenshotKey,
    uploading,
  };
}
