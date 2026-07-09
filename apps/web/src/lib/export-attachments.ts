import type { AttachmentDownloadRef } from "@pi-dash/shared/asset-ref";
import { getProtectedAttachmentHref } from "./attachment-links";

export interface ExportAttachmentLink {
  filename: null | string;
  id: string;
  kind: Exclude<AttachmentDownloadRef["kind"], "scheduledMessageAttachment">;
  mimeType: null | string;
  type: "file" | "url";
  url: null | string;
}

export function formatExportAttachmentLinks(
  attachments: ExportAttachmentLink[],
  origin: string
): string {
  return attachments
    .map((attachment) => {
      if (attachment.type === "url") {
        return attachment.url;
      }
      const path = getProtectedAttachmentHref({
        id: attachment.id,
        kind: attachment.kind,
      });
      return new URL(path, origin).toString();
    })
    .filter((href): href is string => Boolean(href))
    .join(" | ");
}
