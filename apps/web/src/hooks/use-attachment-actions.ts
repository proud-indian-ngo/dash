import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { deleteTemporaryUpload } from "@/functions/attachments";
import type { Attachment } from "@/lib/form-schemas";

interface UseAttachmentActionsParams {
  onChange: (attachments: Attachment[]) => void;
  value: Attachment[];
}

export const useAttachmentActions = ({
  onChange,
  value,
}: UseAttachmentActionsParams) => {
  const deleteAsset = useServerFn(deleteTemporaryUpload);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const removeAttachment = async (attachment: Attachment) => {
    const attachmentId = attachment.id;
    setDeletingIds((prev) => new Set(prev).add(attachmentId));

    try {
      if (
        attachment.type === "file" &&
        isTemporaryR2Key(attachment.objectKey)
      ) {
        await deleteAsset({
          data: { key: attachment.objectKey },
        });
      }

      onChange(value.filter((item) => item.id !== attachmentId));
    } catch (error) {
      log.error({
        action: "deleteAttachment",
        attachmentId,
        attachmentType: attachment.type,
        component: "useAttachmentActions",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Couldn't delete attachment");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(attachmentId);
        return next;
      });
    }
  };

  return {
    deletingIds,
    removeAttachment,
  };
};
