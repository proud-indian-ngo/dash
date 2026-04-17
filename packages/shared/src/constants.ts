export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const VOUCHER_AMOUNT_THRESHOLD = 1000;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const cityValues = ["bangalore", "mumbai"] as const;
export type City = (typeof cityValues)[number];

export const attachmentTypeValues = ["file", "url"] as const;
export type AttachmentType = (typeof attachmentTypeValues)[number];

export const historyActionValues = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "invoice_submitted",
  "invoice_updated",
  "invoice_approved",
  "invoice_rejected",
] as const;
export type HistoryAction = (typeof historyActionValues)[number];

export const reminderTargetValues = ["participants", "group", "both"] as const;
export type ReminderTarget = (typeof reminderTargetValues)[number];
