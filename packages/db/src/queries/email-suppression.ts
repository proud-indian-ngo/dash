import { eq, sql } from "drizzle-orm";

import { db } from "..";
import {
  type EmailSuppressionReason,
  emailSuppression,
} from "../schema/private/email-suppression";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Records a suppression. A hard bounce replaces an earlier complaint, because
 * it also blocks auth email; a complaint never downgrades a hard bounce.
 */
export async function recordEmailSuppression(options: {
  email: string;
  reason: EmailSuppressionReason;
  resendEmailId?: string;
}): Promise<void> {
  await db
    .insert(emailSuppression)
    .values({
      email: normalizeEmail(options.email),
      reason: options.reason,
      resendEmailId: options.resendEmailId ?? null,
    })
    .onConflictDoUpdate({
      set: {
        reason: sql`case when excluded.reason = 'hard_bounce' then excluded.reason else ${emailSuppression.reason} end`,
        resendEmailId: sql`case when excluded.reason = 'hard_bounce' then excluded.resend_email_id else ${emailSuppression.resendEmailId} end`,
      },
      target: emailSuppression.email,
    });
}

export interface EmailSuppressionRecord {
  createdAt: Date;
  reason: EmailSuppressionReason;
}

export async function getEmailSuppression(
  email: string
): Promise<EmailSuppressionRecord | null> {
  const [row] = await db
    .select({
      createdAt: emailSuppression.createdAt,
      reason: emailSuppression.reason,
    })
    .from(emailSuppression)
    .where(eq(emailSuppression.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

/**
 * Auth email (verification, password reset) skips hard bounces only: the
 * mailbox can't receive mail, but someone who reported spam still asked for
 * this email.
 */
export async function isAuthEmailBlocked(email: string): Promise<boolean> {
  const suppression = await getEmailSuppression(email);
  return suppression?.reason === "hard_bounce";
}

/** Returns whether a row was removed. */
export async function clearEmailSuppression(email: string): Promise<boolean> {
  const removed = await db
    .delete(emailSuppression)
    .where(eq(emailSuppression.email, normalizeEmail(email)))
    .returning({ email: emailSuppression.email });
  return removed.length > 0;
}
