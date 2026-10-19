import type { EmailMessageStatus } from "./schema/private/email-message";

/**
 * Resend can report events out of order, so a status only moves forward.
 * The last rank is terminal; a complaint can still follow delivery.
 */
const STATUS_RANK: Record<EmailMessageStatus, number> = {
  bounced: 3,
  complained: 3,
  delayed: 1,
  delivered: 2,
  failed: 3,
  sent: 0,
  suppressed: 3,
};

/** The statuses an email can move on from to reach `status`. */
export function emailStatusesBefore(
  status: EmailMessageStatus
): EmailMessageStatus[] {
  return (Object.keys(STATUS_RANK) as EmailMessageStatus[]).filter(
    (s) => STATUS_RANK[s] < STATUS_RANK[status]
  );
}
