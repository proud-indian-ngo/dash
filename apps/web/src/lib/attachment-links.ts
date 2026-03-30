import { env } from "@pi-dash/env/web";

export interface AttachmentLike {
  filename?: null | string;
  mimeType?: null | string;
  objectKey?: null | string;
  type: "file" | "url";
  url?: null | string;
}

const TRAILING_SLASH = /\/$/;
const getAssetCdnBase = () => env.VITE_CDN_URL.replace(TRAILING_SLASH, "");

export const getDirectAttachmentUrl = (objectKey: string): string =>
  `${getAssetCdnBase()}/${objectKey}`;

/** Cloudflare-resized thumbnail for inline `<img>` embeds (e.g. payment proof). */
export const getImageThumbnailUrl = (objectKey: string, size: number): string =>
  `${getAssetCdnBase()}/cdn-cgi/image/width=${size},height=${size},fit=cover,format=auto,quality=80/${objectKey}`;

export const getAttachmentLabel = (attachment: AttachmentLike): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "Attachment";
  }

  return attachment.filename ?? attachment.objectKey ?? "Attachment";
};

export const getAttachmentPreviewHref = (
  attachment: AttachmentLike
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (!attachment.objectKey) {
    return "#";
  }

  return getDirectAttachmentUrl(attachment.objectKey);
};

export const getAttachmentDownloadHref = (
  attachment: AttachmentLike
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (!attachment.objectKey) {
    return "#";
  }

  const params = new URLSearchParams({
    filename: attachment.filename ?? "attachment",
    key: attachment.objectKey,
  });

  return `/api/attachments/download?${params.toString()}`;
};
