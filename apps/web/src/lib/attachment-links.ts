import type { AttachmentDownloadRef } from "@pi-dash/shared/asset-ref";

export interface AttachmentLike {
  filename?: null | string;
  mimeType?: null | string;
  objectKey?: null | string;
  type: "file" | "url";
  url?: null | string;
}

export const getAttachmentLabel = (attachment: AttachmentLike): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "Attachment";
  }

  return attachment.filename ?? attachment.objectKey ?? "Attachment";
};

export const getProtectedAttachmentHref = (
  ref: AttachmentDownloadRef,
  disposition?: "inline"
): string => {
  const params = new URLSearchParams({ id: ref.id });
  if (ref.kind === "scheduledMessageAttachment") {
    params.set("key", ref.key);
  }
  params.set("kind", ref.kind);
  if (disposition) {
    params.set("disposition", disposition);
  }
  return `/api/attachments/download?${params.toString()}`;
};

export const getAttachmentPreviewHref = (
  attachment: AttachmentLike,
  ref?: AttachmentDownloadRef
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (!(attachment.objectKey && ref)) {
    return "#";
  }

  return getProtectedAttachmentHref(ref, "inline");
};

export const getAttachmentDownloadHref = (
  attachment: AttachmentLike,
  ref?: AttachmentDownloadRef
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (!(attachment.objectKey && ref)) {
    return "#";
  }

  return getProtectedAttachmentHref(ref);
};
