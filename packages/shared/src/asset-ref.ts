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

export type AttachmentRowDownloadKind = Exclude<
  Extract<AttachmentDownloadKind, `${string}Attachment`>,
  "scheduledMessageAttachment"
>;

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

const ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMP_KEY_SEGMENT = /(^|\/)tmp\//;

export const isAssetId = (value: string): boolean =>
  ASSET_ID_PATTERN.test(value);

export const isTemporaryR2Key = (key: string): boolean =>
  TEMP_KEY_SEGMENT.test(key);
