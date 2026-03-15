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

const getDirectAttachmentUrl = (objectKey: string): string =>
  `${getAssetCdnBase()}/${objectKey}`;

const getImageProxyUrl = (objectKey: string): string =>
  `/cdn-cgi/image/width=320,height=320,fit=cover,format=auto,quality=80/${getDirectAttachmentUrl(objectKey)}`;

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

  return attachment.mimeType?.startsWith("image/")
    ? getImageProxyUrl(attachment.objectKey)
    : getDirectAttachmentUrl(attachment.objectKey);
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
