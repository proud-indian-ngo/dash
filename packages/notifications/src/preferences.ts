import type { PreferenceStatus } from "@trycourier/courier/resources/shared";
import { courier } from "./client";

export type { TopicPreference } from "@trycourier/courier/resources/users/preferences";

export async function getAllUserPreferences(userId: string) {
  if (!courier) {
    return [];
  }
  const resp = await courier.users.preferences.retrieve(userId);
  return resp.items ?? [];
}

interface UpdateTopicPreferenceOptions {
  status: PreferenceStatus;
  topicId: string;
  userId: string;
}

export async function updateUserTopicPreference({
  userId,
  topicId,
  status,
}: UpdateTopicPreferenceOptions): Promise<void> {
  if (!courier) {
    return;
  }
  await courier.users.preferences.updateOrCreateTopic(topicId, {
    user_id: userId,
    topic: {
      status,
    },
  });
}
