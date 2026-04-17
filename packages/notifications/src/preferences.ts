import { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { and, eq } from "drizzle-orm";

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
      userId: notificationTopicPreference.userId,
      emailEnabled: notificationTopicPreference.emailEnabled,
      inboxEnabled: notificationTopicPreference.inboxEnabled,
      whatsappEnabled: notificationTopicPreference.whatsappEnabled,
    })
    .from(notificationTopicPreference)
    .where(eq(notificationTopicPreference.topicId, topicId));

  const map = new Map<string, ChannelPreferences>();
  for (const row of rows) {
    if (userIds.includes(row.userId)) {
      map.set(row.userId, {
        emailEnabled: row.emailEnabled,
        inboxEnabled: row.inboxEnabled,
        whatsappEnabled: row.whatsappEnabled,
      });
    }
  }
  return map;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.email ?? null;
}

export async function getBulkUserEmails(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db.select({ id: user.id, email: user.email }).from(user);

  const map = new Map<string, string>();
  for (const row of rows) {
    if (userIds.includes(row.id)) {
      map.set(row.id, row.email);
    }
  }
  return map;
}
