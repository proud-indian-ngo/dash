import { sql } from "drizzle-orm";

import { db } from "..";
import {
  type EmailBatchRecipient,
  emailBatchRecipients,
} from "../schema/private/email-batch-recipients";

/** Resend keeps idempotency keys for 24 hours; a snapshot older than that no longer has to match. */
const SNAPSHOT_TTL = sql`interval '23 hours'`;
/** Snapshots are deleted once nothing can retry against them. */
const RETENTION = sql`interval '2 days'`;

/**
 * Returns the recipients a bulk email with this idempotency key was first
 * sent to, storing `recipients` when it's the first attempt (or the earlier
 * snapshot is past Resend's key window). Also deletes expired snapshots.
 */
export async function freezeEmailBatchRecipients(
  idempotencyKey: string,
  recipients: EmailBatchRecipient[]
): Promise<EmailBatchRecipient[]> {
  await db
    .delete(emailBatchRecipients)
    .where(sql`${emailBatchRecipients.createdAt} < now() - ${RETENTION}`);
  const stale = sql`${emailBatchRecipients.createdAt} < now() - ${SNAPSHOT_TTL}`;
  const [row] = await db
    .insert(emailBatchRecipients)
    .values({ idempotencyKey, recipients })
    .onConflictDoUpdate({
      set: {
        createdAt: sql`case when ${stale} then excluded.created_at else ${emailBatchRecipients.createdAt} end`,
        recipients: sql`case when ${stale} then excluded.recipients else ${emailBatchRecipients.recipients} end`,
      },
      target: emailBatchRecipients.idempotencyKey,
    })
    .returning({ recipients: emailBatchRecipients.recipients });
  return row?.recipients ?? recipients;
}
