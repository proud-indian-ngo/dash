import { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

export async function isWhatsAppTopicEnabled(
  userId: string,
  topicId: string
): Promise<boolean> {
  const prefRows = await db
    .select({ whatsappEnabled: notificationTopicPreference.whatsappEnabled })
    .from(notificationTopicPreference)
    .where(
      and(
        eq(notificationTopicPreference.userId, userId),
        eq(notificationTopicPreference.topicId, topicId)
      )
    )
    .limit(1);

  // No row = default enabled
  return prefRows[0]?.whatsappEnabled ?? true;
}

export async function getEnabledUserPhonesForTopic(
  userIds: string[],
  topicId: string
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  // Get users with phone present
  const usersWithPhone = await db
    .select({ id: user.id, phone: user.phone })
    .from(user)
    .where(and(inArray(user.id, userIds), isNotNull(user.phone)));

  if (usersWithPhone.length === 0) {
    return new Map();
  }

  // Get users who explicitly disabled this topic
  const disabledForTopic = await db
    .select({ userId: notificationTopicPreference.userId })
    .from(notificationTopicPreference)
    .where(
      and(
        inArray(
          notificationTopicPreference.userId,
          usersWithPhone.map((u) => u.id)
        ),
        eq(notificationTopicPreference.topicId, topicId),
        eq(notificationTopicPreference.whatsappEnabled, false)
      )
    );

  const disabledSet = new Set(disabledForTopic.map((r) => r.userId));

  const map = new Map<string, string>();
  for (const row of usersWithPhone) {
    if (row.phone && !disabledSet.has(row.id)) {
      map.set(row.id, row.phone);
    }
  }
  return map;
}
