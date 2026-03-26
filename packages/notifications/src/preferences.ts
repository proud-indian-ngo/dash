import type { PreferenceStatus } from "@trycourier/courier/resources/shared";
import { createRequestLogger } from "evlog";
import { courier } from "./client";

let courierTopicIdMap: Map<string, string> | null = null;

/**
 * Fetches all Courier subscription topics and builds a name→id map.
 * Called once on first preference update, then cached in memory.
 */
async function getCourierTopicIdMap(): Promise<Map<string, string>> {
  if (courierTopicIdMap) {
    return courierTopicIdMap;
  }
  if (!courier) {
    return new Map();
  }
  const log = createRequestLogger();
  log.set({ handler: "getCourierTopicIdMap" });
  try {
    // Fetch any user's preferences to get topic_id→topic_name mappings.
    // The preferences endpoint returns all topics with their IDs.
    const resp = await courier.users.preferences.retrieve("__system__");
    const map = new Map<string, string>();
    for (const item of resp.items ?? []) {
      if (item.topic_id && item.topic_name) {
        map.set(item.topic_name, item.topic_id);
      }
    }
    courierTopicIdMap = map;
    log.set({ topicCount: map.size });
    log.emit();
    return map;
  } catch (error) {
    log.error(error instanceof Error ? error : String(error), {
      step: "fetch-courier-topics",
    });
    log.emit();
    return new Map();
  }
}

interface UpdateTopicPreferenceOptions {
  status: PreferenceStatus;
  topicId: string;
  userId: string;
}

export async function getCourierTopicId(topicName: string): Promise<string> {
  const topicMap = await getCourierTopicIdMap();
  return topicMap.get(topicName) ?? topicName;
}

export async function updateUserTopicPreference({
  userId,
  topicId,
  status,
}: UpdateTopicPreferenceOptions): Promise<void> {
  if (!courier) {
    return;
  }
  const topicMap = await getCourierTopicIdMap();
  const courierTopicId = topicMap.get(topicId) ?? topicId;
  await courier.users.preferences.updateOrCreateTopic(courierTopicId, {
    user_id: userId,
    topic: {
      status,
    },
  });
}
