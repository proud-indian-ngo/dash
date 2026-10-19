import { inArray, lt, sql } from "drizzle-orm";

import { db } from "..";
import { emailStatusesBefore } from "../email-message-status";
import {
  type EmailMessageStatus,
  emailMessage,
} from "../schema/private/email-message";

/**
 * Logs notification emails Resend accepted. A retried send that Resend
 * deduped returns the same ids, and a webhook event can arrive first and
 * leave a row without its key, so an existing row gets its key and user and
 * keeps its status.
 */
export async function recordEmailMessages(
  rows: { key: string; resendEmailId: string; userId: string | null }[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db
    .insert(emailMessage)
    .values(rows)
    .onConflictDoUpdate({
      set: { key: sql`excluded.key`, userId: sql`excluded.user_id` },
      target: emailMessage.resendEmailId,
    });
}

/**
 * Records a delivery event. The row is created when the event beat the
 * send's own insert; otherwise the status only moves forward.
 */
export async function recordEmailEvent(event: {
  error: string | null;
  resendEmailId: string;
  status: EmailMessageStatus;
}): Promise<void> {
  await db
    .insert(emailMessage)
    .values(event)
    .onConflictDoUpdate({
      set: { error: sql`excluded.error`, status: sql`excluded.status` },
      setWhere: inArray(emailMessage.status, emailStatusesBefore(event.status)),
      target: emailMessage.resendEmailId,
    });
}

/** The log is for tracing recent delivery; older rows are dropped. */
export async function pruneEmailMessages(days = 90): Promise<number> {
  const rows = await db
    .delete(emailMessage)
    .where(
      lt(emailMessage.createdAt, sql`now() - make_interval(days => ${days})`)
    )
    .returning({ id: emailMessage.resendEmailId });
  return rows.length;
}
