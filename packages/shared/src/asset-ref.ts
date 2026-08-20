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

export type AttachmentDownloadRef =
  | { id: string; kind: "advancePaymentAttachment" }
  | { id: string; kind: "advancePaymentApprovalScreenshot" }
  | { id: string; kind: "reimbursementAttachment" }
  | { id: string; kind: "reimbursementApprovalScreenshot" }
  | { id: string; key: string; kind: "scheduledMessageAttachment" }
  | { id: string; kind: "vendorPaymentAttachment" }
  | { id: string; kind: "vendorPaymentTransactionAttachment" };

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
