import { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { emailSuppression } from "@pi-dash/db/schema/private/email-suppression";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export interface ChannelPreferences {
  emailEnabled: boolean;
  inboxEnabled: boolean;
  whatsappEnabled: boolean;
}

const DEFAULTS: ChannelPreferences = {
  emailEnabled: true,
  inboxEnabled: true,
  whatsappEnabled: true,
};

export async function getChannelPreferences(
  userId: string,
  topicId: string
): Promise<ChannelPreferences> {
  const row = await db
    .select({
      emailEnabled: notificationTopicPreference.emailEnabled,
      inboxEnabled: notificationTopicPreference.inboxEnabled,
      whatsappEnabled: notificationTopicPreference.whatsappEnabled,
    })
    .from(notificationTopicPreference)
    .where(
      and(
        eq(notificationTopicPreference.userId, userId),
        eq(notificationTopicPreference.topicId, topicId)
      )
    )
    .limit(1);
  return row[0] ?? DEFAULTS;
}

export async function getBulkChannelPreferences(
  userIds: string[],
  topicId: string
): Promise<Map<string, ChannelPreferences>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      emailEnabled: notificationTopicPreference.emailEnabled,
      inboxEnabled: notificationTopicPreference.inboxEnabled,
      userId: notificationTopicPreference.userId,
      whatsappEnabled: notificationTopicPreference.whatsappEnabled,
    })
    .from(notificationTopicPreference)
    .where(
      and(
        eq(notificationTopicPreference.topicId, topicId),
        inArray(notificationTopicPreference.userId, userIds)
      )
    );

  const map = new Map<string, ChannelPreferences>();
  for (const row of rows) {
    map.set(row.userId, {
      emailEnabled: row.emailEnabled,
      inboxEnabled: row.inboxEnabled,
      whatsappEnabled: row.whatsappEnabled,
    });
  }
  return map;
}

const suppressedEmail = sql`${emailSuppression.email} = lower(${user.email})`;

/** The user's address, or null when unknown or suppressed (bounced or reported as spam). */
export async function getUserEmail(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .leftJoin(emailSuppression, suppressedEmail)
    .where(and(eq(user.id, userId), isNull(emailSuppression.email)))
    .limit(1);
  return rows[0]?.email ?? null;
}

/** Addresses by user id, leaving out unknown and suppressed users. */
export async function getBulkUserEmails(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ email: user.email, id: user.id })
    .from(user)
    .leftJoin(emailSuppression, suppressedEmail)
    .where(and(inArray(user.id, userIds), isNull(emailSuppression.email)));

  return new Map(rows.map((row) => [row.id, row.email]));
}
