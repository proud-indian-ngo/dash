import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { deleteUploadedAsset } from "@/functions/attachments";
import type { Attachment } from "@/lib/form-schemas";

interface UseAttachmentActionsParams {
  onChange: (attachments: Attachment[]) => void;
  value: Attachment[];
}

export const useAttachmentActions = ({
  onChange,
  value,
}: UseAttachmentActionsParams) => {
  const deleteAsset = useServerFn(deleteUploadedAsset);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const removeAttachment = async (attachment: Attachment) => {
    const attachmentId = attachment.id;
    setDeletingIds((prev) => new Set(prev).add(attachmentId));

    try {
      if (attachment.type === "file") {
        await deleteAsset({
          data: { key: attachment.objectKey, subfolder: "attachments" },
        });
      }

      onChange(value.filter((item) => item.id !== attachmentId));
    } catch (error) {
      log.error({
        component: "useAttachmentActions",
        action: "deleteAttachment",
        attachmentId,
        attachmentType: attachment.type,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to delete attachment");
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
