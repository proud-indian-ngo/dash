import type { ExportAttachment } from "@/functions/export-csv";
import {
  getAttachmentDownloadHref,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";

export function formatExportAttachments(
  attachments: ExportAttachment[],
  origin: string
): string {
  if (attachments.length === 0) {
    return "";
  }
  return attachments
    .map((a) => {
      const href =
        a.type === "file"
          ? getAttachmentDownloadHref(a, { id: a.id, kind: a.kind })
          : getAttachmentPreviewHref(a);
      return href.startsWith("/") ? `${origin}${href}` : href;
    })
    .filter((href) => href !== "#")
    .join(" | ");
}
