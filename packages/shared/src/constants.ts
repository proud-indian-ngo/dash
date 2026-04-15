export const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
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

export const eventTypeValues = ["event", "class"] as const;
export type EventType = (typeof eventTypeValues)[number];

/**
 * Convert a snake_case or lowercase enum value to a human-readable title case label.
 * "bangalore" → "Bangalore", "invoice_submitted" → "Invoice Submitted", "male" → "Male"
 */
export function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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
