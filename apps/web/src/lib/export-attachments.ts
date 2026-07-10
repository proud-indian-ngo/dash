import type { AttachmentRowDownloadKind } from "@pi-dash/shared/asset-ref";
import { getProtectedAttachmentHref } from "./attachment-links";

export interface ExportAttachmentLink {
  filename: null | string;
  id: string;
  kind: AttachmentRowDownloadKind;
  mimeType: null | string;
  type: "file" | "url";
  url: null | string;
}

export const isExportableAttachment = (attachment: {
  objectKey: null | string;
  type: "file" | "url";
}): boolean => attachment.type === "url" || Boolean(attachment.objectKey);

export function groupExportAttachments<
  T extends Omit<ExportAttachmentLink, "kind"> & {
    objectKey: null | string;
    parentId: string;
  },
>(
  attachments: T[],
  kind: AttachmentRowDownloadKind
): Map<string, ExportAttachmentLink[]> {
  const grouped = new Map<string, ExportAttachmentLink[]>();
  for (const attachment of attachments) {
    if (!isExportableAttachment(attachment)) {
      continue;
    }
    const links = grouped.get(attachment.parentId) ?? [];
    links.push({
      filename: attachment.filename,
      id: attachment.id,
      kind,
      mimeType: attachment.mimeType,
      type: attachment.type,
      url: attachment.url,
    });
    grouped.set(attachment.parentId, links);
  }
  return grouped;
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
