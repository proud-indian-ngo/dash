export interface AttachmentLike {
  filename?: null | string;
  mimeType?: null | string;
  objectKey?: null | string;
  type: "file" | "url";
  url?: null | string;
}

export type AttachmentDownloadTarget =
  | {
      id: string;
      kind:
        | "advancePaymentAttachment"
        | "advancePaymentApprovalScreenshot"
        | "eventPhoto"
        | "reimbursementAttachment"
        | "reimbursementApprovalScreenshot"
        | "vendorPaymentAttachment"
        | "vendorPaymentTransactionAttachment";
    }
  | { id: string; key: string; kind: "scheduledMessageAttachment" };

export const getAttachmentLabel = (attachment: AttachmentLike): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "Attachment";
  }

  return attachment.filename ?? attachment.objectKey ?? "Attachment";
};

export const getAttachmentPreviewHref = (
  attachment: AttachmentLike,
  target?: AttachmentDownloadTarget
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (target) {
    return getAttachmentDownloadHref(attachment, target);
  }

  if (!attachment.objectKey) {
    return "#";
  }

  return "#";
};

export const getAttachmentDownloadHref = (
  attachment: AttachmentLike,
  target?: AttachmentDownloadTarget
): string => {
  if (attachment.type === "url") {
    return attachment.url ?? "#";
  }

  if (!target) {
    return "#";
  }

  const params = new URLSearchParams({
    filename: attachment.filename ?? "attachment",
    id: target.id,
    kind: target.kind,
  });

  if (target.kind === "scheduledMessageAttachment") {
    params.set("key", target.key);
  }

  return `/api/attachments/download?${params.toString()}`;
};
