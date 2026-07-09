export const attachmentDownloadKindValues = [
  "advancePaymentAttachment",
  "advancePaymentApprovalScreenshot",
  "reimbursementAttachment",
  "reimbursementApprovalScreenshot",
  "scheduledMessageAttachment",
  "vendorPaymentAttachment",
  "vendorPaymentTransactionAttachment",
] as const;

export type AttachmentDownloadKind =
  (typeof attachmentDownloadKindValues)[number];

type DirectAttachmentDownloadKind = Exclude<
  AttachmentDownloadKind,
  "scheduledMessageAttachment"
>;

export type AttachmentDownloadRef =
  | {
      [K in DirectAttachmentDownloadKind]: { id: string; kind: K };
    }[DirectAttachmentDownloadKind]
  | { id: string; key: string; kind: "scheduledMessageAttachment" };

export type AttachmentAssetRef =
  | AttachmentDownloadRef
  | { id: string; kind: "eventPhoto" };

export const isAttachmentDownloadKind = (
  value: null | string
): value is AttachmentDownloadKind =>
  attachmentDownloadKindValues.includes(value as AttachmentDownloadKind);
