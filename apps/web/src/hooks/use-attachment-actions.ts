import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
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

  const removeAttachment = useCallback(
    async (attachment: Attachment) => {
      const attachmentId = attachment.id;
      setDeletingIds((prev) => new Set(prev).add(attachmentId));

      try {
        if (attachment.type === "file") {
          await deleteAsset({ data: { key: attachment.objectKey } });
        }

        onChange(value.filter((item) => item.id !== attachmentId));
      } catch {
        toast.error("Failed to delete attachment");
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(attachmentId);
          return next;
        });
      }
    },
    [deleteAsset, onChange, value]
  );

  return {
    deletingIds,
    removeAttachment,
  };
};
