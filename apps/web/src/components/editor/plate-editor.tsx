import type { EditorProps } from "@pi-dash/editor/editor";

import { PlateEditor as BaseEditor } from "@pi-dash/editor/editor";
import { env } from "@pi-dash/env/web";
import {
  ALLOWED_IMAGE_TYPES,
  type AllowedImageMimeType,
} from "@pi-dash/shared/constants";
import { log } from "evlog";
import { toast } from "sonner";

import { getPresignedUploadUrl } from "@/functions/attachments";

const TRAILING_SLASH = /\/$/;
function getCdnUrl(key: string): string {
  return `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;
}

interface PlateEditorProps extends Omit<EditorProps, "onImageUpload"> {
  entityId: string;
}

export function PlateEditor({ entityId, ...props }: PlateEditorProps) {
  async function onImageUpload(
    file: File
  ): Promise<{ url: string } | undefined> {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageMimeType)) {
      toast.error("Only JPEG, PNG, GIF, and WebP images are allowed.");
      return undefined;
    }

    try {
      const { key, presignedUrl } = await getPresignedUploadUrl({
        data: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type as AllowedImageMimeType,
          subfolder: "updates",
          entityId,
        },
      });

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error(
          `Upload failed: ${uploadRes.status} ${uploadRes.statusText}`
        );
      }

      return { url: getCdnUrl(key) };
    } catch (error) {
      log.error({
        component: "PlateEditor",
        action: "imageUpload",
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to upload image. Please try again.");
      return undefined;
    }
  }

  return <BaseEditor {...props} onImageUpload={onImageUpload} />;
}
