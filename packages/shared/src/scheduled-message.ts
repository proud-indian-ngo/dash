export type ScheduledMessageDerivedStatus =
  | "pending"
  | "sent"
  | "failed"
  | "cancelled"
  | "partial";

export function deriveMessageStatus(
  recipients: ReadonlyArray<{ status: string | null }>
): ScheduledMessageDerivedStatus {
  if (recipients.length === 0) {
    return "pending";
  }
  if (recipients.every((r) => r.status === "cancelled")) {
    return "cancelled";
  }
  if (recipients.every((r) => r.status === "sent")) {
    return "sent";
  }
  if (recipients.every((r) => r.status === "failed")) {
    return "failed";
  }
  const hasSent = recipients.some((r) => r.status === "sent");
  const hasFailed = recipients.some((r) => r.status === "failed");
  if (hasSent && hasFailed) {
    return "partial";
  }
  if (hasFailed) {
    return "partial";
  }
  return "pending";
}

/** Maximum number of retry attempts per recipient (3 retries = 4 total attempts including the initial send). */
export const MAX_RECIPIENT_RETRIES = 3;
