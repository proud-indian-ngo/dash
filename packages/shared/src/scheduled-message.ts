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
  if (
    recipients.some((r) => r.status === "sent") &&
    recipients.some((r) => r.status === "failed")
  ) {
    return "partial";
  }
  return "pending";
}

export const MAX_RECIPIENT_RETRIES = 3;
