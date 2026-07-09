import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { EditorProps } from "@pi-dash/editor/editor";
import { PlateEditor as BaseEditor } from "@pi-dash/editor/editor";
import { env } from "@pi-dash/env/web";
import type { AllowedImageMimeType } from "@pi-dash/shared/constants";
import { log } from "evlog";
import { toast } from "sonner";
import { getEditorImageUploadUrl } from "@/functions/attachments";

const TRAILING_SLASH = /\/$/;
function getCdnUrl(key: string): string {
  return `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;
}

interface PlateEditorProps extends Omit<EditorProps, "onImageUpload"> {
  entityId: string;
}

export function PlateEditor({ entityId, ...props }: PlateEditorProps) {
  const onImageUpload = useEventCallback(
    async (file: File): Promise<{ url: string } | undefined> => {
      try {
        const { key, presignedUrl } = await getEditorImageUploadUrl({
          data: {
            eventId: entityId,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type as AllowedImageMimeType,
          },
        });

        const uploadRes = await fetch(presignedUrl, {
          body: file,
          headers: { "Content-Type": file.type },
          method: "PUT",
        });

        if (!uploadRes.ok) {
          throw new Error(
            `Upload failed: ${uploadRes.status} ${uploadRes.statusText}`
          );
        }

        return { url: getCdnUrl(key) };
      } catch (error) {
        log.error({
          action: "imageUpload",
          component: "PlateEditor",
          entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Couldn't upload image — try again");
      }
    }
  );

  return <BaseEditor {...props} onImageUpload={onImageUpload} />;
}
